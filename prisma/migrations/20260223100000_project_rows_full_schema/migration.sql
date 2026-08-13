-- Drop lookup tables if they exist with wrong structure (allows re-running migration)
DROP TABLE IF EXISTS "scope_types" CASCADE;
DROP TABLE IF EXISTS "location_types" CASCADE;
DROP TABLE IF EXISTS "cost_types" CASCADE;
DROP TABLE IF EXISTS "install_teams" CASCADE;
DROP TABLE IF EXISTS "uom_types" CASCADE;

-- CreateTable: scope_types
CREATE TABLE "scope_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "scope_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scope_types_code_key" ON "scope_types"("code");

-- CreateTable: location_types
CREATE TABLE "location_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "location_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "location_types_code_key" ON "location_types"("code");

-- CreateTable: cost_types
CREATE TABLE "cost_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "cost_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cost_types_code_key" ON "cost_types"("code");

-- CreateTable: install_teams
CREATE TABLE "install_teams" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "install_teams_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "install_teams_code_key" ON "install_teams"("code");

-- CreateTable: uom_types
CREATE TABLE "uom_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "uom_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uom_types_code_key" ON "uom_types"("code");

-- AlterTable: project_rows - add new columns
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "buildPhase" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "scheme" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "scopeTypeId" TEXT;
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "csiPrimeCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "csiDetailCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "locationTypeId" TEXT;
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "costTypeId" TEXT;
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "installerId" TEXT;
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "uomId" TEXT;
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "unitRate" DECIMAL(18,4);
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "budgetedManHours" DECIMAL(18,4);
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "finishDate" TIMESTAMP(3);
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "percentComplete" DECIMAL(5,2);
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "actualManHours" DECIMAL(18,4);

-- Migrate scopeType (string) and uom (string) to FKs: insert distinct values into lookups, then set FKs
DO $$
DECLARE
  r RECORD;
  scope_id TEXT;
  uom_id TEXT;
BEGIN
  -- Populate scope_types from distinct scopeType values (if column exists)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_rows' AND column_name='scopeType') THEN
    FOR r IN SELECT DISTINCT "scopeType" FROM "project_rows" WHERE "scopeType" IS NOT NULL AND TRIM("scopeType") != ''
    LOOP
      INSERT INTO "scope_types" ("id", "code", "name") VALUES (gen_random_uuid()::text, r."scopeType", r."scopeType")
      ON CONFLICT ("code") DO NOTHING;
    END LOOP;
    -- Set scopeTypeId from scopeType string
    UPDATE "project_rows" pr SET "scopeTypeId" = st."id"
    FROM "scope_types" st
    WHERE pr."scopeType" = st."code" AND pr."scopeType" IS NOT NULL AND TRIM(pr."scopeType") != '';
    ALTER TABLE "project_rows" DROP COLUMN IF EXISTS "scopeType";
  END IF;

  -- Populate uom_types from distinct uom values (if column exists)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_rows' AND column_name='uom') THEN
    FOR r IN SELECT DISTINCT "uom" FROM "project_rows" WHERE "uom" IS NOT NULL AND TRIM("uom") != ''
    LOOP
      INSERT INTO "uom_types" ("id", "code", "name") VALUES (gen_random_uuid()::text, r."uom", r."uom")
      ON CONFLICT ("code") DO NOTHING;
    END LOOP;
    UPDATE "project_rows" pr SET "uomId" = ut."id"
    FROM "uom_types" ut
    WHERE pr."uom" = ut."code" AND pr."uom" IS NOT NULL AND TRIM(pr."uom") != '';
    ALTER TABLE "project_rows" DROP COLUMN IF EXISTS "uom";
  END IF;
END $$;

-- Change qty from DOUBLE PRECISION to DECIMAL if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_rows' AND column_name='qty') THEN
    ALTER TABLE "project_rows" ALTER COLUMN "qty" TYPE DECIMAL(18,4) USING "qty"::decimal(18,4);
  END IF;
END $$;

-- Ensure area has default for NOT NULL (if it was nullable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_rows' AND column_name='area') THEN
    ALTER TABLE "project_rows" ALTER COLUMN "area" SET DEFAULT '';
    UPDATE "project_rows" SET "area" = COALESCE("area", '') WHERE "area" IS NULL;
    ALTER TABLE "project_rows" ALTER COLUMN "area" SET NOT NULL;
  END IF;
END $$;

-- Clear orphaned FKs before adding constraints (only null out references that don't exist in lookup tables)
UPDATE "project_rows" pr SET "scopeTypeId" = NULL WHERE pr."scopeTypeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "scope_types" st WHERE st."id" = pr."scopeTypeId");
UPDATE "project_rows" pr SET "uomId" = NULL WHERE pr."uomId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "uom_types" ut WHERE ut."id" = pr."uomId");
UPDATE "project_rows" pr SET "locationTypeId" = NULL WHERE pr."locationTypeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "location_types" lt WHERE lt."id" = pr."locationTypeId");
UPDATE "project_rows" pr SET "costTypeId" = NULL WHERE pr."costTypeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "cost_types" ct WHERE ct."id" = pr."costTypeId");
UPDATE "project_rows" pr SET "installerId" = NULL WHERE pr."installerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "install_teams" it WHERE it."id" = pr."installerId");

-- Add foreign keys (ignore if already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_rows_scopeTypeId_fkey') THEN
    ALTER TABLE "project_rows" ADD CONSTRAINT "project_rows_scopeTypeId_fkey" FOREIGN KEY ("scopeTypeId") REFERENCES "scope_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_rows_locationTypeId_fkey') THEN
    ALTER TABLE "project_rows" ADD CONSTRAINT "project_rows_locationTypeId_fkey" FOREIGN KEY ("locationTypeId") REFERENCES "location_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_rows_costTypeId_fkey') THEN
    ALTER TABLE "project_rows" ADD CONSTRAINT "project_rows_costTypeId_fkey" FOREIGN KEY ("costTypeId") REFERENCES "cost_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_rows_installerId_fkey') THEN
    ALTER TABLE "project_rows" ADD CONSTRAINT "project_rows_installerId_fkey" FOREIGN KEY ("installerId") REFERENCES "install_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_rows_uomId_fkey') THEN
    ALTER TABLE "project_rows" ADD CONSTRAINT "project_rows_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "uom_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
