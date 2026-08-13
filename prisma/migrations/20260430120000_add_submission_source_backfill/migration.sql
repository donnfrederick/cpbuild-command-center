-- Add inspection_submissions table, related enums, and the source column.
-- Fully idempotent: safe to run whether or not the table/enums already exist.

-- 1. Create enums (silently no-ops if they already exist)
DO $$ BEGIN
  CREATE TYPE "inspection_outcome" AS ENUM ('PASS', 'FAIL', 'COMPLETE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "submission_source" AS ENUM ('FORM', 'BACKFILL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create the table if it does not exist yet
--    (environments that ran db push already have it; Railway does not)
CREATE TABLE IF NOT EXISTS "inspection_submissions" (
  "id"               TEXT NOT NULL,
  "formId"           TEXT,
  "formVersionId"    TEXT,
  "templateSnapshot" JSONB NOT NULL DEFAULT '{}',
  "projectId"        TEXT NOT NULL,
  "unitId"           TEXT NOT NULL,
  "scopeRowId"       TEXT,
  "scopeTypeCode"    TEXT,
  "submittedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedById"    TEXT,
  "submittedByName"  TEXT NOT NULL DEFAULT '',
  "outcome"          "inspection_outcome" NOT NULL,
  "deficiencyCount"  INTEGER NOT NULL DEFAULT 0,
  "payload"          JSONB NOT NULL DEFAULT '{}',
  "source"           "submission_source" NOT NULL DEFAULT 'FORM',
  CONSTRAINT "inspection_submissions_pkey" PRIMARY KEY ("id")
);

-- 3. For tables that already existed (db-push envs): make formId nullable
DO $$ BEGIN
  ALTER TABLE "inspection_submissions"
    ALTER COLUMN "formId" DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 4. For tables that already existed: add source column if missing
ALTER TABLE "inspection_submissions"
  ADD COLUMN IF NOT EXISTS "source" "submission_source" NOT NULL DEFAULT 'FORM';

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "inspection_submissions_formId_idx"    ON "inspection_submissions"("formId");
CREATE INDEX IF NOT EXISTS "inspection_submissions_projectId_idx" ON "inspection_submissions"("projectId");
CREATE INDEX IF NOT EXISTS "inspection_submissions_unitId_idx"    ON "inspection_submissions"("unitId");
CREATE INDEX IF NOT EXISTS "inspection_submissions_scopeRowId_idx" ON "inspection_submissions"("scopeRowId");
