-- Removes per-scope subcontractor columns added in an earlier uncommitted migration.
-- IF EXISTS guards make this idempotent for databases that never had those columns.
ALTER TABLE "project_rows" DROP COLUMN IF EXISTS "unifierSubcontractorId";
ALTER TABLE "project_rows" DROP COLUMN IF EXISTS "unifierSubcontractorName";
