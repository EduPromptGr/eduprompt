-- ================================================================
-- PHASE 2+3 CLEANUP MIGRATION
-- Τρέξε μετά από: eduprompt_db_migration.sql, class_profile_migration.sql
--
-- Audit refs εφαρμοσμένα:
--   H-1   — users.is_admin column + RLS policies
--   H-4   — get_class_stats ownership check
--   H-11  — add_school_invite atomic RPC
--   M-3   — get_objective_stats SQL aggregate
--   M-14  — nps_responses.trigger_source rename
--   M-18  — kill_switch_runs tracking (idempotency)
-- ================================================================


-- ================================================================
-- 1. USERS.IS_ADMIN COLUMN (H-1)
-- Αντικαθιστά τον email string check στις RLS policies
-- ================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Index για fast lookup σε RLS
CREATE INDEX IF NOT EXISTS idx_users_is_admin
  ON users(is_admin) WHERE is_admin = TRUE;

-- Helper function για χρήση στις RLS policies
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM users WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Refresh του admin για milestone_snapshots (παλιό: email check)
DROP POLICY IF EXISTS "admin_read_milestone_snapshots"
  ON milestone_snapshots;

CREATE POLICY "admin_read_milestone_snapshots"
  ON milestone_snapshots FOR SELECT
  USING (is_current_user_admin());

-- Bootstrap: marking τον πρώτο admin.
-- ΠΡΟΣΟΧΗ: Άλλαξε το email πριν τρέξεις αυτό το block σε production.
-- Προτιμότερο: τρέξε χειρονακτικά το SQL που γίνεται uncomment κάτω
-- αφού έχεις δημιουργήσει τον αρχικό χρήστη.
--
-- UPDATE users
--   SET is_admin = TRUE
--   WHERE email = 'hello@eduprompt.gr';


-- ================================================================
-- 2. GET_CLASS_STATS OWNERSHIP CHECK (H-4)
-- ================================================================

CREATE OR REPLACE FUNCTION get_class_stats(p_profile_id UUID)
RETURNS JSONB AS $$
DECLARE
  owner_id UUID;
  result JSONB;
BEGIN
  -- Επιβεβαίωσε ότι ο current user κατέχει το profile
  SELECT user_id INTO owner_id
    FROM class_profiles
    WHERE id = p_profile_id;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF owner_id != auth.uid() AND NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  -- Υπόλοιπο logic αμετάβλητο
  SELECT jsonb_build_object(
    'total_activities', COUNT(*),
    'excellent_rate', ROUND(
      COUNT(*) FILTER (WHERE outcome = 'excellent')::DECIMAL
      / NULLIF(COUNT(*), 0) * 100, 1
    ),
    'poor_rate', ROUND(
      COUNT(*) FILTER (WHERE outcome = 'poor')::DECIMAL
      / NULLIF(COUNT(*), 0) * 100, 1
    ),
    'most_active_subject', (
      SELECT subject FROM class_activity_logs
      WHERE class_profile_id = p_profile_id
      GROUP BY subject ORDER BY COUNT(*) DESC LIMIT 1
    ),
    'last_7_days', COUNT(*)
      FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')
  ) INTO result
  FROM class_activity_logs
  WHERE class_profile_id = p_profile_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ================================================================
-- 3. ADD_SCHOOL_INVITE ATOMIC RPC (H-11)
-- Advisory lock για αποφυγή race conditions στο 30-member limit
-- ================================================================

CREATE OR REPLACE FUNCTION add_school_invite(
  p_owner_id UUID,
  p_email TEXT,
  p_max_members INTEGER DEFAULT 30
)
RETURNS TABLE(token TEXT, expires_at TIMESTAMPTZ) AS $$
DECLARE
  current_count INTEGER;
  pending_invites INTEGER;
  new_token TEXT;
  new_expires TIMESTAMPTZ;
BEGIN
  -- Μόνο ο owner ή admin μπορεί να καλέσει
  IF p_owner_id != auth.uid() AND NOT is_current_user_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock per owner — serialize όλες τις ταυτόχρονες invites
  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::TEXT));

  -- Count active members + pending invites για αποτροπή over-subscription
  SELECT COUNT(*) INTO current_count
    FROM school_members
    WHERE school_owner_id = p_owner_id
      AND status = 'active';

  SELECT COUNT(*) INTO pending_invites
    FROM school_invites
    WHERE school_owner_id = p_owner_id
      AND status = 'pending'
      AND expires_at > NOW();

  IF (current_count + pending_invites) >= p_max_members THEN
    RAISE EXCEPTION 'limit_reached' USING ERRCODE = 'P0001';
  END IF;

  new_token := encode(gen_random_bytes(32), 'hex');
  new_expires := NOW() + INTERVAL '7 days';

  INSERT INTO school_invites (
    school_owner_id, email, token, status, expires_at
  ) VALUES (
    p_owner_id, LOWER(p_email), new_token, 'pending', new_expires
  );

  RETURN QUERY SELECT new_token, new_expires;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ================================================================
