-- Link calibration clear_inspections to the original clear they review.
-- Fully idempotent: safe to rerun if a prior deploy partially applied.

ALTER TABLE "clear_inspections"
  ADD COLUMN IF NOT EXISTS "calibrated_against_clear_inspection_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "clear_inspections"
    ADD CONSTRAINT "clear_inspections_calibrated_against_clear_inspection_id_fkey"
    FOREIGN KEY ("calibrated_against_clear_inspection_id")
    REFERENCES "clear_inspections"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "clear_inspections_calibrated_against_clear_inspection_id_idx"
  ON "clear_inspections"("calibrated_against_clear_inspection_id");

-- Backfill: each calibration → most recent prior clear on the same scope.
UPDATE "clear_inspections" cal
SET "calibrated_against_clear_inspection_id" = sub.ref_id
FROM (
  SELECT
    cal_inner.id AS cal_id,
    (
      SELECT ref.id
      FROM "clear_inspections" ref
      INNER JOIN "inspection_types" ref_it ON ref_it.id = ref."inspection_type_id"
      WHERE ref."rowId" = cal_inner."rowId"
        AND ref."deletedAt" IS NULL
        AND ref_it.code = 'CLEAR_INSPECTION'
        AND ref."createdAt" < cal_inner."createdAt"
      ORDER BY ref."createdAt" DESC
      LIMIT 1
    ) AS ref_id
  FROM "clear_inspections" cal_inner
  INNER JOIN "inspection_types" cal_it ON cal_it.id = cal_inner."inspection_type_id"
  WHERE cal_it.code = 'CALIBRATION_INSPECTION'
    AND cal_inner."calibrated_against_clear_inspection_id" IS NULL
) sub
WHERE cal.id = sub.cal_id
  AND sub.ref_id IS NOT NULL;
