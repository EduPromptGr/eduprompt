-- teacher_notes_migration.sql
-- Προσθήκη πεδίου σημειώσεων δασκάλου στον πίνακα prompts.
-- Idempotent — τρέξε όσες φορές θέλεις.

ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS teacher_notes TEXT CHECK (char_length(teacher_notes) <= 5000);

-- Δεν χρειάζεται νέα RLS policy — η υπάρχουσα users_manage_own_prompts
-- (UPDATE WHERE auth.uid() = user_id) καλύπτει και το νέο column.

-- Προαιρετικό index αν θέλεις full-text search αργότερα:
-- CREATE INDEX IF NOT EXISTS idx_prompts_teacher_notes_gin
--   ON prompts USING gin(to_tsvector('greek', coalesce(teacher_notes, '')));
