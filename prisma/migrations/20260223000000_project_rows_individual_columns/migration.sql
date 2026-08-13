-- Ensure Project and project_rows exist (missing from init; required for fresh DBs e.g. Railway)
DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('Active', 'Completed', 'Planning', 'OnHold');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL,
  "projectName" TEXT NOT NULL,
  "siteLocation" TEXT NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'Planning',
  "startDate" TIMESTAMP(3),
  "salesforceId" TEXT,
  "installManagerId" TEXT,
  "installManagerName" TEXT,
  "projectManagerId" TEXT,
  "projectManagerName" TEXT NOT NULL,
  "unifierPid" TEXT,
  "unifierProjectNumber" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "upmData" JSONB,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Project_salesforceId_key" ON "Project"("salesforceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Project_unifierPid_key" ON "Project"("unifierPid");

CREATE TABLE IF NOT EXISTS "project_rows" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "rowIndex" INTEGER NOT NULL,
  "rowData" JSONB,
  CONSTRAINT "project_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_rows_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable: Replace rowData JSON with individual columns for project_rows
-- Add new columns with defaults
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "building" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "level" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "unitType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "scopeType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "qty" DOUBLE PRECISION;
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "uom" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "area" TEXT;
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "shipPhase" TEXT;

-- Migrate existing rowData JSON to new columns (if rowData exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_rows' AND column_name = 'rowData'
  ) THEN
    UPDATE "project_rows"
    SET
      "building" = COALESCE("rowData"->>'Building', ''),
      "level" = COALESCE("rowData"->>'Level', ''),
      "unit" = COALESCE("rowData"->>'Unit', ''),
      "unitType" = COALESCE("rowData"->>'Unit Type', ''),
      "description" = COALESCE("rowData"->>'Description', ''),
      "scopeType" = COALESCE("rowData"->>'Scope Type', ''),
      "qty" = CASE
        WHEN "rowData"->>'QTY' IS NULL OR "rowData"->>'QTY' = '' THEN NULL
        ELSE (("rowData"->>'QTY')::text)::double precision
      END,
      "uom" = COALESCE("rowData"->>'UOM', ''),
      "area" = NULLIF(TRIM("rowData"->>'Area'), ''),
      "shipPhase" = NULLIF(TRIM(COALESCE("rowData"->>'Ship. Phase', "rowData"->>'Ship Phase')), '')
    WHERE "rowData" IS NOT NULL;

    ALTER TABLE "project_rows" DROP COLUMN "rowData";
  END IF;
END $$;

-- CreateIndex for common query pattern
CREATE INDEX IF NOT EXISTS "project_rows_projectId_building_level_unit_idx" ON "project_rows"("projectId", "building", "level", "unit");
