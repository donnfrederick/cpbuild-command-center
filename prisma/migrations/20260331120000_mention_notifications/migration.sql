-- Make feedbackId optional on notifications (was required, blocks new notification types)
ALTER TABLE "notifications" ALTER COLUMN "feedbackId" DROP NOT NULL;

-- Add mention notification fields
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "actorId"          TEXT,
  ADD COLUMN IF NOT EXISTS "actorName"        TEXT,
  ADD COLUMN IF NOT EXISTS "projectId"        TEXT,
  ADD COLUMN IF NOT EXISTS "issueId"          TEXT,
  ADD COLUMN IF NOT EXISTS "observationId"    TEXT,
  ADD COLUMN IF NOT EXISTS "mentionCommentId" TEXT;

-- Extend the NotificationType enum with mention variants
-- PostgreSQL requires ADD VALUE outside a transaction block
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MENTIONED_IN_COMMENT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MENTIONED_IN_ISSUE_NOTES';
