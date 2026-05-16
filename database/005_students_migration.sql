-- database/005_students_migration.sql
-- Private Tutoring Mode: student profiles
-- Idempotent — safe to re-run.

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS students (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Basic info
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    grade           TEXT NOT NULL CHECK (grade IN ('Α','Β','Γ','Δ','Ε','ΣΤ')),

    -- Pedagogical profile
    strengths       TEXT,                              -- τι πηγαίνει καλά
    weaknesses      TEXT,                              -- δυσκολίες / κενά
    learning_style  TEXT NOT NULL DEFAULT 'mixed'
                        CHECK (learning_style IN ('visual','auditory','kinesthetic','mixed')),
    notes           TEXT CHECK (char_length(notes)    <= 2000),
    goals           TEXT CHECK (char_length(goals)    <= 1000),

    -- Soft-delete: δεν σβήνουμε, μόνο αρχειοθετούμε
    active          BOOLEAN NOT NULL DEFAULT true,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Fetch all active students for a teacher (the most common query)
CREATE INDEX IF NOT EXISTS idx_students_user_active
    ON students (user_id, created_at DESC)
    WHERE active = true;

-- Grade filter (e.g. show only Δ-graders in a tutoring session)
CREATE INDEX IF NOT EXISTS idx_students_user_grade
    ON students (user_id, grade)
    WHERE active = true;

-- ── auto-update updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Trigger is idempotent (DROP IF EXISTS before CREATE)
DROP TRIGGER IF EXISTS students_set_updated_at ON students;
CREATE TRIGGER students_set_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Teachers can only see their own students
CREATE POLICY IF NOT EXISTS students_select_own
    ON students FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS students_insert_own
    ON students FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS students_update_own
    ON students FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Hard-delete is allowed (but UI uses active=false soft-delete)
CREATE POLICY IF NOT EXISTS students_delete_own
    ON students FOR DELETE
    USING (auth.uid() = user_id);

-- Service-role bypass (needed by FastAPI backend)
CREATE POLICY IF NOT EXISTS students_service_role_all
    ON students FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- ── Verification ─────────────────────────────────────────────────────────────

DO $$
DECLARE
    col_count INT;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_name = 'students'
      AND column_name IN (
          'id','user_id','name','grade','strengths','weaknesses',
          'learning_style','notes','goals','active','created_at','updated_at'
      );
    ASSERT col_count = 12, 'students table missing expected columns';
END;
$$;
