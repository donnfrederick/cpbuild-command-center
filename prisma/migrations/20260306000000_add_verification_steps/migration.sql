-- AddColumn: verificationSteps on releases
-- JSON array of VerificationStep: { id, changeId, title, instructions, route, category }
-- Default is empty array so existing rows are unaffected.
-- Idempotent: safe to apply more than once.

ALTER TABLE "releases"
  ADD COLUMN IF NOT EXISTS "verificationSteps" JSONB NOT NULL DEFAULT '[]';
