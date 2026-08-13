-- Migration: replace single subScopeInstanceId FK on project_issues with a
-- many-to-many join table (issue_sub_scope_tags), matching the existing
-- issue_scope_tags pattern for scope rows.

-- 1. Drop the single FK column (no production data was stored here yet)
ALTER TABLE "project_issues"
  DROP COLUMN IF EXISTS "subScopeInstanceId";

-- 2. Create the join table
CREATE TABLE IF NOT EXISTS "issue_sub_scope_tags" (
  "id"                 TEXT NOT NULL,
  "issueId"            TEXT NOT NULL,
  "subScopeInstanceId" TEXT NOT NULL,
  CONSTRAINT "issue_sub_scope_tags_pkey" PRIMARY KEY ("id")
);

-- 3. Unique constraint + indexes
CREATE UNIQUE INDEX IF NOT EXISTS "issue_sub_scope_tags_issueId_subScopeInstanceId_key"
  ON "issue_sub_scope_tags"("issueId", "subScopeInstanceId");

CREATE INDEX IF NOT EXISTS "issue_sub_scope_tags_issueId_idx"
  ON "issue_sub_scope_tags"("issueId");

CREATE INDEX IF NOT EXISTS "issue_sub_scope_tags_subScopeInstanceId_idx"
  ON "issue_sub_scope_tags"("subScopeInstanceId");

-- 4. Foreign keys
ALTER TABLE "issue_sub_scope_tags"
  ADD CONSTRAINT "issue_sub_scope_tags_issueId_fkey"
  FOREIGN KEY ("issueId")
  REFERENCES "project_issues"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_sub_scope_tags"
  ADD CONSTRAINT "issue_sub_scope_tags_subScopeInstanceId_fkey"
  FOREIGN KEY ("subScopeInstanceId")
  REFERENCES "project_sub_scope_instances"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
