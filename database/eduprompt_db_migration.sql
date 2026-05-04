-- ================================================================
-- EDUPROMPT — ΠΛΗΡΕΣ DATABASE MIGRATION
-- Εκτέλεσε αυτό στο Supabase SQL Editor
-- Σειρά εκτέλεσης: από πάνω προς τα κάτω
-- ================================================================


-- ================================================================
-- ΒΗΜΑ 1: ΝΕΕΣ ΣΤΗΛΕΣ ΣΤΟΝ ΠΙΝΑΚΑ USERS
-- Εκτέλεσε ΠΡΩΤΟ — οι υπόλοιποι πίνακες εξαρτώνται από αυτό
-- ================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE
    DEFAULT upper(substring(
      replace(gen_random_uuid()::text, '-', ''), 1, 8
    )),
  ADD COLUMN IF NOT EXISTS referred_by UUID
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pause_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS school_owner_id UUID
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onboarding_completed
    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at
    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_experience TEXT
    DEFAULT 'none'
    CHECK (ai_experience IN ('none', 'sometimes', 'regular')),
  ADD COLUMN IF NOT EXISTS ltv_total
    DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_prompt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Γέμισε τα κενά referral_codes για υπάρχοντες χρήστες
UPDATE users
SET referral_code = upper(substring(
  replace(gen_random_uuid()::text, '-', ''), 1, 8
))
WHERE referral_code IS NULL;

-- Index για γρήγορη αναζήτηση
CREATE INDEX IF NOT EXISTS idx_users_referral_code
  ON users(referral_code);

CREATE INDEX IF NOT EXISTS idx_users_school_owner
  ON users(school_owner_id)
  WHERE school_owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_last_active
  ON users(last_active_at DESC)
  WHERE last_active_at IS NOT NULL;


-- ================================================================
-- ΒΗΜΑ 2: ΠΙΝΑΚΑΣ REFERRALS
-- Παρακολουθεί ποιος έφερε ποιον + αν δόθηκε reward
-- ================================================================

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'rewarded', 'expired')),
  reward_type TEXT DEFAULT 'free_month'
    CHECK (reward_type IN ('free_month', 'credits', 'discount')),
  reward_value DECIMAL(10,2) DEFAULT 14.99,
  stripe_credit_id TEXT,         -- ID από το Stripe credit
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referrer_id, referred_id),
  CHECK (referrer_id != referred_id)  -- δεν μπορείς να παραπέμψεις τον εαυτό σου
);

-- RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_referrals"
ON referrals FOR SELECT
USING (
  referrer_id = auth.uid() OR
  referred_id = auth.uid()
);

CREATE POLICY "insert_referral"
ON referrals FOR INSERT
WITH CHECK (referred_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals(referrer_id, status);

CREATE INDEX IF NOT EXISTS idx_referrals_referred
  ON referrals(referred_id);


-- ================================================================
-- ΒΗΜΑ 3: ΠΙΝΑΚΑΣ SCHOOL_MEMBERS
-- Συνδέει εκπαιδευτικούς με school plan account
-- ================================================================

CREATE TABLE IF NOT EXISTS school_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_owner_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'removed')),
  daily_prompts_used INTEGER DEFAULT 0,  -- reset κάθε μέρα
  daily_reset_at DATE DEFAULT CURRENT_DATE,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  UNIQUE(school_owner_id, member_id)
);

-- RLS
ALTER TABLE school_members ENABLE ROW LEVEL SECURITY;

-- School owner βλέπει και διαχειρίζεται τα μέλη του
CREATE POLICY "school_owner_full_access"
ON school_members FOR ALL
USING (school_owner_id = auth.uid());

-- Μέλος βλέπει τη δική του εγγραφή
CREATE POLICY "member_view_own"
ON school_members FOR SELECT
USING (member_id = auth.uid());

-- Index
CREATE INDEX IF NOT EXISTS idx_school_members_owner
  ON school_members(school_owner_id, status);

CREATE INDEX IF NOT EXISTS idx_school_members_member
  ON school_members(member_id);


-- ================================================================
-- ΒΗΜΑ 4: ΠΙΝΑΚΑΣ SCHOOL_INVITES
-- Tokens για πρόσκληση νέων μελών στο school plan
-- ================================================================

