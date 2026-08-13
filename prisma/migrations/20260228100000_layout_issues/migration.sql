-- Migration: layout_issues table for DevTools spacing issue tracker
-- Screenshots stored as base64 TEXT — acceptable for dev tooling volume.
-- Migrate to object storage (R2/S3) if screenshot volume grows significantly.

-- ── Enum ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "LayoutIssueStatus" AS ENUM ('OPEN', 'FIXED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "layout_issues" (
    "id"          TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "device"      TEXT NOT NULL,
    "platform"    TEXT NOT NULL,
    "route"       TEXT NOT NULL,
    "status"      "LayoutIssueStatus" NOT NULL DEFAULT 'OPEN',
    -- Base64 data URL screenshot — nullable, can be large
    "screenshot"  TEXT,
    -- Set when status transitions to FIXED
    "fixRuleType" TEXT,
    "fixRuleName" TEXT,
    "fixNote"     TEXT,
    "fixedAt"     TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "layout_issues_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "layout_issues_status_idx"    ON "layout_issues"("status");
CREATE INDEX IF NOT EXISTS "layout_issues_createdAt_idx" ON "layout_issues"("createdAt");
