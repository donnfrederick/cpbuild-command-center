-- Test project batch seeding: TestSeedBatch model + testSeedBatchId FKs + activity enum values
-- Idempotent for drifted dev DBs and recoverable deploys.

CREATE TABLE IF NOT EXISTS "test_seed_batches" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_seed_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "test_seed_batches_projectId_idx" ON "test_seed_batches"("projectId");

DO $$ BEGIN
  ALTER TABLE "test_seed_batches" ADD CONSTRAINT "test_seed_batches_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "test_seed_batches" ADD CONSTRAINT "test_seed_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "project_issues" ADD COLUMN IF NOT EXISTS "testSeedBatchId" TEXT;
CREATE INDEX IF NOT EXISTS "project_issues_testSeedBatchId_idx" ON "project_issues"("testSeedBatchId");
DO $$ BEGIN
  ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_testSeedBatchId_fkey" FOREIGN KEY ("testSeedBatchId") REFERENCES "test_seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "issue_comments" ADD COLUMN IF NOT EXISTS "testSeedBatchId" TEXT;
CREATE INDEX IF NOT EXISTS "issue_comments_testSeedBatchId_idx" ON "issue_comments"("testSeedBatchId");
DO $$ BEGIN
  ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_testSeedBatchId_fkey" FOREIGN KEY ("testSeedBatchId") REFERENCES "test_seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "project_observations" ADD COLUMN IF NOT EXISTS "testSeedBatchId" TEXT;
CREATE INDEX IF NOT EXISTS "project_observations_testSeedBatchId_idx" ON "project_observations"("testSeedBatchId");
DO $$ BEGIN
  ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_testSeedBatchId_fkey" FOREIGN KEY ("testSeedBatchId") REFERENCES "test_seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "observation_comments" ADD COLUMN IF NOT EXISTS "testSeedBatchId" TEXT;
CREATE INDEX IF NOT EXISTS "observation_comments_testSeedBatchId_idx" ON "observation_comments"("testSeedBatchId");
DO $$ BEGIN
  ALTER TABLE "observation_comments" ADD CONSTRAINT "observation_comments_testSeedBatchId_fkey" FOREIGN KEY ("testSeedBatchId") REFERENCES "test_seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "clear_inspections" ADD COLUMN IF NOT EXISTS "testSeedBatchId" TEXT;
CREATE INDEX IF NOT EXISTS "clear_inspections_testSeedBatchId_idx" ON "clear_inspections"("testSeedBatchId");
DO $$ BEGIN
  ALTER TABLE "clear_inspections" ADD CONSTRAINT "clear_inspections_testSeedBatchId_fkey" FOREIGN KEY ("testSeedBatchId") REFERENCES "test_seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "inspection_submissions" ADD COLUMN IF NOT EXISTS "testSeedBatchId" TEXT;
CREATE INDEX IF NOT EXISTS "inspection_submissions_testSeedBatchId_idx" ON "inspection_submissions"("testSeedBatchId");
DO $$ BEGIN
  ALTER TABLE "inspection_submissions" ADD CONSTRAINT "inspection_submissions_testSeedBatchId_fkey" FOREIGN KEY ("testSeedBatchId") REFERENCES "test_seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "media_attachments" ADD COLUMN IF NOT EXISTS "testSeedBatchId" TEXT;
CREATE INDEX IF NOT EXISTS "media_attachments_testSeedBatchId_idx" ON "media_attachments"("testSeedBatchId");
DO $$ BEGIN
  ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_testSeedBatchId_fkey" FOREIGN KEY ("testSeedBatchId") REFERENCES "test_seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "testSeedBatchId" TEXT;
CREATE INDEX IF NOT EXISTS "activity_logs_testSeedBatchId_idx" ON "activity_logs"("testSeedBatchId");
DO $$ BEGIN
  ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_testSeedBatchId_fkey" FOREIGN KEY ("testSeedBatchId") REFERENCES "test_seed_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'PROJECT_TEST_DATA_SEEDED';
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'PROJECT_TEST_DATA_BATCH_REMOVED';
