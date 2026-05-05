-- ================================================================
-- EDUPROMPT — PHASE 4: CURRICULUM + SCHEDULES
-- Migration: 004_curriculum_schedule_migration.sql
--
-- ΤΙ ΠΕΡΙΕΧΕΙ:
--   1. curriculum_objectives — ΑΠΣ στόχοι ανά τάξη/μάθημα/ενότητα
--   2. curriculum_chunks     — text chunks για Pinecone seeding (RAG)
--   3. school_schedules      — εβδομαδιαίο ωρολόγιο πρόγραμμα ανά user
--
-- ΣΕΙΡΑ ΕΚΤΕΛΕΣΗΣ:
--   1. eduprompt_db_migration.sql         — base (users, referrals, ...)
--   2. class_profile_migration.sql        — class_profiles
--   3. phase2_cleanup_migration.sql       — phase 2 cleanup
--   4. phase3_core_tables_migration.sql   — prompts, error_reports, journal
--   5. teacher_notes_migration.sql        — prompts.teacher_notes column
--   6. 004_curriculum_schedule_migration.sql  — ΑΥΤΟ
--
-- ΧΡΗΣΗ:
--   • curriculum_objectives: αναζήτηση στόχων ΑΠΣ από το CurriculumDrawer
--   • curriculum_chunks: σπόρωση Pinecone (seed_curriculum_db.py)
--   • school_schedules: ωρολόγιο που χρησιμοποιεί ο δάσκαλος για να
--     προτείνει διάρκεια μαθήματος στο generate form
-- ================================================================


-- ================================================================
-- 1. CURRICULUM_OBJECTIVES
--    Μητρώο ΑΠΣ στόχων. Ένα row = ένας μαθησιακός στόχος.
--    Πηγή αλήθειας για το CurriculumDrawer UI.
-- ================================================================

