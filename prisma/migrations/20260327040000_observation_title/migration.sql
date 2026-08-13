-- Idempotent: add title column to project_observations
DO $$ BEGIN
  ALTER TABLE project_observations ADD COLUMN title TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Make description nullable-friendly for existing rows (already TEXT, no change needed)
