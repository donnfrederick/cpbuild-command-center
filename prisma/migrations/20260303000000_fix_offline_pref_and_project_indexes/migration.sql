-- Migration: remediate migration 20260228000000 table name issues
--
-- Migration 20260228000000 was authored with incorrect table names:
--   "offline_preferences" (should be "OfflinePreference" — no @@map on model)
--   "users" in FK reference (should be "User")
--   "projects" in indexes (should be "Project")
--
-- This migration is idempotent and safe to run on any DB state.
-- It corrects DBs where the old version of migration 20260228000000 ran.

-- ── Fix OfflinePreference ────────────────────────────────────────────────────
-- If "offline_preferences" (wrong name from old migration) exists, migrate data
-- to "OfflinePreference" (correct name matching Prisma schema).

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'offline_preferences'
    ) THEN
        -- Create the correct table if it doesn't already exist
        CREATE TABLE IF NOT EXISTS "OfflinePreference" (
            "id"        TEXT NOT NULL,
            "userId"    TEXT NOT NULL,
            "modules"   TEXT[] NOT NULL DEFAULT '{}',
            "syncedAt"  TIMESTAMP(3),
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "OfflinePreference_pkey" PRIMARY KEY ("id")
        );

        -- Migrate any existing rows (id, userId only — other columns incompatible)
        INSERT INTO "OfflinePreference" ("id", "userId", "updatedAt")
        SELECT "id", "userId", "updatedAt"
        FROM "offline_preferences"
        ON CONFLICT ("id") DO NOTHING;

        -- Drop the old wrongly-named table
        DROP TABLE "offline_preferences";
    END IF;
END $$;

-- Ensure indexes and FK exist on "OfflinePreference"
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

-- ── Fix Project indexes ───────────────────────────────────────────────────────
-- Old migration used lowercase "projects" — drop those if they exist (no-op if not).
DROP INDEX IF EXISTS "projects_deletedAt_idx";
DROP INDEX IF EXISTS "projects_status_idx";
DROP INDEX IF EXISTS "projects_salesforceId_idx";
DROP INDEX IF EXISTS "projects_unifierPid_idx";
DROP INDEX IF EXISTS "projects_installManagerId_idx";
DROP INDEX IF EXISTS "projects_projectManagerId_idx";

-- Create correctly-named indexes on "Project" table.
CREATE INDEX IF NOT EXISTS "Project_deletedAt_idx"         ON "Project"("deletedAt");
CREATE INDEX IF NOT EXISTS "Project_status_idx"            ON "Project"("status");
CREATE INDEX IF NOT EXISTS "Project_salesforceId_idx"      ON "Project"("salesforceId");
CREATE INDEX IF NOT EXISTS "Project_unifierPid_idx"        ON "Project"("unifierPid");
CREATE INDEX IF NOT EXISTS "Project_installManagerId_idx"  ON "Project"("installManagerId");
CREATE INDEX IF NOT EXISTS "Project_projectManagerId_idx"  ON "Project"("projectManagerId");
