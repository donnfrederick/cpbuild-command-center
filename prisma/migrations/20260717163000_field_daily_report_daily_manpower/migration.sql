-- IM daily headcount per project report slice (nullable until entered).
ALTER TABLE "field_daily_report_projects" ADD COLUMN IF NOT EXISTS "dailyManpower" INTEGER;

-- Backfill from legacy workforce section comments when present.
UPDATE "field_daily_report_projects" AS p
SET "dailyManpower" = CAST(TRIM(c."body") AS INTEGER)
FROM "field_daily_report_comments" AS c
WHERE c."fieldDailyReportProjectId" = p."id"
  AND c."sectionKey" = 'workforce'
  AND c."itemKey" = ''
  AND TRIM(c."body") ~ '^[0-9]+$'
  AND CAST(TRIM(c."body") AS INTEGER) >= 0
  AND CAST(TRIM(c."body") AS INTEGER) <= 9999
  AND p."dailyManpower" IS NULL;
