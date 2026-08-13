-- CreateEnum (idempotent — partial failed runs may have left the type)
DO $$ BEGIN
  CREATE TYPE "FeedbackSource" AS ENUM ('IN_APP', 'MARKER_IO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable: add shortId as autoincrement (SERIAL) — existing rows get sequential values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feedback_reports'
      AND column_name = 'shortId'
  ) THEN
    ALTER TABLE "feedback_reports" ADD COLUMN "shortId" SERIAL NOT NULL;
  END IF;
END $$;

-- Renumber existing rows in createdAt order so shortIds are chronologically consistent
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "feedback_reports"
)
UPDATE "feedback_reports"
SET "shortId" = ranked.rn
FROM ranked
WHERE "feedback_reports".id = ranked.id;

-- Advance the sequence past the highest assigned shortId (empty table: use 1, is_called false)
SELECT setval(
  pg_get_serial_sequence('"feedback_reports"', 'shortId'),
  COALESCE((SELECT MAX("shortId") FROM "feedback_reports"), 1),
  (SELECT EXISTS (SELECT 1 FROM "feedback_reports" LIMIT 1))
);

-- Add unique constraint on shortId
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_reports_shortId_key" ON "feedback_reports"("shortId");

-- AlterTable: add source column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'feedback_reports'
      AND column_name = 'source'
  ) THEN
    ALTER TABLE "feedback_reports" ADD COLUMN "source" "FeedbackSource" NOT NULL DEFAULT 'IN_APP';
  END IF;
END $$;

-- AlterTable: add videoUrl column
ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;

-- CreateIndex for source-based filtering
CREATE INDEX IF NOT EXISTS "feedback_reports_source_idx" ON "feedback_reports"("source");