CREATE TABLE IF NOT EXISTS school_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_owner_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL
    DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE school_invites ENABLE ROW LEVEL SECURITY;

-- School owner διαχειρίζεται τα invites του
CREATE POLICY "school_owner_invites"
ON school_invites FOR ALL
USING (school_owner_id = auth.uid());

-- Οποιοσδήποτε μπορεί να δει ένα invite με το token
-- (για validation κατά την εγγραφή)
CREATE POLICY "public_view_by_token"
ON school_invites FOR SELECT
USING (true);  -- το filtering γίνεται στον κώδικα με το token

-- Index
CREATE INDEX IF NOT EXISTS idx_school_invites_token
  ON school_invites(token)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_school_invites_owner
  ON school_invites(school_owner_id, status);

-- Auto-expire: τρέχει κάθε βράδυ μέσω cron
-- (προσθέτουμε στο Railway cron: python scripts/expire_invites.py)


-- ================================================================
-- ΒΗΜΑ 5: ΠΙΝΑΚΑΣ USAGE_STATS
-- Μηνιαία στατιστικά ανά χρήστη — για school reports
-- ================================================================

CREATE TABLE IF NOT EXISTS usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,  -- format: '2025-09'
  prompts_generated INTEGER DEFAULT 0,
  prompts_differentiated INTEGER DEFAULT 0,
  prompts_saved INTEGER DEFAULT 0,
  prompts_rated INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  top_subject TEXT,
  top_grade TEXT,
  features_used JSONB DEFAULT '{}',
  -- π.χ. {"worksheet": 3, "journal": 5, "differentiation": 2}
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- RLS
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;

-- Χρήστης βλέπει τα δικά του stats
CREATE POLICY "view_own_usage_stats"
ON usage_stats FOR SELECT
USING (user_id = auth.uid());

-- School owner βλέπει stats μελών
CREATE POLICY "school_owner_view_member_stats"
ON usage_stats FOR SELECT
USING (
  user_id IN (
    SELECT member_id FROM school_members
    WHERE school_owner_id = auth.uid()
      AND status = 'active'
  )
);

-- Backend μπορεί να γράφει (service role)
CREATE POLICY "service_role_write_stats"
ON usage_stats FOR ALL
USING (auth.role() = 'service_role');

-- Index
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_month
  ON usage_stats(user_id, month DESC);


-- ================================================================
-- ΒΗΜΑ 6: ΠΙΝΑΚΑΣ SUBSCRIPTION_EVENTS
-- Για LTV calculation και cohort analysis
-- ================================================================

CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'trial_start', 'converted', 'churned',
      'reactivated', 'upgraded', 'downgraded',
      'paused', 'resumed', 'refunded'
    )),
  plan TEXT CHECK (plan IN ('free', 'pro', 'school')),
  mrr_impact DECIMAL(10,2) DEFAULT 0,
  -- θετικό = έσοδο, αρνητικό = απώλεια
  stripe_event_id TEXT UNIQUE,  -- για deduplication
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS — μόνο service role γράφει, χρήστης βλέπει τα δικά του
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_own_subscription_events"
ON subscription_events FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "service_role_write_events"
ON subscription_events FOR ALL
USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sub_events_user
  ON subscription_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_events_type
  ON subscription_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_events_stripe
  ON subscription_events(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;


-- ================================================================
-- ΒΗΜΑ 7: ΠΙΝΑΚΑΣ PROMPT_QUALITY_SIGNALS
-- Data flywheel — κάθε action βελτιώνει μελλοντικά prompts
-- ================================================================

CREATE TABLE IF NOT EXISTS prompt_quality_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL
    REFERENCES prompts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL
    CHECK (signal_type IN (
      'high_rating',        -- 4-5 αστέρια
      'low_rating',         -- 1-2 αστέρια
      'saved',              -- αποθηκεύτηκε
      'differentiated',     -- ζητήθηκε διαφοροποίηση
      'error_reported',     -- αναφέρθηκε λάθος
      'shared_top_prompts', -- κοινοποιήθηκε
      'copied'              -- αντιγράφηκε
    )),
  weight DECIMAL(3,2) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE prompt_quality_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_insert_own_signals"
ON prompt_quality_signals FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_all"
ON prompt_quality_signals FOR ALL
USING (auth.role() = 'service_role');

-- Index για flywheel queries
CREATE INDEX IF NOT EXISTS idx_quality_signals_prompt
  ON prompt_quality_signals(prompt_id, signal_type);

CREATE INDEX IF NOT EXISTS idx_quality_signals_grade_subject
  ON prompts(grade, subject, objective)
  WHERE rating IS NOT NULL;


-- ================================================================
-- ΒΗΜΑ 8: RPC FUNCTIONS
-- Χρησιμοποιούνται από τον κώδικα για analytics
-- ================================================================

-- 8a. Increment LTV όταν χρήστης πληρώνει
CREATE OR REPLACE FUNCTION increment_user_ltv(
  p_user_id UUID,
  p_amount DECIMAL
)
RETURNS VOID AS $$
  UPDATE users
  SET ltv_total = COALESCE(ltv_total, 0) + p_amount
  WHERE id = p_user_id;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8b. Update last_active_at κάθε φορά που δημιουργείται prompt
CREATE OR REPLACE FUNCTION update_last_active()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET last_active_at = NOW()
  WHERE id = NEW.user_id;

  -- Επίσης update first_prompt_at αν είναι null
  UPDATE users
  SET first_prompt_at = NOW()
  WHERE id = NEW.user_id
    AND first_prompt_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_last_active
  AFTER INSERT ON prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_last_active();

-- 8c. Update usage_stats κάθε φορά που δημιουργείται prompt
CREATE OR REPLACE FUNCTION update_monthly_usage()
RETURNS TRIGGER AS $$
DECLARE
  current_month TEXT := to_char(NOW(), 'YYYY-MM');
BEGIN
  INSERT INTO usage_stats (user_id, month, prompts_generated)
  VALUES (NEW.user_id, current_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    prompts_generated =
      usage_stats.prompts_generated + 1,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_usage
  AFTER INSERT ON prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_monthly_usage();

-- 8d. Νέοι χρήστες χθες (για weekly report)
CREATE OR REPLACE FUNCTION get_new_users_yesterday()
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM users
  WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
    AND created_at < CURRENT_DATE;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8e. Prompts χθες
CREATE OR REPLACE FUNCTION get_prompts_yesterday()
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM prompts
  WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
    AND created_at < CURRENT_DATE;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8f. Τρέχον MRR
CREATE OR REPLACE FUNCTION get_current_mrr()
RETURNS DECIMAL AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN subscription_status = 'pro'    THEN 14.99
      WHEN subscription_status = 'school' THEN 79.99
      ELSE 0
    END
  ), 0)
  FROM users
  WHERE subscription_status != 'free';
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8g. Weekly Active Users
CREATE OR REPLACE FUNCTION get_weekly_active_users()
RETURNS INTEGER AS $$
  SELECT COUNT(DISTINCT user_id)::INTEGER
  FROM prompts
  WHERE created_at >= NOW() - INTERVAL '7 days';
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8h. Churn τελευταίες 24 ώρες
CREATE OR REPLACE FUNCTION get_cancellations_yesterday()
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM subscription_events
  WHERE event_type = 'churned'
    AND created_at >= CURRENT_DATE - INTERVAL '1 day'
    AND created_at < CURRENT_DATE;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8i. Μέση αξιολόγηση τελευταίων 7 ημερών
CREATE OR REPLACE FUNCTION get_avg_rating_last_days(
  days INTEGER DEFAULT 7
)
RETURNS DECIMAL AS $$
  SELECT ROUND(AVG(rating)::DECIMAL, 2)
  FROM prompts
  WHERE rating IS NOT NULL
    AND created_at >= NOW() - (days || ' days')::INTERVAL;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8j. Feature usage μηνιαία
