-- Normalize inspection deficiencies out of inspection_submissions.payload.
-- Idempotent so it is safe in environments where a prior db push partially applied changes.

-- Link form-backed clear inspection history rows to their source submission.
ALTER TABLE "clear_inspections"
  ADD COLUMN IF NOT EXISTS "inspectionSubmissionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "clear_inspections_inspectionSubmissionId_key"
  ON "clear_inspections"("inspectionSubmissionId")
  WHERE "inspectionSubmissionId" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "clear_inspections"
    ADD CONSTRAINT "clear_inspections_inspectionSubmissionId_fkey"
    FOREIGN KEY ("inspectionSubmissionId") REFERENCES "inspection_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- One row per deficiency captured in a failed PASS_FAIL_DEFICIENCIES answer.
CREATE TABLE IF NOT EXISTS "inspection_deficiencies" (
  "id"                     TEXT NOT NULL,
  "inspectionSubmissionId" TEXT NOT NULL,
  "clearInspectionId"      TEXT,
  "projectId"              TEXT NOT NULL,
  "unitId"                 TEXT NOT NULL,
  "scopeRowId"             TEXT,
  "formId"                 TEXT,
  "formVersionId"          TEXT,
  "questionId"             TEXT NOT NULL,
  "questionTitle"          TEXT NOT NULL,
  "sourceDeficiencyId"     TEXT NOT NULL,
  "description"            TEXT NOT NULL,
  "severity"               TEXT,
  "count"                  INTEGER NOT NULL DEFAULT 1,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_deficiencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_deficiencies_submission_question_source_key"
  ON "inspection_deficiencies"("inspectionSubmissionId", "questionId", "sourceDeficiencyId");
CREATE INDEX IF NOT EXISTS "inspection_deficiencies_inspectionSubmissionId_idx"
  ON "inspection_deficiencies"("inspectionSubmissionId");
CREATE INDEX IF NOT EXISTS "inspection_deficiencies_clearInspectionId_idx"
  ON "inspection_deficiencies"("clearInspectionId");
CREATE INDEX IF NOT EXISTS "inspection_deficiencies_projectId_idx"
  ON "inspection_deficiencies"("projectId");
CREATE INDEX IF NOT EXISTS "inspection_deficiencies_unitId_idx"
  ON "inspection_deficiencies"("unitId");
CREATE INDEX IF NOT EXISTS "inspection_deficiencies_scopeRowId_idx"
  ON "inspection_deficiencies"("scopeRowId");

DO $$ BEGIN
  ALTER TABLE "inspection_deficiencies"
    ADD CONSTRAINT "inspection_deficiencies_inspectionSubmissionId_fkey"
    FOREIGN KEY ("inspectionSubmissionId") REFERENCES "inspection_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_deficiencies"
    ADD CONSTRAINT "inspection_deficiencies_clearInspectionId_fkey"
    FOREIGN KEY ("clearInspectionId") REFERENCES "clear_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_deficiencies"
    ADD CONSTRAINT "inspection_deficiencies_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_deficiencies"
    ADD CONSTRAINT "inspection_deficiencies_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "project_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_deficiencies"
    ADD CONSTRAINT "inspection_deficiencies_scopeRowId_fkey"
    FOREIGN KEY ("scopeRowId") REFERENCES "project_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_deficiencies"
    ADD CONSTRAINT "inspection_deficiencies_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_deficiencies"
    ADD CONSTRAINT "inspection_deficiencies_formVersionId_fkey"
    FOREIGN KEY ("formVersionId") REFERENCES "form_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- One row per media item attached to a normalized deficiency.
CREATE TABLE IF NOT EXISTS "inspection_deficiency_media" (
  "id"                     TEXT NOT NULL,
  "inspectionDeficiencyId" TEXT NOT NULL,
  "storageUrl"             TEXT NOT NULL,
  "storageKey"             TEXT,
  "mimeType"               TEXT,
  "fileSizeBytes"          INTEGER,
  "localUrl"               TEXT,
  "caption"                TEXT,
  "imageAnnotation"        JSONB,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_deficiency_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_deficiency_media_deficiency_storage_url_key"
  ON "inspection_deficiency_media"("inspectionDeficiencyId", "storageUrl");
CREATE INDEX IF NOT EXISTS "inspection_deficiency_media_inspectionDeficiencyId_idx"
  ON "inspection_deficiency_media"("inspectionDeficiencyId");

DO $$ BEGIN
  ALTER TABLE "inspection_deficiency_media"
    ADD CONSTRAINT "inspection_deficiency_media_inspectionDeficiencyId_fkey"
    FOREIGN KEY ("inspectionDeficiencyId") REFERENCES "inspection_deficiencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
