-- Keep inspection reporting tables normalized:
-- - submission owns project/unit/form/actor/date context
-- - answer owns only answer-specific values plus its question link
-- - deficiency owns only deficiency-specific values plus its answer link

-- Ensure every existing normalized deficiency has an answer link before making
-- the FK required. Backfill already populates this, but this statement makes
-- the migration safer if it runs after partial local testing.
UPDATE "inspection_deficiencies" d
SET "inspectionAnswerId" = a."id"
FROM "inspection_answers" a
WHERE d."inspectionAnswerId" IS NULL
  AND d."inspectionSubmissionId" = a."inspectionSubmissionId"
  AND d."questionId" = a."questionId";

-- Drop redundant answer FKs/indexes first.
ALTER TABLE "inspection_answers" DROP CONSTRAINT IF EXISTS "inspection_answers_clearInspectionId_fkey";
ALTER TABLE "inspection_answers" DROP CONSTRAINT IF EXISTS "inspection_answers_projectId_fkey";
ALTER TABLE "inspection_answers" DROP CONSTRAINT IF EXISTS "inspection_answers_unitId_fkey";
ALTER TABLE "inspection_answers" DROP CONSTRAINT IF EXISTS "inspection_answers_scopeRowId_fkey";
ALTER TABLE "inspection_answers" DROP CONSTRAINT IF EXISTS "inspection_answers_formId_fkey";
ALTER TABLE "inspection_answers" DROP CONSTRAINT IF EXISTS "inspection_answers_formVersionId_fkey";
ALTER TABLE "inspection_answers" DROP CONSTRAINT IF EXISTS "inspection_answers_answeredById_fkey";

DROP INDEX IF EXISTS "inspection_answers_clearInspectionId_idx";
DROP INDEX IF EXISTS "inspection_answers_projectId_idx";
DROP INDEX IF EXISTS "inspection_answers_unitId_idx";
DROP INDEX IF EXISTS "inspection_answers_scopeRowId_idx";
DROP INDEX IF EXISTS "inspection_answers_formId_idx";
DROP INDEX IF EXISTS "inspection_answers_formVersionId_idx";
DROP INDEX IF EXISTS "inspection_answers_answeredById_idx";
DROP INDEX IF EXISTS "inspection_answers_answeredAt_idx";
DROP INDEX IF EXISTS "inspection_answers_responseType_idx";

ALTER TABLE "inspection_answers"
  DROP COLUMN IF EXISTS "clearInspectionId",
  DROP COLUMN IF EXISTS "projectId",
  DROP COLUMN IF EXISTS "unitId",
  DROP COLUMN IF EXISTS "scopeRowId",
  DROP COLUMN IF EXISTS "formId",
  DROP COLUMN IF EXISTS "formVersionId",
  DROP COLUMN IF EXISTS "answeredById",
  DROP COLUMN IF EXISTS "answeredByName",
  DROP COLUMN IF EXISTS "answeredAt",
  DROP COLUMN IF EXISTS "questionTitle",
  DROP COLUMN IF EXISTS "sectionId",
  DROP COLUMN IF EXISTS "sectionTitle",
  DROP COLUMN IF EXISTS "responseType",
  DROP COLUMN IF EXISTS "isFailFollowUp",
  DROP COLUMN IF EXISTS "sourceParentQuestionId",
  DROP COLUMN IF EXISTS "parentQuestionTitle";

-- Drop redundant deficiency FKs/indexes/columns. All context is reachable via
-- inspection_deficiencies -> inspection_answers -> inspection_submissions.
ALTER TABLE "inspection_deficiencies" DROP CONSTRAINT IF EXISTS "inspection_deficiencies_inspectionSubmissionId_fkey";
ALTER TABLE "inspection_deficiencies" DROP CONSTRAINT IF EXISTS "inspection_deficiencies_clearInspectionId_fkey";
ALTER TABLE "inspection_deficiencies" DROP CONSTRAINT IF EXISTS "inspection_deficiencies_projectId_fkey";
ALTER TABLE "inspection_deficiencies" DROP CONSTRAINT IF EXISTS "inspection_deficiencies_unitId_fkey";
ALTER TABLE "inspection_deficiencies" DROP CONSTRAINT IF EXISTS "inspection_deficiencies_scopeRowId_fkey";
ALTER TABLE "inspection_deficiencies" DROP CONSTRAINT IF EXISTS "inspection_deficiencies_formId_fkey";
ALTER TABLE "inspection_deficiencies" DROP CONSTRAINT IF EXISTS "inspection_deficiencies_formVersionId_fkey";
ALTER TABLE "inspection_deficiencies" DROP CONSTRAINT IF EXISTS "inspection_deficiencies_inspectionAnswerId_fkey";

DROP INDEX IF EXISTS "inspection_deficiencies_submission_question_source_key";
DROP INDEX IF EXISTS "inspection_deficiencies_inspectionSubmissionId_idx";
DROP INDEX IF EXISTS "inspection_deficiencies_clearInspectionId_idx";
DROP INDEX IF EXISTS "inspection_deficiencies_projectId_idx";
DROP INDEX IF EXISTS "inspection_deficiencies_unitId_idx";
DROP INDEX IF EXISTS "inspection_deficiencies_scopeRowId_idx";

ALTER TABLE "inspection_deficiencies"
  DROP COLUMN IF EXISTS "inspectionSubmissionId",
  DROP COLUMN IF EXISTS "clearInspectionId",
  DROP COLUMN IF EXISTS "projectId",
  DROP COLUMN IF EXISTS "unitId",
  DROP COLUMN IF EXISTS "scopeRowId",
  DROP COLUMN IF EXISTS "formId",
  DROP COLUMN IF EXISTS "formVersionId",
  DROP COLUMN IF EXISTS "questionId",
  DROP COLUMN IF EXISTS "questionTitle";

ALTER TABLE "inspection_deficiencies"
  ALTER COLUMN "inspectionAnswerId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_deficiencies_answer_source_key"
  ON "inspection_deficiencies"("inspectionAnswerId", "sourceDeficiencyId");

DO $$ BEGIN
  ALTER TABLE "inspection_deficiencies"
    ADD CONSTRAINT "inspection_deficiencies_inspectionAnswerId_fkey"
    FOREIGN KEY ("inspectionAnswerId") REFERENCES "inspection_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
