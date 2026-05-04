-- ================================================================
-- EDUPROMPT — PHASE 3 CORE TABLES
-- Migration: 20260422000000_phase3_core_tables.sql
--
-- ΤΙ ΠΕΡΙΕΧΕΙ:
--   1. users.subscription_status + stripe_customer_id + stripe_subscription_id + is_admin
--      (missing columns που αναφέρονται σε seed.sql, Stripe webhook, RLS policies,
--       και τα RPCs get_current_mrr / business_health)
--   2. prompts                 — κύρια οντότητα: κάθε generated σενάριο
--   3. error_reports           — user-reported λάθη σε prompts (validation framework)
--   4. journal                 — teacher reflections after classroom use
--   5. Triggers + Indexes + RLS policies + Views
--
-- ΓΙΑΤΙ ΥΠΑΡΧΕΙ:
-- Το base migration (20260101000000_eduprompt_base.sql) αναφέρει αυτούς τους
-- πίνακες σε πολλά σημεία (FK από prompt_quality_signals, triggers πάνω σε
-- prompts, RPCs που διαβάζουν από prompts/journal/error_reports, view
-- business_health που μετρά error_reports) αλλά ΠΟΤΕ ΔΕΝ ΤΟΥΣ ΔΗΜΙΟΥΡΓΕΙ.
--
-- Πρέπει να τρέξει ΠΡΙΝ από οποιαδήποτε χρήση του generate endpoint σε
-- production — αλλιώς όλα τα INSERT INTO prompts θα σκάσουν.
--
-- ΣΕΙΡΑ ΕΚΤΕΛΕΣΗΣ:
--   20260101000000_eduprompt_base.sql      — users + referrals + school_* + usage_stats
--                                              + subscription_events + prompt_quality_signals
--                                              + milestone_snapshots + nps_responses + RPCs/views
--   20260201000000_class_profile.sql        — class_profiles
--   20260421000000_phase2_cleanup.sql       — phase 2 cleanup
--   20260422000000_phase3_core_tables.sql   — ΑΥΤΟ (prompts/error_reports/journal)
--
-- ΠΡΟΣΟΧΗ: Τα RPCs (get_current_mrr, update_last_active, get_top_subjects, κ.ά.)
-- και το view business_health ΟΡΙΖΟΝΤΑΙ στο base migration πριν υπάρχει ο πίνακας
-- prompts. Αυτό δουλεύει στην PostgreSQL γιατί τα SQL functions / views κάνουν lazy
-- resolve στα table references κατά την πρώτη κλήση. Άρα: τρέξε το base πρώτο,
-- μετά αυτό.
-- ================================================================


-- ================================================================
-- ΒΗΜΑ 1: USERS — συμπλήρωσε τις στήλες που λείπουν
-- Χωρίς αυτές δεν δουλεύουν: Stripe webhook, get_current_mrr,
-- business_health, seed.sql, RLS για admin
-- ================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_status TEXT
    NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'pro', 'school')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Γρήγορη ανάκτηση από Stripe webhook (WHERE stripe_customer_id = ?)
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer
  ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Queries όπως "πόσοι pro users;" (WHERE subscription_status = 'pro')
CREATE INDEX IF NOT EXISTS idx_users_subscription_status
  ON users(subscription_status)
  WHERE subscription_status != 'free';


-- ================================================================
-- ΒΗΜΑ 2: PROMPTS — κάθε generated διδακτικό σενάριο
-- Το κεντρικό αντικείμενο του EduPrompt. FK από:
--   prompt_quality_signals, error_reports, journal
-- Αναφέρεται σε triggers (update_last_active, update_monthly_usage)
-- και σε ~8 RPCs (top subjects, avg rating, quality score κλπ)
-- ================================================================

CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  -- ── ΕΙΣΟΔΟΣ από τον δάσκαλο (GenerateInput) ─────────────────
  grade TEXT NOT NULL
    CHECK (grade IN ('Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ')),
  subject TEXT NOT NULL
    CHECK (length(subject) BETWEEN 1 AND 100),
  objective TEXT NOT NULL
    CHECK (length(objective) BETWEEN 1 AND 500),

  -- ── ΠΑΙΔΑΓΩΓΙΚΕΣ ΕΠΙΛΟΓΕΣ ────────────────────────────────────
  -- Μπορούν να είναι NULL όταν data-driven (τα επιλέγει το σύστημα)
  theory TEXT,           -- π.χ. 'vygotsky_zpd', 'bloom', 'piaget'
  strategy TEXT,         -- π.χ. 'inquiry_based', 'project_based'
  environments TEXT[],   -- π.χ. ['classroom', 'outdoor']

  -- ── CONTEXT ──────────────────────────────────────────────────
  class_profile_id UUID
    REFERENCES class_profiles(id) ON DELETE SET NULL,
  unit TEXT,             -- ενότητα ΑΠΣ (προαιρετικά)

  -- ── OUTPUT από το LLM ────────────────────────────────────────
  title TEXT NOT NULL DEFAULT '',
  body JSONB NOT NULL,   -- full scenario structure (objectives, activities, ...)

  -- ── METADATA ─────────────────────────────────────────────────
  -- True όταν theory/strategy επιλέχθηκαν data-driven από ιστορικά
  data_driven BOOLEAN NOT NULL DEFAULT false,

  -- ── USER FEEDBACK ─────────────────────────────────────────────
  -- 1-5 αστέρια (null = δεν έχει αξιολογηθεί ακόμα)
  rating SMALLINT
    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  rated_at TIMESTAMPTZ,

  -- True όταν ο user πάτησε "αποθήκευση" στο UI
  saved BOOLEAN NOT NULL DEFAULT false,
  saved_at TIMESTAMPTZ,

  -- ── TIMESTAMPS ───────────────────────────────────────────────
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Flywheel query: "βρες τα καλύτερα prompts για αυτόν τον στόχο ΑΠΣ"
-- (χρησιμοποιείται από get_objective_quality_score, get_top_subjects)
CREATE INDEX IF NOT EXISTS idx_prompts_grade_subject_objective
  ON prompts(grade, subject, objective);

-- User timeline: "όλα τα prompts μου πρόσφατα"
CREATE INDEX IF NOT EXISTS idx_prompts_user_created
  ON prompts(user_id, created_at DESC);

-- Rate-limiter: COUNT prompts WHERE user_id=? AND created_at >= start_of_month
-- Ο παραπάνω composite index καλύπτει αυτό το query, άρα ΔΕΝ προσθέτουμε extra.

-- Saved list: "τα αποθηκευμένα μου"
CREATE INDEX IF NOT EXISTS idx_prompts_user_saved
  ON prompts(user_id, saved_at DESC)
  WHERE saved = true;

-- avg_rating queries (get_avg_rating_last_days, get_top_subjects)
CREATE INDEX IF NOT EXISTS idx_prompts_rating
  ON prompts(rating, created_at)
  WHERE rating IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_prompt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  -- Αν άλλαξε το rating και δεν υπάρχει rated_at, βάλ' το
  IF NEW.rating IS DISTINCT FROM OLD.rating AND NEW.rating IS NOT NULL THEN
    NEW.rated_at := COALESCE(NEW.rated_at, NOW());
  END IF;
  -- Το ίδιο για saved
  IF NEW.saved IS DISTINCT FROM OLD.saved AND NEW.saved = true THEN
    NEW.saved_at := COALESCE(NEW.saved_at, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prompts_updated_at ON prompts;
CREATE TRIGGER trigger_prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW
  EXECUTE FUNCTION set_prompt_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

-- Ο user βλέπει μόνο τα δικά του prompts
CREATE POLICY "users_view_own_prompts"
ON prompts FOR SELECT
USING (user_id = auth.uid());

-- Insert: μόνο το service role γράφει (το κάνει το FastAPI backend)
-- Αυτό είναι σημαντικό για security: ο user δεν μπορεί να γράψει κατευθείαν
-- στη βάση χωρίς να περάσει από το rate-limiter / prompt validation
CREATE POLICY "service_role_insert_prompts"
ON prompts FOR INSERT
TO service_role
WITH CHECK (true);

-- Update: ο user μπορεί να αλλάξει ΜΟΝΟ rating + saved των δικών του prompts
CREATE POLICY "users_update_own_prompt_feedback"
ON prompts FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Delete: μόνο ο ίδιος ο χρήστης ή service role (για GDPR μηχανισμούς)
CREATE POLICY "users_delete_own_prompts"
ON prompts FOR DELETE
USING (user_id = auth.uid());

-- Service role + school owner βλέπουν τα πάντα (για school reports)
CREATE POLICY "service_role_all_prompts"
ON prompts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "school_owner_view_member_prompts"
ON prompts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM school_members sm
    WHERE sm.member_id = prompts.user_id
      AND sm.school_owner_id = auth.uid()
      AND sm.status = 'active'
  )
);

