-- Add clone provenance fields for Admin duplicate-as-test projects
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clonedFromProjectId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "sourceUnifierPid" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clonedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Project_clonedFromProjectId_idx" ON "Project"("clonedFromProjectId");

DO $$ BEGIN
  ALTER TABLE "Project"
    ADD CONSTRAINT "Project_clonedFromProjectId_fkey"
    FOREIGN KEY ("clonedFromProjectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Retire auto-bootstrapped sandbox projects (soft-delete only)
UPDATE "Project"
SET "deletedAt" = NOW(), "updatedAt" = NOW()
WHERE "unifierPid" = '__TEST_SANDBOX__'
  AND "deletedAt" IS NULL;

-- Activity log enum value for clone events
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'PROJECT_CLONED_AS_TEST';
