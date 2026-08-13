-- Add activity_event_type enum (idempotent)
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

-- Create activity_logs table (idempotent)
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

-- Foreign key to projects
DO $$ BEGIN
  ALTER TABLE "activity_logs"
    ADD CONSTRAINT "activity_logs_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
