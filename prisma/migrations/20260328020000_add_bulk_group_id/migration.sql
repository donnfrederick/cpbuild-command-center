-- Add bulkGroupId to project_issues and project_observations.
-- Allows bulk-created issues/observations to be grouped and resolved together.

ALTER TABLE "project_issues" ADD COLUMN "bulk_group_id" TEXT;
CREATE INDEX "project_issues_bulk_group_id_idx" ON "project_issues"("bulk_group_id");

ALTER TABLE "project_observations" ADD COLUMN "bulk_group_id" TEXT;
CREATE INDEX "project_observations_bulk_group_id_idx" ON "project_observations"("bulk_group_id");
