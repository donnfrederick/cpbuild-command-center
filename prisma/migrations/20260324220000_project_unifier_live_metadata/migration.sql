-- Live project name, site, status, PM, Unifier number, and start date come from PDS
-- (UNIFIER_US_XPRJ) at read time via unifierPid — drop denormalized copies.

DROP INDEX IF EXISTS "Project_status_idx";

ALTER TABLE "Project" DROP COLUMN IF EXISTS "projectName";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "siteLocation";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "status";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "startDate";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "projectManagerName";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "unifierProjectNumber";

DROP TYPE IF EXISTS "ProjectStatus";
