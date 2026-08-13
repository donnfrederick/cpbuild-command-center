-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isTestProject" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_isTestProject_idx" ON "Project"("isTestProject");
