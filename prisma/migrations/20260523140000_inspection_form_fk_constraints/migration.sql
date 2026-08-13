-- Enforce relational FK integrity for FORM inspection submissions and answers.
-- Requires backfill gate to pass first (npm run verify:inspection-reporting-backfill).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM inspection_submissions s
    INNER JOIN inspection_answers a ON a."inspectionSubmissionId" = s.id
    WHERE s.source = 'FORM'
      AND s."formVersionId" IS NOT NULL
      AND a."formVersionQuestionId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill required: FORM answers missing formVersionQuestionId. Run npm run backfill:inspection-reporting first.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM inspection_submissions
    WHERE source = 'FORM' AND "formVersionId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill required: FORM submissions missing formVersionId.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM inspection_answers WHERE "formVersionQuestionId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill required: inspection_answers rows missing formVersionQuestionId.';
  END IF;
END $$;

-- Drop legacy unique on (submission, source question id)
DROP INDEX IF EXISTS "inspection_answers_inspectionSubmissionId_questionId_key";

-- Tighten FK: version question delete restricted while answers reference it
ALTER TABLE "inspection_answers" DROP CONSTRAINT IF EXISTS "inspection_answers_formVersionQuestionId_fkey";
ALTER TABLE "inspection_answers" ALTER COLUMN "formVersionQuestionId" SET NOT NULL;
ALTER TABLE "inspection_answers"
  ADD CONSTRAINT "inspection_answers_formVersionQuestionId_fkey"
  FOREIGN KEY ("formVersionQuestionId") REFERENCES "inspection_form_version_questions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_answers_inspectionSubmissionId_formVersionQuestionId_key"
  ON "inspection_answers"("inspectionSubmissionId", "formVersionQuestionId");

-- FORM submissions must reference a published form version
ALTER TABLE "inspection_submissions" DROP CONSTRAINT IF EXISTS "inspection_submissions_form_requires_version";
ALTER TABLE "inspection_submissions"
  ADD CONSTRAINT "inspection_submissions_form_requires_version"
  CHECK (source <> 'FORM' OR "formVersionId" IS NOT NULL);
