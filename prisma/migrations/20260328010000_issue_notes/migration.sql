-- Add optional notes field to project_issues
-- Idempotent: safe to re-run

DO $$ BEGIN
  ALTER TABLE project_issues ADD COLUMN notes TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
