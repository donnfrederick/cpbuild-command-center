-- Track who set daily manpower and when (per report project row).
ALTER TABLE "field_daily_report_projects"
  ADD COLUMN IF NOT EXISTS "dailyManpowerSetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dailyManpowerSetByUserId" TEXT;

DO $$ BEGIN
  ALTER TABLE "field_daily_report_projects"
    ADD CONSTRAINT "field_daily_report_projects_dailyManpowerSetByUserId_fkey"
    FOREIGN KEY ("dailyManpowerSetByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "field_daily_report_projects_dailyManpowerSetByUserId_idx"
  ON "field_daily_report_projects"("dailyManpowerSetByUserId");
