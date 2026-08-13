-- Migration: ScopeStage and ScopeStatus enums + columns on project_rows
-- Used by the mobile Units view to track workflow stage and status per scope.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "ScopeStage" AS ENUM ('STAGING', 'ASSEMBLY', 'INSTALL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ScopeStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Columns on project_rows ───────────────────────────────────────────────────
ALTER TABLE "project_rows"
    ADD COLUMN IF NOT EXISTS "scopeStage"  "ScopeStage",
    ADD COLUMN IF NOT EXISTS "scopeStatus" "ScopeStatus";
