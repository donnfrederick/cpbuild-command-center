-- Durable scope reference keys on field notes (survive Location Builder row replacement).
ALTER TABLE "project_issues" ADD COLUMN "scope_ref_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "project_observations" ADD COLUMN "scope_ref_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