CREATE TABLE IF NOT EXISTS curriculum_objectives (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ταξινόμηση ΑΠΣ
  grade         TEXT    NOT NULL
                  CHECK (grade IN ('Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ')),
  subject       TEXT    NOT NULL
                  CHECK (length(subject) BETWEEN 1 AND 80),
  unit          TEXT,                         -- ενότητα (π.χ. "Αριθμοί")
  chapter       TEXT,                         -- κεφάλαιο (π.χ. "Κλάσματα")

  -- Περιεχόμενο
  objective     TEXT    NOT NULL
                  CHECK (length(objective) BETWEEN 5 AND 1000),
  objective_code TEXT,                        -- π.χ. "ΜΑΘ-Δ-3.2" (optional)
  keywords      TEXT[]  NOT NULL DEFAULT '{}', -- για full-text search

  -- Πηγή
  source        TEXT    NOT NULL DEFAULT 'ΑΠΣ-2021',
  page_ref      TEXT,                         -- σελίδα βιβλίου (π.χ. "σ.47")

  -- Ordering για presentation
  sort_order    SMALLINT NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index για CurriculumDrawer: βρες στόχους για grade+subject
CREATE INDEX IF NOT EXISTS idx_curr_obj_grade_subject
  ON curriculum_objectives(grade, subject, sort_order);

-- Index για keyword search (GIN για array containment @>)
CREATE INDEX IF NOT EXISTS idx_curr_obj_keywords
  ON curriculum_objectives USING GIN(keywords);

-- Full-text search στα objectives (ελληνικό locale)
CREATE INDEX IF NOT EXISTS idx_curr_obj_fts
  ON curriculum_objectives
  USING GIN(to_tsvector('simple', objective));

-- ── RLS ──────────────────────────────────────────────────────────
-- Curriculum data είναι PUBLIC — όλοι οι authenticated users
-- μπορούν να διαβάσουν, μόνο service_role γράφει.
ALTER TABLE curriculum_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_curriculum_objectives"
ON curriculum_objectives FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "service_role_all_curriculum_objectives"
ON curriculum_objectives FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ================================================================
-- 2. CURRICULUM_CHUNKS
--    Text chunks έτοιμα για Pinecone seeding.
--    Κάθε row = ένα vector embedding unit (300-400 tokens).
--    Το seed script διαβάζει αυτά και τα ανεβάζει στο Pinecone.
-- ================================================================

CREATE TABLE IF NOT EXISTS curriculum_chunks (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ταξινόμηση (mirror από curriculum_objectives)
  grade         TEXT    NOT NULL
                  CHECK (grade IN ('Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ')),
  subject       TEXT    NOT NULL,
  unit          TEXT,
  chapter       TEXT,

  -- Το κείμενο που θα γίνει embedded
  content       TEXT    NOT NULL
                  CHECK (length(content) BETWEEN 10 AND 2000),

  -- Pinecone metadata (αποθηκεύεται μαζί με το vector)
  source        TEXT    NOT NULL,             -- π.χ. "ΑΠΣ-2021-Δ-ΜΑΘ-p.47"
  chunk_type    TEXT    NOT NULL DEFAULT 'curriculum'
                  CHECK (chunk_type IN (
                    'curriculum',     -- απόσπασμα ΑΠΣ
                    'objective',      -- μαθησιακός στόχος
                    'methodology',    -- μεθοδολογική οδηγία
                    'example'         -- παράδειγμα δραστηριότητας
                  )),

  -- Pinecone sync state
  pinecone_id         TEXT UNIQUE,           -- το ID στο Pinecone index
  pinecone_synced_at  TIMESTAMPTZ,           -- τελευταία επιτυχής sync

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index για seed script: βρες unsynced chunks
CREATE INDEX IF NOT EXISTS idx_curr_chunks_unsynced
  ON curriculum_chunks(grade, subject)
  WHERE pinecone_synced_at IS NULL;

-- Index για seed script: batch by grade/subject
CREATE INDEX IF NOT EXISTS idx_curr_chunks_grade_subject
  ON curriculum_chunks(grade, subject);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_curriculum_chunk_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_curriculum_chunks_updated_at ON curriculum_chunks;
CREATE TRIGGER trigger_curriculum_chunks_updated_at
  BEFORE UPDATE ON curriculum_chunks
  FOR EACH ROW
  EXECUTE FUNCTION set_curriculum_chunk_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE curriculum_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_curriculum_chunks"
ON curriculum_chunks FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "service_role_all_curriculum_chunks"
ON curriculum_chunks FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ================================================================
-- 3. SCHOOL_SCHEDULES
--    Εβδομαδιαίο ωρολόγιο πρόγραμμα ανά δάσκαλο/τάξη.
--    Χρησιμοποιείται για:
--      • Αυτόματη πρόταση διάρκειας μαθήματος στη φόρμα
--      • Φιλτράρισμα στόχων ΑΠΣ βάσει των μαθημάτων που διδάσκει
--      • Στατιστικά (ποια μαθήματα διδάσκει περισσότερο)
--
--    Δομή JSONB schedule:
--    {
--      "monday":    [{"period":1,"subject":"Μαθηματικά","start":"08:00","duration":45}, ...],
--      "tuesday":   [...],
--      "wednesday": [...],
--      "thursday":  [...],
--      "friday":    [...]
--    }
-- ================================================================

CREATE TABLE IF NOT EXISTS school_schedules (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID    NOT NULL
                  REFERENCES users(id) ON DELETE CASCADE,

  -- Χαρακτηριστικά
  school_year   TEXT    NOT NULL DEFAULT '2025-2026'
                  CHECK (school_year ~ '^\d{4}-\d{4}$'),
  grade         TEXT    NOT NULL
                  CHECK (grade IN ('Α', 'Β', 'Γ', 'Δ', 'Ε', 'ΣΤ')),
  label         TEXT    CHECK (length(label) <= 100),  -- π.χ. "Δ2 Τμήμα"

  -- Το ωρολόγιο
  schedule      JSONB   NOT NULL DEFAULT '{}',

  -- Uploaded file info (για display μόνο)
  original_filename TEXT,
  upload_method TEXT NOT NULL DEFAULT 'manual'
                  CHECK (upload_method IN ('manual', 'csv', 'image_ocr')),

  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ένα schedule ανά (user, grade, school_year)
  UNIQUE(user_id, grade, school_year)
);

-- Quick lookup: "τα schedules αυτού του user"
CREATE INDEX IF NOT EXISTS idx_schedules_user
  ON school_schedules(user_id, school_year DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_schedule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_schedules_updated_at ON school_schedules;
CREATE TRIGGER trigger_schedules_updated_at
  BEFORE UPDATE ON school_schedules
  FOR EACH ROW
  EXECUTE FUNCTION set_schedule_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE school_schedules ENABLE ROW LEVEL SECURITY;

-- User βλέπει / διαχειρίζεται ΜΟΝΟ τα δικά του schedules
CREATE POLICY "users_crud_own_schedules"
ON school_schedules FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Service role για analytics
CREATE POLICY "service_role_all_schedules"
ON school_schedules FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ================================================================
-- 4. POST-MIGRATION VERIFICATION
-- ================================================================

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'curriculum_objectives'),
    'curriculum_objectives should exist';

  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'curriculum_chunks'),
    'curriculum_chunks should exist';

  ASSERT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'school_schedules'),
    'school_schedules should exist';

  RAISE NOTICE 'Phase 4 curriculum + schedules migration: OK';
END $$;