-- Column-level grants:
-- Το RLS policy "users_update_own_prompt_feedback" επιτρέπει UPDATE αλλά δεν
-- περιορίζει ΠΟΙΕΣ στήλες — το κάνουμε με column-level GRANTs ώστε ο user να
-- μπορεί να αλλάξει ΜΟΝΟ rating + saved (και τα timestamps τους) και όχι
-- π.χ. το theory ή το body που θα αλλοίωνε το flywheel.
REVOKE UPDATE ON prompts FROM authenticated;
GRANT UPDATE (rating, rated_at, saved, saved_at) ON prompts TO authenticated;
GRANT SELECT, DELETE ON prompts TO authenticated;


-- ================================================================
-- ΒΗΜΑ 3: ERROR_REPORTS — user-reported λάθη σε prompts
-- Χρησιμοποιείται από το validation framework + flywheel
-- Αναφέρεται σε: view business_health, business_metrics.py (_flag_for_review)
-- ================================================================

CREATE TABLE IF NOT EXISTS error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL
    REFERENCES prompts(id) ON DELETE CASCADE,

  -- ── Τι ανέφερε ο user ────────────────────────────────────────
  category TEXT NOT NULL
    CHECK (category IN (
      'pedagogical_error',       -- λάθος εφαρμογή θεωρίας
      'curriculum_mismatch',     -- δεν ταιριάζει με το ΑΠΣ
      'inappropriate_content',   -- ακατάλληλο περιεχόμενο
      'factual_error',           -- πραγματολογικό λάθος
      'language_quality',        -- γλωσσικά λάθη
      'other'
    )),
  description TEXT NOT NULL
    CHECK (length(description) BETWEEN 1 AND 2000),

  -- ── Workflow state ───────────────────────────────────────────
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  -- Ποιος το έλυσε; (admin user) και πώς;
  resolved_by UUID
    REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,

  -- ── Timestamps ───────────────────────────────────────────────
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Δεν μπορείς να κάνεις 2 reports στο ίδιο prompt από τον ίδιο user
  UNIQUE(prompt_id, user_id)
);

-- business_health view: COUNT WHERE status = 'pending'
CREATE INDEX IF NOT EXISTS idx_error_reports_status_priority
  ON error_reports(status, priority, created_at DESC);

-- Prompt drill-down: "έχει αυτό το prompt reports;"
CREATE INDEX IF NOT EXISTS idx_error_reports_prompt
  ON error_reports(prompt_id);

-- User's own list
CREATE INDEX IF NOT EXISTS idx_error_reports_user
  ON error_reports(user_id, created_at DESC);

-- updated_at trigger (re-use ίδια λογική, δική της function για clarity)
CREATE OR REPLACE FUNCTION set_error_report_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  -- Auto-set resolved_at όταν status γίνεται resolved/dismissed
  IF NEW.status IN ('resolved', 'dismissed')
     AND OLD.status NOT IN ('resolved', 'dismissed') THEN
    NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_error_reports_updated_at ON error_reports;
