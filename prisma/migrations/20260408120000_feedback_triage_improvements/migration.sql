-- Add new FeedbackStatus enum values
ALTER TYPE "FeedbackStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_RESPONSE';
ALTER TYPE "FeedbackStatus" ADD VALUE IF NOT EXISTS 'NEEDS_INVESTIGATION';
ALTER TYPE "FeedbackStatus" ADD VALUE IF NOT EXISTS 'WONT_FIX';
ALTER TYPE "FeedbackStatus" ADD VALUE IF NOT EXISTS 'DELETED';

-- Add new NotificationType enum value
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FEEDBACK_DUPLICATE_RESOLVED';

-- Create feedback_duplicates table
CREATE TABLE IF NOT EXISTS "feedback_duplicates" (
    "id" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "duplicateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_duplicates_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: each report can only be a duplicate of one canonical
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_duplicates_duplicateId_key" ON "feedback_duplicates"("duplicateId");

-- Index for fast lookup by canonical
CREATE INDEX IF NOT EXISTS "feedback_duplicates_canonicalId_idx" ON "feedback_duplicates"("canonicalId");

-- Foreign keys
ALTER TABLE "feedback_duplicates"
    ADD CONSTRAINT "feedback_duplicates_canonicalId_fkey"
    FOREIGN KEY ("canonicalId") REFERENCES "feedback_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_duplicates"
    ADD CONSTRAINT "feedback_duplicates_duplicateId_fkey"
    FOREIGN KEY ("duplicateId") REFERENCES "feedback_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
