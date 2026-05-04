-- ================================================================
-- "Η ΤΑΞΗ ΜΟΥ" — CLASS PROFILE SYSTEM
-- Migration: τρέξε στο Supabase SQL Editor
-- ================================================================


-- ================================================================
-- ΠΙΝΑΚΑΣ 1: class_profiles
-- Ένα προφίλ ανά τάξη ανά δάσκαλο
-- Π.χ. ένας δάσκαλος με 2 τμήματα έχει 2 profiles
-- ================================================================

CREATE TABLE IF NOT EXISTS class_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  -- Βασικά στοιχεία τάξης
  name TEXT NOT NULL,          -- "Β2 Δημοτικό Ιωαννίνων"
  grade TEXT NOT NULL,         -- 'Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ'
  school_year TEXT NOT NULL,   -- '2025-2026'
  student_count INTEGER,       -- προαιρετικό, για context

  -- Δυνατά σημεία τάξης (array από tags)
  strengths TEXT[] DEFAULT '{}',
  -- π.χ. ['παιχνίδι ρόλων', 'ομαδική εργασία', 'εικόνες']

  -- Αδύνατα σημεία
  challenges TEXT[] DEFAULT '{}',
  -- π.χ. ['αφαίρεση', 'μεγάλα κείμενα', 'συγκέντρωση']

  -- Τι κινητοποιεί την τάξη
  engagement_triggers TEXT[] DEFAULT '{}',
  -- π.χ. ['ανταγωνισμός', 'δημιουργία', 'κίνηση']

  -- Ρυθμός μάθησης ανά μάθημα (JSONB για ευελιξία)
  learning_pace JSONB DEFAULT '{}',
  -- π.χ. {"mathematics": "slow", "language": "normal", "science": "fast"}

  -- Τρέχουσα θέση στο ΑΠΣ ανά μάθημα
  curriculum_position JSONB DEFAULT '{}',
  -- π.χ. {"mathematics": "Κεφ. 4 — Πολλαπλασιασμός",
  --        "language": "Κεφ. 6 — Επίθετα"}

  -- Ελεύθερες σημειώσεις δασκάλου για την τάξη
  teacher_notes TEXT,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE class_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_class_profiles"
ON class_profiles FOR ALL
USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_class_profiles_user
  ON class_profiles(user_id, is_active);


-- ================================================================
-- ΠΙΝΑΚΑΣ 2: class_activity_logs
-- Κάθε φορά που δάσκαλος κάνει feedback μετά από δραστηριότητα
-- Αυτό είναι το "fuel" του class profile
-- ================================================================

CREATE TABLE IF NOT EXISTS class_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_profile_id UUID NOT NULL
    REFERENCES class_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  -- Σύνδεση με το prompt που χρησιμοποιήθηκε
  prompt_id UUID
    REFERENCES prompts(id) ON DELETE SET NULL,

  -- Στοιχεία δραστηριότητας
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  objective TEXT,

  -- Αποτέλεσμα (το κύριο input του δασκάλου)
  outcome TEXT NOT NULL
    CHECK (outcome IN (
      'excellent',  -- Πολύ καλά — οι μαθητές ήταν απορροφημένοι
      'good',       -- Καλά — λειτούργησε με μικρές προσαρμογές
      'difficult',  -- Δύσκολα — χάθηκαν στη διαδικασία
      'poor'        -- Άσχημα — δεν λειτούργησε
    )),

  -- Ελεύθερη παρατήρηση (προαιρετική)
  observation TEXT,
  -- π.χ. "Αγάπησαν το παιχνίδι ρόλων, δυσκολεύτηκαν στην αφαίρεση"

  -- Αυτόματα εξαγόμενα insights (από AI analysis)
  extracted_strengths TEXT[] DEFAULT '{}',
  extracted_challenges TEXT[] DEFAULT '{}',
  extracted_triggers TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE class_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_activity_logs"
ON class_activity_logs FOR ALL
USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_profile
  ON class_activity_logs(class_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_subject
  ON class_activity_logs(class_profile_id, subject, outcome);


-- ================================================================
-- ΠΙΝΑΚΑΣ 3: class_subject_progress
-- Παρακολουθεί πού βρίσκεται η τάξη σε κάθε μάθημα
-- Update μετά από κάθε δραστηριότητα
-- ================================================================

CREATE TABLE IF NOT EXISTS class_subject_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_profile_id UUID NOT NULL
    REFERENCES class_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  subject TEXT NOT NULL,
  -- Τελευταίος στόχος ΑΠΣ που καλύφθηκε
  last_objective TEXT,
  last_objective_outcome TEXT
    CHECK (last_objective_outcome IN (
      'excellent', 'good', 'difficult', 'poor'
    )),
  -- Συνολικές δραστηριότητες για αυτό το μάθημα
  total_activities INTEGER DEFAULT 0,
  -- Μέσος όρος αποτελεσμάτων (1-4 scale)
  avg_outcome_score DECIMAL(3,2),

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_profile_id, subject)
);