CREATE TRIGGER trigger_error_reports_updated_at
  BEFORE UPDATE ON error_reports
  FOR EACH ROW
  EXECUTE FUNCTION set_error_report_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE error_reports ENABLE ROW LEVEL SECURITY;

-- User βλέπει τα δικά του reports
CREATE POLICY "users_view_own_error_reports"
ON error_reports FOR SELECT
USING (user_id = auth.uid());

-- User μπορεί να φτιάξει report για prompts ΠΟΥ ΤΟΥ ΑΝΗΚΟΥΝ
-- (security: αλλιώς θα μπορούσε να σπαμάρει reports για ξένα prompts)
CREATE POLICY "users_insert_own_error_reports"
ON error_reports FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM prompts p
    WHERE p.id = error_reports.prompt_id
      AND p.user_id = auth.uid()
  )
);

-- Admin (is_admin = true) βλέπει τα πάντα για review
CREATE POLICY "admins_view_all_error_reports"
ON error_reports FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.is_admin = true
  )
);

-- Admin + service role κάνουν update (triage, resolution)
CREATE POLICY "admins_update_error_reports"
ON error_reports FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.is_admin = true
  )
);

CREATE POLICY "service_role_all_error_reports"
ON error_reports FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ================================================================
-- ΒΗΜΑ 4: JOURNAL — αναστοχασμοί δασκάλων μετά την εφαρμογή
-- Αναφέρεται σε: get_feature_usage_monthly() στο base migration
-- ================================================================

CREATE TABLE IF NOT EXISTS journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  prompt_id UUID
    REFERENCES prompts(id) ON DELETE CASCADE,
  -- prompt_id μπορεί να είναι NULL (free-form reflection)

  -- ── Η ουσία ──────────────────────────────────────────────────
  title TEXT
    CHECK (title IS NULL OR length(title) BETWEEN 1 AND 200),
  reflection_text TEXT NOT NULL
    CHECK (length(reflection_text) BETWEEN 1 AND 10000),

  -- ── Structured feedback (optional) ───────────────────────────
  -- Πώς πήγε συνολικά το μάθημα;
  overall_rating SMALLINT
    CHECK (overall_rating IS NULL OR overall_rating BETWEEN 1 AND 5),
  -- Πόσοι μαθητές πέτυχαν τον στόχο; (αυτο-αναφορά)
  students_engaged_pct SMALLINT
    CHECK (students_engaged_pct IS NULL OR students_engaged_pct BETWEEN 0 AND 100),

  -- ── Tags για ανάλυση ────────────────────────────────────────
  -- π.χ. ['worked_well', 'need_differentiation', 'time_exceeded']
  tags TEXT[],

  -- Ημερομηνία εφαρμογής (μπορεί να διαφέρει από τη δημιουργία journal entry)
  applied_on DATE,

  -- ── Timestamps ───────────────────────────────────────────────
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User's journal timeline
CREATE INDEX IF NOT EXISTS idx_journal_user_created
  ON journal(user_id, created_at DESC);

-- Linked to specific prompt (για το "δες τι είπαν οι άλλοι για αυτό το σενάριο")
CREATE INDEX IF NOT EXISTS idx_journal_prompt
  ON journal(prompt_id)
  WHERE prompt_id IS NOT NULL;

-- Feature usage query (get_feature_usage_monthly COUNT(*) FROM journal
-- WHERE created_at >= date_trunc('month', NOW()))
CREATE INDEX IF NOT EXISTS idx_journal_created
  ON journal(created_at);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_journal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_journal_updated_at ON journal;
CREATE TRIGGER trigger_journal_updated_at
  BEFORE UPDATE ON journal
  FOR EACH ROW
  EXECUTE FUNCTION set_journal_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;

-- Ο user βλέπει / γράφει / επεξεργάζεται / σβήνει ΜΟΝΟ τα δικά του
CREATE POLICY "users_crud_own_journal"
ON journal FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- School owner βλέπει τα journals των μελών (για το school report)
CREATE POLICY "school_owner_view_member_journals"
ON journal FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM school_members sm
    WHERE sm.member_id = journal.user_id
      AND sm.school_owner_id = auth.uid()
      AND sm.status = 'active'
  )
);

