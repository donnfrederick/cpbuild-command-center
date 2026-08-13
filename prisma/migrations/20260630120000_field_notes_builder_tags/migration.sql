-- Optional location-builder tags for project-level issues and observations.
ALTER TABLE "project_observations"
  ADD COLUMN IF NOT EXISTS "build_phase_tag" TEXT,
  ADD COLUMN IF NOT EXISTS "area_tag" TEXT;

ALTER TABLE "project_issues"
  ADD COLUMN IF NOT EXISTS "build_phase_tag" TEXT,
  ADD COLUMN IF NOT EXISTS "area_tag" TEXT;
