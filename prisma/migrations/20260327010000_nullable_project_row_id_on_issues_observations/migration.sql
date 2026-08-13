-- Make projectRowId optional on project_issues and project_observations
-- Idempotent: safe to run multiple times

ALTER TABLE "project_issues" ALTER COLUMN "projectRowId" DROP NOT NULL;
ALTER TABLE "project_observations" ALTER COLUMN "projectRowId" DROP NOT NULL;
