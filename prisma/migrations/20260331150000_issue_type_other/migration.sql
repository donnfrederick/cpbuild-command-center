-- Add OTHER value to issue_type enum (idempotent)
DO $$ BEGIN
  ALTER TYPE "issue_type" ADD VALUE IF NOT EXISTS 'OTHER';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