ALTER TABLE class_subject_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_subject_progress"
ON class_subject_progress FOR ALL
USING (user_id = auth.uid());


-- ================================================================
-- TRIGGER: Auto-update class_profiles όταν μπαίνει νέο log
-- Ενημερώνει strengths/challenges/triggers αυτόματα
-- ================================================================

CREATE OR REPLACE FUNCTION update_class_profile_from_log()
RETURNS TRIGGER AS $$
DECLARE
  new_strengths TEXT[];
  new_challenges TEXT[];
BEGIN
  -- Update last_activity_at
  UPDATE class_profiles
  SET
    last_activity_at = NOW(),
    updated_at = NOW(),
    -- Προσθέτει νέα strengths (χωρίς duplicates)
    strengths = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          strengths || NEW.extracted_strengths
        )
      )
      FROM class_profiles
      WHERE id = NEW.class_profile_id
    ),
    -- Προσθέτει νέα challenges (χωρίς duplicates)
    challenges = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          challenges || NEW.extracted_challenges
        )
      )
      FROM class_profiles
      WHERE id = NEW.class_profile_id
    ),
    -- Ενημερώνει triggers
    engagement_triggers = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          engagement_triggers || NEW.extracted_triggers
        )
      )
      FROM class_profiles
      WHERE id = NEW.class_profile_id
    )
  WHERE id = NEW.class_profile_id;

  -- Update subject progress
  INSERT INTO class_subject_progress (
    class_profile_id, user_id, subject,
    last_objective, last_objective_outcome,
    total_activities
  )
  VALUES (
    NEW.class_profile_id, NEW.user_id, NEW.subject,
    NEW.objective, NEW.outcome, 1
  )
  ON CONFLICT (class_profile_id, subject)
  DO UPDATE SET
    last_objective = NEW.objective,
    last_objective_outcome = NEW.outcome,
    total_activities = class_subject_progress.total_activities + 1,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_class_profile
  AFTER INSERT ON class_activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_class_profile_from_log();


-- ================================================================
-- RPC FUNCTIONS
-- ================================================================

-- Φόρτωσε πλήρες class profile context για generate router
CREATE OR REPLACE FUNCTION get_class_profile_context(
  p_profile_id UUID,
  p_subject TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  profile_data JSONB;
  recent_logs JSONB;
  subject_progress JSONB;
BEGIN
  -- Βασικό profile
  SELECT to_jsonb(cp) INTO profile_data
  FROM class_profiles cp
  WHERE cp.id = p_profile_id
    AND cp.user_id = auth.uid();

  IF profile_data IS NULL THEN
    RETURN NULL;
  END IF;

  -- Τελευταία 5 logs για το συγκεκριμένο μάθημα
  SELECT jsonb_agg(log_data) INTO recent_logs
  FROM (
    SELECT jsonb_build_object(
      'subject', subject,
      'objective', objective,
      'outcome', outcome,
      'observation', observation,
      'date', created_at::DATE
    ) as log_data
    FROM class_activity_logs
    WHERE class_profile_id = p_profile_id
      AND (p_subject IS NULL OR subject = p_subject)
    ORDER BY created_at DESC
    LIMIT 5
  ) logs;

  -- Progress για το συγκεκριμένο μάθημα
  SELECT to_jsonb(csp) INTO subject_progress
  FROM class_subject_progress csp
  WHERE csp.class_profile_id = p_profile_id
    AND (p_subject IS NULL OR csp.subject = p_subject);

  RETURN jsonb_build_object(
    'profile', profile_data,
    'recent_activities', COALESCE(recent_logs, '[]'::jsonb),
    'subject_progress', COALESCE(subject_progress, '{}'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Στατιστικά τάξης για dashboard
CREATE OR REPLACE FUNCTION get_class_stats(p_profile_id UUID)
RETURNS JSONB AS $$
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
  )
  FROM class_activity_logs
  WHERE class_profile_id = p_profile_id;
$$ LANGUAGE SQL SECURITY DEFINER;


-- Έλεγξε αν ο χρήστης έχει ήδη profile
SELECT 'Migration complete ✅' as status;
