-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ClearInspectionStatus" AS ENUM ('PASSED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "clear_inspections" (
  "id"        TEXT NOT NULL,
  "rowId"     TEXT NOT NULL,
  "status"    "ClearInspectionStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clear_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "clear_inspections_rowId_idx" ON "clear_inspections"("rowId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "clear_inspections"
    ADD CONSTRAINT "clear_inspections_rowId_fkey"
    FOREIGN KEY ("rowId") REFERENCES "project_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