CREATE OR REPLACE FUNCTION get_feature_usage_monthly()
RETURNS TABLE(feature TEXT, usage_count BIGINT) AS $$
  SELECT 'generate'::TEXT, COUNT(*)
  FROM prompts
  WHERE created_at >= date_trunc('month', NOW())
  UNION ALL
  SELECT 'journal', COUNT(*)
  FROM journal
  WHERE created_at >= date_trunc('month', NOW())
  UNION ALL
  SELECT 'error_reports', COUNT(*)
  FROM error_reports
  WHERE created_at >= date_trunc('month', NOW())
  ORDER BY 2 DESC;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8k. Top subjects του μήνα
CREATE OR REPLACE FUNCTION get_top_subjects()
RETURNS TABLE(subject TEXT, count BIGINT, avg_rating DECIMAL)
AS $$
  SELECT
    subject,
    COUNT(*) as count,
    ROUND(AVG(rating)::DECIMAL, 2) as avg_rating
  FROM prompts
  WHERE created_at >= date_trunc('month', NOW())
  GROUP BY subject
  ORDER BY count DESC
  LIMIT 5;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8l. Quality score για συγκεκριμένο στόχο ΑΠΣ
-- Χρησιμοποιείται από το data flywheel
CREATE OR REPLACE FUNCTION get_objective_quality_score(
  p_grade TEXT,
  p_subject TEXT,
  p_objective TEXT
)
RETURNS TABLE(
  quality_score DECIMAL,
  best_theory TEXT,
  best_strategy TEXT,
  total_uses BIGINT
) AS $$
  SELECT
    ROUND(AVG(p.rating) * 20, 1) as quality_score,
    MODE() WITHIN GROUP (ORDER BY p.theory) as best_theory,
    MODE() WITHIN GROUP (ORDER BY p.strategy) as best_strategy,
    COUNT(*) as total_uses
  FROM prompts p
  WHERE p.grade = p_grade
    AND p.subject = p_subject
    AND p.objective = p_objective
    AND p.rating IS NOT NULL;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8m. LTV cohort analysis
CREATE OR REPLACE FUNCTION get_cohort_ltv(p_month TEXT)
RETURNS TABLE(
  cohort_month TEXT,
  users_count BIGINT,
  avg_ltv DECIMAL,
  total_revenue DECIMAL,
  avg_months_active DECIMAL
) AS $$
  SELECT
    p_month as cohort_month,
    COUNT(*) as users_count,
    ROUND(AVG(ltv_total), 2) as avg_ltv,
    ROUND(SUM(ltv_total), 2) as total_revenue,
    ROUND(AVG(
      EXTRACT(EPOCH FROM (
        COALESCE(last_active_at, NOW()) - created_at
      )) / 2592000  -- seconds per month
    ), 1) as avg_months_active
  FROM users
  WHERE to_char(created_at, 'YYYY-MM') = p_month;
$$ LANGUAGE SQL SECURITY DEFINER;

-- 8n. School report: stats όλων των μελών
CREATE OR REPLACE FUNCTION get_school_monthly_report(
  p_school_owner_id UUID,
  p_month TEXT
)
RETURNS TABLE(
  member_email TEXT,
  prompts_generated INTEGER,
  prompts_saved INTEGER,
  avg_rating DECIMAL,
  top_subject TEXT,
  last_active TIMESTAMPTZ
) AS $$
  SELECT
    u.email as member_email,
    COALESCE(us.prompts_generated, 0),
    COALESCE(us.prompts_saved, 0),
    us.avg_rating,
    us.top_subject,
    u.last_active_at
  FROM school_members sm
  JOIN users u ON u.id = sm.member_id
  LEFT JOIN usage_stats us ON us.user_id = sm.member_id
    AND us.month = p_month
  WHERE sm.school_owner_id = p_school_owner_id
    AND sm.status = 'active'
  ORDER BY COALESCE(us.prompts_generated, 0) DESC;
$$ LANGUAGE SQL SECURITY DEFINER;


-- ================================================================
-- ΒΗΜΑ 9: KILL SWITCH TRACKING TABLE
-- Παρακολουθεί αν φτάνουμε τα milestones
-- ================================================================