-- 4. GET_OBJECTIVE_STATS RPC (M-3)
-- Αντικαθιστά το Python-side aggregation του get_flywheel_stats
-- που τραβούσε ολόκληρο το prompts table σε μνήμη.
-- ================================================================

CREATE OR REPLACE FUNCTION get_objective_stats()
RETURNS TABLE(
  total_objectives_seen INTEGER,
  optimized_objectives INTEGER,
  optimization_rate DECIMAL
) AS $$
  WITH objective_counts AS (
    SELECT grade, subject, objective, COUNT(*) AS uses
    FROM prompts
    WHERE rating IS NOT NULL
    GROUP BY grade, subject, objective
  )
  SELECT
    COUNT(*)::INTEGER AS total_objectives_seen,
    COUNT(*) FILTER (WHERE uses >= 10)::INTEGER AS optimized_objectives,
    CASE
      WHEN COUNT(*) = 0 THEN 0.0
      ELSE ROUND(
        COUNT(*) FILTER (WHERE uses >= 10)::DECIMAL
        / COUNT(*) * 100, 1
      )
    END AS optimization_rate
  FROM objective_counts;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ================================================================
-- 5. NPS_RESPONSES COLUMN RENAME (M-14)
-- triggered_at → trigger_source (TEXT, όχι timestamp)
-- + νέα triggered_at TIMESTAMPTZ για actual timestamp
-- ================================================================

DO $$
BEGIN
  -- Rename μόνο αν υπάρχει και είναι ήδη TEXT (παλιός χρήστες)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nps_responses'
      AND column_name = 'triggered_at'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE nps_responses
      RENAME COLUMN triggered_at TO trigger_source;
  END IF;

  -- Αν δεν υπάρχει trigger_source, πρόσθεσέ το
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nps_responses'
      AND column_name = 'trigger_source'
  ) THEN
    ALTER TABLE nps_responses
      ADD COLUMN trigger_source TEXT;
  END IF;

  -- Timestamp column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nps_responses'
      AND column_name = 'triggered_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE nps_responses
      ADD COLUMN triggered_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;


-- ================================================================
-- 6. KILL_SWITCH_RUNS TRACKING (M-18)
-- Αποφεύγει χάσιμο milestones αν το cron χάσει μια εκτέλεση.
-- ================================================================

CREATE TABLE IF NOT EXISTS kill_switch_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_month INTEGER NOT NULL,  -- 3, 6, 12
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  kill_switch_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  metrics JSONB,
  failures JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(milestone_month)  -- μία εγγραφή ανά milestone
);

ALTER TABLE kill_switch_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_kill_switch_runs"
  ON kill_switch_runs FOR SELECT
  USING (is_current_user_admin());

CREATE POLICY "service_write_kill_switch_runs"
  ON kill_switch_runs FOR ALL
  USING (auth.role() = 'service_role');


-- ================================================================
-- 7. UPDATED_AT TRIGGER HELPERS (L-4)
-- Auto-update του updated_at column σε κάθε UPDATE
-- ================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Εφαρμογή σε class_profiles και class_subject_progress
DROP TRIGGER IF EXISTS tr_class_profiles_updated_at ON class_profiles;
CREATE TRIGGER tr_class_profiles_updated_at
  BEFORE UPDATE ON class_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS tr_class_subject_progress_updated_at
  ON class_subject_progress;
CREATE TRIGGER tr_class_subject_progress_updated_at
  BEFORE UPDATE ON class_subject_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ================================================================
-- 8. MISSING INDEXES (M-13)
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_activity_logs_user
  ON class_activity_logs(user_id, created_at DESC);

-- Rename misnamed index (L-1)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_quality_signals_grade_subject'
  ) THEN
    ALTER INDEX idx_quality_signals_grade_subject
      RENAME TO idx_prompts_grade_subject_objective;
  END IF;
END $$;


-- ================================================================
-- Complete
-- ================================================================

SELECT 'Phase 2+3 cleanup migration complete ✅' AS status;
