-- Ensure activity_logs table and supporting objects exist.
-- The 20260331160000_activity_log migration was marked as applied in
-- _prisma_migrations without its SQL ever running, so the table was never
-- created. This migration re-applies the same idempotent SQL so that
-- prisma migrate deploy creates the table on the next deploy.
--
-- Root cause: the original migration referenced "projects" (lowercase) inside a
-- PL/pgSQL DO block, but the actual Prisma-managed table is "Project" (PascalCase,
-- no @@map on model Project). That wrong name caused every apply attempt to fail.
-- Fix: correct table name "public"."Project" + SET search_path for Railway Postgres.

SET search_path TO public;

-- Enum (idempotent via conditional DDL)
DO $$ BEGIN
  CREATE TYPE "activity_event_type" AS ENUM (
    'SCOPE_STATUS_UPDATED',
    'SCOPE_STATUS_BULK_UPDATED',
    'ISSUE_CREATED',
    'ISSUE_BULK_CREATED',
    'ISSUE_RESOLVED',
    'ISSUE_REOPENED',
    'CLEAR_INSPECTION_SET',
    'OBSERVATION_CREATED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Table
CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id"         TEXT NOT NULL,
  "projectId"  TEXT NOT NULL,
  "userId"     TEXT,
  "userName"   TEXT,
  "eventType"  "activity_event_type" NOT NULL,
  "metadata"   JSONB NOT NULL DEFAULT '{}',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- FK constraint — DO block for idempotency; both tables schema-qualified so
-- this works regardless of connection search_path.
DO $$ BEGIN
  ALTER TABLE "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "activity_logs_projectId_createdAt_idx"
  ON "activity_logs"("projectId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "activity_logs_projectId_eventType_idx"
  ON "activity_logs"("projectId", "eventType");

CREATE INDEX IF NOT EXISTS "activity_logs_projectId_userId_idx"
  ON "activity_logs"("projectId", "userId");
