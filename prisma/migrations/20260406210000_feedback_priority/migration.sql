-- Optional triage priority on feedback reports (LOW | MEDIUM | HIGH).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedbackPriority') THEN
    CREATE TYPE "FeedbackPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
  END IF;
END $$;

ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "priority" "FeedbackPriority";

CREATE INDEX IF NOT EXISTS "feedback_reports_priority_idx" ON "feedback_reports" ("priority");
