-- Normalize inspection form definitions, published questions, submitted answers,
-- and deficiency-to-answer links for app reporting and BI.
-- Idempotent for safe deploys after partial db push/migration attempts.

CREATE TABLE IF NOT EXISTS "inspection_form_sections" (
  "id"              TEXT NOT NULL,
  "formId"          TEXT NOT NULL,
  "sourceSectionId" TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "displayOrder"    INTEGER NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_form_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_form_sections_formId_sourceSectionId_key"
  ON "inspection_form_sections"("formId", "sourceSectionId");
CREATE INDEX IF NOT EXISTS "inspection_form_sections_formId_idx"
  ON "inspection_form_sections"("formId");

DO $$ BEGIN
  ALTER TABLE "inspection_form_sections"
    ADD CONSTRAINT "inspection_form_sections_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "inspection_form_questions" (
  "id"                              TEXT NOT NULL,
  "formId"                          TEXT NOT NULL,
  "sectionId"                       TEXT NOT NULL,
  "sourceQuestionId"                TEXT NOT NULL,
  "sourceSectionId"                 TEXT NOT NULL,
  "title"                           TEXT NOT NULL,
  "description"                     TEXT,
  "responseType"                    TEXT NOT NULL,
  "options"                         JSONB,
  "required"                        BOOLEAN NOT NULL DEFAULT false,
  "photoRequired"                   BOOLEAN NOT NULL DEFAULT false,
  "deficiencyPhotoRequired"         BOOLEAN NOT NULL DEFAULT false,
  "deficiencyDescriptionEnabled"    BOOLEAN,
  "isFailFollowUp"                  BOOLEAN NOT NULL DEFAULT false,
  "sourceParentQuestionId"          TEXT,
  "parentQuestionTitle"             TEXT,
  "displayOrder"                    INTEGER NOT NULL,
  "rawQuestion"                     JSONB NOT NULL,
  "createdAt"                       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_form_questions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_form_questions_formId_sourceQuestionId_key"
  ON "inspection_form_questions"("formId", "sourceQuestionId");
CREATE INDEX IF NOT EXISTS "inspection_form_questions_formId_idx"
  ON "inspection_form_questions"("formId");
CREATE INDEX IF NOT EXISTS "inspection_form_questions_sectionId_idx"
  ON "inspection_form_questions"("sectionId");
CREATE INDEX IF NOT EXISTS "inspection_form_questions_sourceQuestionId_idx"
  ON "inspection_form_questions"("sourceQuestionId");
CREATE INDEX IF NOT EXISTS "inspection_form_questions_responseType_idx"
  ON "inspection_form_questions"("responseType");

DO $$ BEGIN
  ALTER TABLE "inspection_form_questions"
    ADD CONSTRAINT "inspection_form_questions_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_form_questions"
    ADD CONSTRAINT "inspection_form_questions_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "inspection_form_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "inspection_form_version_sections" (
  "id"              TEXT NOT NULL,
  "formVersionId"   TEXT NOT NULL,
  "sourceSectionId" TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "displayOrder"    INTEGER NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_form_version_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_form_version_sections_formVersionId_sourceSectionId_key"
  ON "inspection_form_version_sections"("formVersionId", "sourceSectionId");
CREATE INDEX IF NOT EXISTS "inspection_form_version_sections_formVersionId_idx"
  ON "inspection_form_version_sections"("formVersionId");

DO $$ BEGIN
  ALTER TABLE "inspection_form_version_sections"
    ADD CONSTRAINT "inspection_form_version_sections_formVersionId_fkey"
    FOREIGN KEY ("formVersionId") REFERENCES "form_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "inspection_form_version_questions" (
  "id"                              TEXT NOT NULL,
  "formVersionId"                   TEXT NOT NULL,
  "sectionId"                       TEXT NOT NULL,
  "sourceQuestionId"                TEXT NOT NULL,
  "sourceSectionId"                 TEXT NOT NULL,
  "title"                           TEXT NOT NULL,
  "description"                     TEXT,
  "responseType"                    TEXT NOT NULL,
  "options"                         JSONB,
  "required"                        BOOLEAN NOT NULL DEFAULT false,
  "photoRequired"                   BOOLEAN NOT NULL DEFAULT false,
  "deficiencyPhotoRequired"         BOOLEAN NOT NULL DEFAULT false,
  "deficiencyDescriptionEnabled"    BOOLEAN,
  "isFailFollowUp"                  BOOLEAN NOT NULL DEFAULT false,
  "sourceParentQuestionId"          TEXT,
  "parentQuestionTitle"             TEXT,
  "displayOrder"                    INTEGER NOT NULL,
  "rawQuestion"                     JSONB NOT NULL,
  "createdAt"                       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_form_version_questions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_form_version_questions_formVersionId_sourceQuestionId_key"
  ON "inspection_form_version_questions"("formVersionId", "sourceQuestionId");
CREATE INDEX IF NOT EXISTS "inspection_form_version_questions_formVersionId_idx"
  ON "inspection_form_version_questions"("formVersionId");
CREATE INDEX IF NOT EXISTS "inspection_form_version_questions_sectionId_idx"
  ON "inspection_form_version_questions"("sectionId");
CREATE INDEX IF NOT EXISTS "inspection_form_version_questions_sourceQuestionId_idx"
  ON "inspection_form_version_questions"("sourceQuestionId");
CREATE INDEX IF NOT EXISTS "inspection_form_version_questions_responseType_idx"
  ON "inspection_form_version_questions"("responseType");

DO $$ BEGIN
  ALTER TABLE "inspection_form_version_questions"
    ADD CONSTRAINT "inspection_form_version_questions_formVersionId_fkey"
    FOREIGN KEY ("formVersionId") REFERENCES "form_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_form_version_questions"
    ADD CONSTRAINT "inspection_form_version_questions_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "inspection_form_version_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "inspection_answers" (
  "id"                     TEXT NOT NULL,
  "inspectionSubmissionId" TEXT NOT NULL,
  "clearInspectionId"      TEXT,
  "projectId"              TEXT NOT NULL,
  "unitId"                 TEXT NOT NULL,
  "scopeRowId"             TEXT,
  "formId"                 TEXT,
  "formVersionId"          TEXT,
  "formVersionQuestionId"  TEXT,
  "answeredById"           TEXT,
  "answeredByName"         TEXT NOT NULL,
  "answeredAt"             TIMESTAMP(3) NOT NULL,
  "questionId"             TEXT NOT NULL,
  "questionTitle"          TEXT NOT NULL,
  "sectionId"              TEXT,
  "sectionTitle"           TEXT,
  "responseType"           TEXT NOT NULL,
  "isFailFollowUp"         BOOLEAN NOT NULL DEFAULT false,
  "sourceParentQuestionId" TEXT,
  "parentQuestionTitle"    TEXT,
  "choiceValue"            TEXT,
  "choicesValue"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "textValue"              TEXT,
  "numberValue"            NUMERIC(18, 4),
  "ratingValue"            INTEGER,
  "rawAnswer"              JSONB NOT NULL,
  "isFailed"               BOOLEAN NOT NULL DEFAULT false,
  "isNotApplicable"        BOOLEAN NOT NULL DEFAULT false,
  "hasDeficiencies"        BOOLEAN NOT NULL DEFAULT false,
  "deficiencyCount"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspection_answers_inspectionSubmissionId_questionId_key"
  ON "inspection_answers"("inspectionSubmissionId", "questionId");
CREATE INDEX IF NOT EXISTS "inspection_answers_inspectionSubmissionId_idx"
  ON "inspection_answers"("inspectionSubmissionId");
CREATE INDEX IF NOT EXISTS "inspection_answers_clearInspectionId_idx"
  ON "inspection_answers"("clearInspectionId");
CREATE INDEX IF NOT EXISTS "inspection_answers_projectId_idx"
  ON "inspection_answers"("projectId");
CREATE INDEX IF NOT EXISTS "inspection_answers_unitId_idx"
  ON "inspection_answers"("unitId");
CREATE INDEX IF NOT EXISTS "inspection_answers_scopeRowId_idx"
  ON "inspection_answers"("scopeRowId");
CREATE INDEX IF NOT EXISTS "inspection_answers_formId_idx"
  ON "inspection_answers"("formId");
CREATE INDEX IF NOT EXISTS "inspection_answers_formVersionId_idx"
  ON "inspection_answers"("formVersionId");
CREATE INDEX IF NOT EXISTS "inspection_answers_formVersionQuestionId_idx"
  ON "inspection_answers"("formVersionQuestionId");
CREATE INDEX IF NOT EXISTS "inspection_answers_answeredById_idx"
  ON "inspection_answers"("answeredById");
CREATE INDEX IF NOT EXISTS "inspection_answers_answeredAt_idx"
  ON "inspection_answers"("answeredAt");
CREATE INDEX IF NOT EXISTS "inspection_answers_questionId_idx"
  ON "inspection_answers"("questionId");
CREATE INDEX IF NOT EXISTS "inspection_answers_responseType_idx"
  ON "inspection_answers"("responseType");

DO $$ BEGIN
  ALTER TABLE "inspection_answers"
    ADD CONSTRAINT "inspection_answers_inspectionSubmissionId_fkey"
    FOREIGN KEY ("inspectionSubmissionId") REFERENCES "inspection_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_answers"
    ADD CONSTRAINT "inspection_answers_clearInspectionId_fkey"
    FOREIGN KEY ("clearInspectionId") REFERENCES "clear_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_answers"
    ADD CONSTRAINT "inspection_answers_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_answers"
    ADD CONSTRAINT "inspection_answers_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "project_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_answers"
    ADD CONSTRAINT "inspection_answers_scopeRowId_fkey"
    FOREIGN KEY ("scopeRowId") REFERENCES "project_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_answers"
    ADD CONSTRAINT "inspection_answers_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_answers"
    ADD CONSTRAINT "inspection_answers_formVersionId_fkey"
    FOREIGN KEY ("formVersionId") REFERENCES "form_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_answers"
    ADD CONSTRAINT "inspection_answers_formVersionQuestionId_fkey"
    FOREIGN KEY ("formVersionQuestionId") REFERENCES "inspection_form_version_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "inspection_answers"
    ADD CONSTRAINT "inspection_answers_answeredById_fkey"
    FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "inspection_deficiencies"
  ADD COLUMN IF NOT EXISTS "inspectionAnswerId" TEXT;

CREATE INDEX IF NOT EXISTS "inspection_deficiencies_inspectionAnswerId_idx"
  ON "inspection_deficiencies"("inspectionAnswerId");

DO $$ BEGIN
  ALTER TABLE "inspection_deficiencies"
    ADD CONSTRAINT "inspection_deficiencies_inspectionAnswerId_fkey"
    FOREIGN KEY ("inspectionAnswerId") REFERENCES "inspection_answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
