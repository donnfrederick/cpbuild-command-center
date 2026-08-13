-- Add optional caption field to media_attachments
-- Idempotent: safe to re-run

DO $$ BEGIN
  ALTER TABLE media_attachments ADD COLUMN caption TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