CREATE TABLE IF NOT EXISTS milestone_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_month TEXT NOT NULL,  -- '2025-09'
  total_users INTEGER DEFAULT 0,
  paying_users INTEGER DEFAULT 0,
  mrr DECIMAL(10,2) DEFAULT 0,
  wau INTEGER DEFAULT 0,
  avg_nps DECIMAL(4,1),
  churn_rate_30d DECIMAL(5,2),
  ltv_cac_ratio DECIMAL(6,2),
  kill_switch_triggered BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(snapshot_month)
);

-- Μόνο service role γράφει
ALTER TABLE milestone_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_milestones"
ON milestone_snapshots FOR ALL
USING (auth.role() = 'service_role');

-- Admin (εσύ) βλέπει τα πάντα
CREATE POLICY "admin_view_milestones"
ON milestone_snapshots FOR SELECT
USING (
  (SELECT email FROM users WHERE id = auth.uid())
  = 'hello@eduprompt.gr'
);


-- ================================================================
-- ΒΗΜΑ 10: NPS TRACKING
-- Για validation framework — στόχος NPS > 50
-- ================================================================

CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  category TEXT GENERATED ALWAYS AS (
    CASE
      WHEN score <= 6 THEN 'detractor'
      WHEN score <= 8 THEN 'passive'
      ELSE 'promoter'
    END
  ) STORED,
  comment TEXT,
  triggered_at TEXT,
  -- 'day_7' | 'day_30' | 'post_cancel' | 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_submit_own_nps"
ON nps_responses FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_view_all_nps"
ON nps_responses FOR SELECT
USING (auth.role() = 'service_role');

-- RPC για NPS score calculation
CREATE OR REPLACE FUNCTION calculate_nps(
  days_back INTEGER DEFAULT 30
)
RETURNS DECIMAL AS $$
  SELECT
    ROUND(
      (COUNT(CASE WHEN category = 'promoter' THEN 1 END)::DECIMAL -
       COUNT(CASE WHEN category = 'detractor' THEN 1 END)::DECIMAL)
      / NULLIF(COUNT(*), 0) * 100,
      1
    ) as nps_score
  FROM nps_responses
  WHERE created_at >= NOW() - (days_back || ' days')::INTERVAL;
$$ LANGUAGE SQL SECURITY DEFINER;


-- ================================================================
-- ΒΗΜΑ 11: VIEWS ΓΙΑ ADMIN DASHBOARD
-- Εύκολη ανάγνωση metrics χωρίς σύνθετα queries
-- ================================================================

-- View: τρέχουσα κατάσταση επιχείρησης
CREATE OR REPLACE VIEW business_health AS
SELECT
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM users
   WHERE subscription_status != 'free') as paying_users,
  (SELECT get_current_mrr()) as mrr,
  (SELECT get_weekly_active_users()) as wau,
  (SELECT COUNT(*) FROM users
   WHERE subscription_status = 'school') as school_plans,
  (SELECT calculate_nps()) as nps_score,
  (SELECT COUNT(*) FROM referrals
   WHERE status = 'rewarded') as successful_referrals,
  (SELECT COUNT(*) FROM error_reports
   WHERE status = 'pending') as pending_error_reports;

-- View: χρήστες που κινδυνεύουν να φύγουν (churn risk)
CREATE OR REPLACE VIEW churn_risk_users AS
SELECT
  u.id,
  u.email,
  u.subscription_status,
  u.last_active_at,
  EXTRACT(DAYS FROM NOW() - u.last_active_at) as days_inactive,
  COUNT(p.id) as total_prompts,
  AVG(p.rating) as avg_rating
FROM users u
LEFT JOIN prompts p ON p.user_id = u.id
WHERE u.subscription_status = 'pro'
  AND u.last_active_at < NOW() - INTERVAL '10 days'
GROUP BY u.id, u.email, u.subscription_status, u.last_active_at
ORDER BY days_inactive DESC;


-- ================================================================
-- ΤΕΛΟΣ MIGRATION
-- ================================================================
-- Έλεγξε ότι όλα δημιουργήθηκαν σωστά:

SELECT
  schemaname,
  tablename,
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'referrals', 'school_members', 'school_invites',
    'usage_stats', 'subscription_events',
    'prompt_quality_signals', 'milestone_snapshots',
    'nps_responses'
  )
ORDER BY tablename;

-- Αναμενόμενο αποτέλεσμα: 8 γραμμές