-- Service role για analytics
CREATE POLICY "service_role_all_journal"
ON journal FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ================================================================
-- ΒΗΜΑ 5: HELPFUL RPCS για τα νέα tables
-- ================================================================

-- Report a prompt-level error με ένα atomic call (auth.uid() derived)
-- Ο user δεν περνάει user_id — το παίρνουμε από το session ώστε να μην
-- μπορεί κάποιος να σπαμάρει reports με άλλα user_ids.
CREATE OR REPLACE FUNCTION record_error_report(
  p_prompt_id UUID,
  p_category TEXT,
  p_description TEXT
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
  current_uid UUID := auth.uid();
BEGIN
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Confirm ότι το prompt ανήκει στον user (αλλιώς θα μπορούσε να
  -- δηλώσει λάθος σε ξένο prompt)
  IF NOT EXISTS (
    SELECT 1 FROM prompts p
    WHERE p.id = p_prompt_id AND p.user_id = current_uid
  ) THEN
    RAISE EXCEPTION 'Prompt not found or not owned by user';
  END IF;

  INSERT INTO error_reports (user_id, prompt_id, category, description)
  VALUES (current_uid, p_prompt_id, p_category, p_description)
  ON CONFLICT (prompt_id, user_id)
  DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = NOW()
  RETURNING id INTO new_id;

  -- Ρίξε επίσης ένα quality signal
  INSERT INTO prompt_quality_signals (prompt_id, user_id, signal_type, weight)
  VALUES (p_prompt_id, current_uid, 'error_reported', 2.0)
  ON CONFLICT DO NOTHING;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Rate a prompt + trigger quality signal (auth.uid() derived)
CREATE OR REPLACE FUNCTION rate_prompt(
  p_prompt_id UUID,
  p_rating SMALLINT
)
RETURNS VOID AS $$
DECLARE
  current_uid UUID := auth.uid();
  affected INTEGER;
BEGIN
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  UPDATE prompts
  SET rating = p_rating,
      rated_at = NOW()
  WHERE id = p_prompt_id
    AND user_id = current_uid;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN
    RAISE EXCEPTION 'Prompt not found or not owned by user';
  END IF;

  -- Quality signal per rating bucket
  -- 4-5 stars = high_rating (w=1.5)
  -- 1-2 stars = low_rating  (w=1.5)
  -- 3 stars   = neutral -> low-weight high_rating (w=0.5)
  INSERT INTO prompt_quality_signals (prompt_id, user_id, signal_type, weight)
  VALUES (
    p_prompt_id,
    current_uid,
    CASE
      WHEN p_rating >= 4 THEN 'high_rating'
      WHEN p_rating <= 2 THEN 'low_rating'
      ELSE 'high_rating'
    END,
    CASE
      WHEN p_rating >= 4 THEN 1.5
      WHEN p_rating <= 2 THEN 1.5
      ELSE 0.5
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ================================================================
-- STEP 6: POST-MIGRATION VERIFICATION (dry-run safe)
-- ================================================================

DO $$
BEGIN
  -- Tables
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'prompts'),
    'Table prompts should exist after migration';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'error_reports'),
    'Table error_reports should exist after migration';
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'journal'),
    'Table journal should exist after migration';

  -- Users columns
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'users'
                 AND column_name = 'subscription_status'),
    'users.subscription_status should exist';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'users'
                 AND column_name = 'stripe_customer_id'),
    'users.stripe_customer_id should exist';
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'users'
                 AND column_name = 'is_admin'),
    'users.is_admin should exist';

  -- RPCs
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rate_prompt'),
    'rate_prompt RPC should exist';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'record_error_report'),
    'record_error_report RPC should exist';

  RAISE NOTICE 'Phase 3 core tables migration: OK';
END $$;
