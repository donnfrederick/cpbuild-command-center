-- Prisma upsert requires a normal unique constraint, not a partial unique index.
-- PostgreSQL unique constraints already allow multiple NULL values, so this is safe
-- for legacy clear_inspections rows that are not backed by a form submission.

DROP INDEX IF EXISTS "clear_inspections_inspectionSubmissionId_key";

DO $$ BEGIN
  ALTER TABLE "clear_inspections"
    ADD CONSTRAINT "clear_inspections_inspectionSubmissionId_key"
    UNIQUE ("inspectionSubmissionId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
