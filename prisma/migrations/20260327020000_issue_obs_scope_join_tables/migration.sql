-- Refactor: replace projectRowId on issues/observations with unitRef + join tables
-- Idempotent: safe to run multiple times

-- 1. Add unitRef to project_issues (nullable)
ALTER TABLE "project_issues"
  ADD COLUMN IF NOT EXISTS "unitRef" TEXT;

-- 2. Drop old projectRowId FK + column from project_issues
ALTER TABLE "project_issues"
  DROP CONSTRAINT IF EXISTS "project_issues_projectRowId_fkey";

DO $$ BEGIN
  ALTER TABLE "project_issues" DROP COLUMN "projectRowId";
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- 3. Add unitRef to project_observations (nullable)
ALTER TABLE "project_observations"
  ADD COLUMN IF NOT EXISTS "unitRef" TEXT;

-- 4. Drop old projectRowId FK + column from project_observations
ALTER TABLE "project_observations"
  DROP CONSTRAINT IF EXISTS "project_observations_projectRowId_fkey";

DO $$ BEGIN
  ALTER TABLE "project_observations" DROP COLUMN "projectRowId";
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- 5. Drop old indexes
DROP INDEX IF EXISTS "project_issues_projectRowId_idx";
DROP INDEX IF EXISTS "project_observations_projectRowId_idx";

-- 6. Create new indexes on unitRef
CREATE INDEX IF NOT EXISTS "project_issues_unitRef_idx" ON "project_issues"("unitRef");
CREATE INDEX IF NOT EXISTS "project_observations_unitRef_idx" ON "project_observations"("unitRef");

-- 7. Create issue_scope_tags join table
CREATE TABLE IF NOT EXISTS "issue_scope_tags" (
  "id"           TEXT NOT NULL,
  "issueId"      TEXT NOT NULL,
  "projectRowId" TEXT NOT NULL,
  CONSTRAINT "issue_scope_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "issue_scope_tags_issueId_projectRowId_key"
  ON "issue_scope_tags"("issueId", "projectRowId");

CREATE INDEX IF NOT EXISTS "issue_scope_tags_issueId_idx"
  ON "issue_scope_tags"("issueId");

CREATE INDEX IF NOT EXISTS "issue_scope_tags_projectRowId_idx"
  ON "issue_scope_tags"("projectRowId");

DO $$ BEGIN
  ALTER TABLE "issue_scope_tags"
    ADD CONSTRAINT "issue_scope_tags_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "project_issues"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "issue_scope_tags"
    ADD CONSTRAINT "issue_scope_tags_projectRowId_fkey"
    FOREIGN KEY ("projectRowId") REFERENCES "project_rows"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. Create observation_scope_tags join table
CREATE TABLE IF NOT EXISTS "observation_scope_tags" (
  "id"            TEXT NOT NULL,
  "observationId" TEXT NOT NULL,
  "projectRowId"  TEXT NOT NULL,
  CONSTRAINT "observation_scope_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "observation_scope_tags_observationId_projectRowId_key"
  ON "observation_scope_tags"("observationId", "projectRowId");

CREATE INDEX IF NOT EXISTS "observation_scope_tags_observationId_idx"
  ON "observation_scope_tags"("observationId");

CREATE INDEX IF NOT EXISTS "observation_scope_tags_projectRowId_idx"
  ON "observation_scope_tags"("projectRowId");

DO $$ BEGIN
  ALTER TABLE "observation_scope_tags"
    ADD CONSTRAINT "observation_scope_tags_observationId_fkey"
    FOREIGN KEY ("observationId") REFERENCES "project_observations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "observation_scope_tags"
    ADD CONSTRAINT "observation_scope_tags_projectRowId_fkey"
    FOREIGN KEY ("projectRowId") REFERENCES "project_rows"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
