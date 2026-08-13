-- Salesforce ID is redundant — Unifier project number is the same value.
-- Drop the index and unique constraint first, then the column.

DROP INDEX IF EXISTS "Project_salesforceId_idx";
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_salesforceId_key";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "salesforceId";
