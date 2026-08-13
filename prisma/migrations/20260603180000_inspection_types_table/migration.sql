-- Normalize clear inspection type: enum column → inspection_types lookup + FK.
-- Fully idempotent: safe to rerun if a prior deploy partially applied.

CREATE TABLE IF NOT EXISTS "inspection_types" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "inspection_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_types_code_key" ON "inspection_types"("code");

INSERT INTO "inspection_types" ("id", "code", "name")
VALUES
  ('insp_type_clear', 'CLEAR_INSPECTION', 'Clear Inspection'),
  ('insp_type_calibration', 'CALIBRATION_INSPECTION', 'Calibration Inspection')
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "clear_inspections"
  ADD COLUMN IF NOT EXISTS "inspection_type_id" TEXT;

-- Backfill from legacy enum column when present (dev after #1027).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'clear_inspections'
      AND column_name = 'inspectionType'
  ) THEN
    UPDATE "clear_inspections" ci
    SET "inspection_type_id" = it.id
    FROM "inspection_types" it
    WHERE ci."inspection_type_id" IS NULL
      AND it.code = ci."inspectionType"::text;
  END IF;
END $$;

-- Backfill from linked submission category when enum column is absent or row still null.
UPDATE "clear_inspections" ci
SET "inspection_type_id" = it.id
FROM "inspection_submissions" s
LEFT JOIN forms f ON f.id = s."formId"
JOIN "inspection_types" it ON it.code = CASE
  WHEN COALESCE(s."templateSnapshot"->>'category', f.category) = 'CALIBRATION_INSPECTION'
    THEN 'CALIBRATION_INSPECTION'
  ELSE 'CLEAR_INSPECTION'
END
WHERE ci."inspectionSubmissionId" = s.id
  AND ci."inspection_type_id" IS NULL;

-- Default any remaining rows to CLEAR_INSPECTION.
UPDATE "clear_inspections" ci
SET "inspection_type_id" = it.id
FROM "inspection_types" it
WHERE ci."inspection_type_id" IS NULL
  AND it.code = 'CLEAR_INSPECTION';

ALTER TABLE "clear_inspections"
  ALTER COLUMN "inspection_type_id" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "clear_inspections"
    ADD CONSTRAINT "clear_inspections_inspection_type_id_fkey"
    FOREIGN KEY ("inspection_type_id") REFERENCES "inspection_types"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "clear_inspections_inspection_type_id_idx"
  ON "clear_inspections"("inspection_type_id");

DROP INDEX IF EXISTS "clear_inspections_inspectionType_idx";

ALTER TABLE "clear_inspections" DROP COLUMN IF EXISTS "inspectionType";

DROP TYPE IF EXISTS "clear_inspection_type";

-- Who performed the inspection (BI joins User; backfill from linked submission).
ALTER TABLE "clear_inspections"
  ADD COLUMN IF NOT EXISTS "inspected_by_id" TEXT;

UPDATE "clear_inspections" ci
SET "inspected_by_id" = s."submittedById"
FROM "inspection_submissions" s
WHERE ci."inspectionSubmissionId" = s.id
  AND ci."inspected_by_id" IS NULL
  AND s."submittedById" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "clear_inspections"
    ADD CONSTRAINT "clear_inspections_inspected_by_id_fkey"
    FOREIGN KEY ("inspected_by_id") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "clear_inspections_inspected_by_id_idx"
  ON "clear_inspections"("inspected_by_id");

-- Calibrations previously had submissions only — create matching history rows.
INSERT INTO "clear_inspections" (
  "id",
  "rowId",
  "status",
  "inspection_type_id",
  "inspectionSubmissionId",
  "inspected_by_id",
  "createdAt",
  "updatedAt"
)
SELECT
  'insp_hist_' || replace(gen_random_uuid()::text, '-', ''),
  s."scopeRowId",
  CASE WHEN s.outcome = 'FAIL' THEN 'FAILED'::"ClearInspectionStatus" ELSE 'PASSED'::"ClearInspectionStatus" END,
  it.id,
  s.id,
  s."submittedById",
  s."submittedAt",
  s."submittedAt"
FROM "inspection_submissions" s
JOIN "inspection_types" it ON it.code = 'CALIBRATION_INSPECTION'
WHERE s."scopeRowId" IS NOT NULL
  AND s.source = 'FORM'
  AND COALESCE(s."templateSnapshot"->>'category', '') = 'CALIBRATION_INSPECTION'
  AND NOT EXISTS (
    SELECT 1 FROM "clear_inspections" ci WHERE ci."inspectionSubmissionId" = s.id
  );

-- BACKFILL submissions: create history rows where missing (inspector on clear_inspections).
INSERT INTO "clear_inspections" (
  "id",
  "rowId",
  "status",
  "inspection_type_id",
  "inspectionSubmissionId",
  "inspected_by_id",
  "createdAt",
  "updatedAt"
)
SELECT
  'insp_hist_' || replace(gen_random_uuid()::text, '-', ''),
  s."scopeRowId",
  CASE WHEN s.outcome = 'FAIL' THEN 'FAILED'::"ClearInspectionStatus" ELSE 'PASSED'::"ClearInspectionStatus" END,
  it.id,
  s.id,
  s."submittedById",
  s."submittedAt",
  s."submittedAt"
FROM "inspection_submissions" s
JOIN "inspection_types" it ON it.code = 'CLEAR_INSPECTION'
WHERE s.source = 'BACKFILL'
  AND s."scopeRowId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "clear_inspections" ci WHERE ci."inspectionSubmissionId" = s.id
  );

-- Inspector lives on clear_inspections only; drop redundant submission author columns.
ALTER TABLE "inspection_submissions" DROP CONSTRAINT IF EXISTS "inspection_submissions_submittedById_fkey";
ALTER TABLE "inspection_submissions" DROP COLUMN IF EXISTS "submittedById";
ALTER TABLE "inspection_submissions" DROP COLUMN IF EXISTS "submittedByName";
