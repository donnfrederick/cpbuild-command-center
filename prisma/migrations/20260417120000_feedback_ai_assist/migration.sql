-- Feedback AI-assisted flow: mark rows that went through the Gemini-assisted
-- conversation and persist the structured metadata (transcript + final report).
-- Additive and idempotent — safe to re-run; existing rows default to aiAssisted=false.

ALTER TABLE "feedback_reports"
  ADD COLUMN IF NOT EXISTS "aiAssisted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "feedback_reports"
  ADD COLUMN IF NOT EXISTS "aiAssistMetadata" JSONB;

-- Index aiAssisted so the inbox can filter AI-drafted items without a full scan.
CREATE INDEX IF NOT EXISTS "feedback_reports_aiAssisted_idx"
  ON "feedback_reports" ("aiAssisted");
