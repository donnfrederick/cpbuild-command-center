-- Add author FK on field daily report comments (vet PR #1854)

DO $$ BEGIN
    ALTER TABLE "field_daily_report_comments"
        ADD CONSTRAINT "field_daily_report_comments_authorUserId_fkey"
        FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
