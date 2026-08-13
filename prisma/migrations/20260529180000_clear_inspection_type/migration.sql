-- Add clear_inspections.inspectionType for BI.
-- Fully idempotent: safe to rerun if a prior deploy partially applied.

DO $$ BEGIN
  CREATE TYPE "clear_inspection_type" AS ENUM ('CLEAR_INSPECTION', 'CALIBRATION_INSPECTION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "clear_inspections"
  ADD COLUMN IF NOT EXISTS "inspectionType" "clear_inspection_type" NOT NULL DEFAULT 'CLEAR_INSPECTION';

-- Backfill from submission stub category, falling back to forms.category when stub is empty.
UPDATE "clear_inspections" ci
SET "inspectionType" = CASE
  WHEN COALESCE(s."templateSnapshot"->>'category', f.category) = 'CALIBRATION_INSPECTION'
    THEN 'CALIBRATION_INSPECTION'::"clear_inspection_type"
  ELSE 'CLEAR_INSPECTION'::"clear_inspection_type"
END
FROM "inspection_submissions" s
LEFT JOIN forms f ON f.id = s."formId"
WHERE ci."inspectionSubmissionId" = s.id;

CREATE INDEX IF NOT EXISTS "clear_inspections_inspectionType_idx" ON "clear_inspections"("inspectionType");
