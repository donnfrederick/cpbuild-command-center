-- Feedback assignee + FEEDBACK_ASSIGNED notification type
-- PostgreSQL: enum value outside transaction (IF NOT EXISTS for idempotency)

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FEEDBACK_ASSIGNED';

ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;

CREATE INDEX IF NOT EXISTS "feedback_reports_assigneeId_idx" ON "feedback_reports"("assigneeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_assigneeId_fkey'
  ) THEN
    ALTER TABLE "feedback_reports"
      ADD CONSTRAINT "feedback_reports_assigneeId_fkey"
      FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
