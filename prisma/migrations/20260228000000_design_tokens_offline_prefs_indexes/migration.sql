-- Migration: design tokens, offline preferences, project indexes
-- All statements use IF NOT EXISTS so this is safe to run on any DB state.
--
-- IMPORTANT: Table name casing follows Prisma model conventions.
--   PascalCase models (User, Project, DesignTokenSnapshot, OfflinePreference)
--   have no @@map() and therefore use PascalCase table names in Postgres.
--   Snake_case models (project_rows, scope_types, etc.) use @@map().

-- ── DesignTokenSnapshot ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DesignTokenSnapshot" (
    "id"          TEXT NOT NULL DEFAULT 'current',
    "overrides"   JSONB NOT NULL DEFAULT '{}',
    "savedById"   TEXT,
    "savedByName" TEXT,
    "savedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DesignTokenSnapshot_pkey" PRIMARY KEY ("id")
);

-- ── OfflinePreference ─────────────────────────────────────────────────────────
-- Stores per-user offline sync preferences.
-- modules: array of module IDs the user enabled for offline use.
CREATE TABLE IF NOT EXISTS "OfflinePreference" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "modules"   TEXT[] NOT NULL DEFAULT '{}',
    "syncedAt"  TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfflinePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OfflinePreference_userId_key"
    ON "OfflinePreference"("userId");

CREATE INDEX IF NOT EXISTS "OfflinePreference_userId_idx"
    ON "OfflinePreference"("userId");

DO $$ BEGIN
    ALTER TABLE "OfflinePreference"
        ADD CONSTRAINT "OfflinePreference_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Project table indexes ─────────────────────────────────────────────────────
-- "Project" is the Prisma-generated PascalCase table name (no @@map on the model).
CREATE INDEX IF NOT EXISTS "Project_deletedAt_idx"         ON "Project"("deletedAt");
CREATE INDEX IF NOT EXISTS "Project_status_idx"            ON "Project"("status");
CREATE INDEX IF NOT EXISTS "Project_salesforceId_idx"      ON "Project"("salesforceId");
CREATE INDEX IF NOT EXISTS "Project_unifierPid_idx"        ON "Project"("unifierPid");
CREATE INDEX IF NOT EXISTS "Project_installManagerId_idx"  ON "Project"("installManagerId");
CREATE INDEX IF NOT EXISTS "Project_projectManagerId_idx"  ON "Project"("projectManagerId");

-- ── project_rows: projectId index ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "project_rows_projectId_idx"
    ON "project_rows"("projectId");
