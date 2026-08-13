-- Add screenshots array to feedback_reports (FT-0033: multi-image feedback upload)
ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "screenshots" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
