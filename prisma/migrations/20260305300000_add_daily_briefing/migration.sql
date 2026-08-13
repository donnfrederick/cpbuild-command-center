-- CreateTable: daily_briefings
-- Stores Phil's AI-generated daily morning briefing (one row per calendar day).

CREATE TABLE IF NOT EXISTS "daily_briefings" (
    "id"          TEXT NOT NULL,
    "dateFor"     DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,
    "report"      JSONB NOT NULL,

    CONSTRAINT "daily_briefings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_briefings_dateFor_key" ON "daily_briefings"("dateFor");
CREATE INDEX IF NOT EXISTS "daily_briefings_dateFor_idx" ON "daily_briefings"("dateFor");
