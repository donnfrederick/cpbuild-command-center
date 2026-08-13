-- CreateEnum: issue_type
DO $$ BEGIN
  CREATE TYPE "issue_type" AS ENUM ('SUBSTRATE_CONDITION', 'DAMAGED_MATERIALS', 'MISSING_MATERIALS', 'TRADE_DAMAGE_REPAIR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: issue_status
DO $$ BEGIN
  CREATE TYPE "issue_status" AS ENUM ('OPEN', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: responsible_party
DO $$ BEGIN
  CREATE TYPE "responsible_party" AS ENUM (
    'CP_BUILD', 'ELECTRICIAN', 'PLUMBER', 'CARPENTER', 'GENERAL_CONTRACTOR',
    'FRAMING', 'DRYWALL', 'FLOORING', 'PAINTING', 'HVAC', 'FIRE_PROTECTION', 'LOW_VOLTAGE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: observation_type
DO $$ BEGIN
  CREATE TYPE "observation_type" AS ENUM ('QUALITY', 'PROGRESS', 'SAFETY', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: transcript_status
DO $$ BEGIN
  CREATE TYPE "transcript_status" AS ENUM ('NONE', 'PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: project_issues
CREATE TABLE IF NOT EXISTS "project_issues" (
    "id"                 TEXT NOT NULL,
    "projectId"          TEXT NOT NULL,
    "projectRowId"       TEXT NOT NULL,
    "subScopeInstanceId" TEXT,
    "shortDescription"   TEXT NOT NULL,
    "issueType"          "issue_type" NOT NULL,
    "responsibleParty"   "responsible_party" NOT NULL,
    "isBlockingWork"     BOOLEAN NOT NULL DEFAULT false,
    "status"             "issue_status" NOT NULL DEFAULT 'OPEN',
    "resolvedAt"         TIMESTAMP(3),
    "resolvedById"       TEXT,
    "createdById"        TEXT NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable: issue_comments
CREATE TABLE IF NOT EXISTS "issue_comments" (
    "id"        TEXT NOT NULL,
    "issueId"   TEXT NOT NULL,
    "authorId"  TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "editedAt"  TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "issue_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: project_observations
CREATE TABLE IF NOT EXISTS "project_observations" (
    "id"                 TEXT NOT NULL,
    "projectId"          TEXT NOT NULL,
    "projectRowId"       TEXT NOT NULL,
    "subScopeInstanceId" TEXT,
    "description"        TEXT NOT NULL,
    "observationType"    "observation_type" NOT NULL,
    "authorId"           TEXT NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: observation_comments
CREATE TABLE IF NOT EXISTS "observation_comments" (
    "id"            TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "authorId"      TEXT NOT NULL,
    "body"          TEXT NOT NULL,
    "editedAt"      TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "observation_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: media_attachments
CREATE TABLE IF NOT EXISTS "media_attachments" (
    "id"                   TEXT NOT NULL,
    "storageKey"           TEXT NOT NULL,
    "storageUrl"           TEXT NOT NULL,
    "mimeType"             TEXT NOT NULL,
    "fileSizeBytes"        INTEGER,
    "durationSeconds"      DOUBLE PRECISION,
    "thumbnailUrl"         TEXT,
    "transcriptStatus"     "transcript_status" NOT NULL DEFAULT 'NONE',
    "transcriptLanguage"   TEXT,
    "transcriptOriginal"   TEXT,
    "transcriptEnglish"    TEXT,
    "issueId"              TEXT,
    "issueCommentId"       TEXT,
    "observationId"        TEXT,
    "observationCommentId" TEXT,
    "uploadedById"         TEXT NOT NULL,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: content_translations
CREATE TABLE IF NOT EXISTS "content_translations" (
    "id"          TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId"   TEXT NOT NULL,
    "sourceLang"  TEXT NOT NULL,
    "targetLang"  TEXT NOT NULL,
    "translated"  TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "content_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes (idempotent)
CREATE INDEX IF NOT EXISTS "project_issues_projectId_idx" ON "project_issues"("projectId");
CREATE INDEX IF NOT EXISTS "project_issues_projectRowId_idx" ON "project_issues"("projectRowId");
CREATE INDEX IF NOT EXISTS "issue_comments_issueId_idx" ON "issue_comments"("issueId");
CREATE INDEX IF NOT EXISTS "project_observations_projectId_idx" ON "project_observations"("projectId");
CREATE INDEX IF NOT EXISTS "project_observations_projectRowId_idx" ON "project_observations"("projectRowId");
CREATE INDEX IF NOT EXISTS "observation_comments_observationId_idx" ON "observation_comments"("observationId");
CREATE INDEX IF NOT EXISTS "media_attachments_issueId_idx" ON "media_attachments"("issueId");
CREATE INDEX IF NOT EXISTS "media_attachments_observationId_idx" ON "media_attachments"("observationId");
CREATE INDEX IF NOT EXISTS "media_attachments_issueCommentId_idx" ON "media_attachments"("issueCommentId");
CREATE INDEX IF NOT EXISTS "media_attachments_observationCommentId_idx" ON "media_attachments"("observationCommentId");
CREATE UNIQUE INDEX IF NOT EXISTS "content_translations_contentType_contentId_targetLang_key"
  ON "content_translations"("contentType", "contentId", "targetLang");
CREATE INDEX IF NOT EXISTS "content_translations_contentId_idx" ON "content_translations"("contentId");

-- AddForeignKeys (wrapped in DO blocks for idempotency)
DO $$ BEGIN
  ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_projectRowId_fkey"
    FOREIGN KEY ("projectRowId") REFERENCES "project_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_subScopeInstanceId_fkey"
    FOREIGN KEY ("subScopeInstanceId") REFERENCES "project_sub_scope_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_issues" ADD CONSTRAINT "project_issues_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "project_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_projectRowId_fkey"
    FOREIGN KEY ("projectRowId") REFERENCES "project_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_subScopeInstanceId_fkey"
    FOREIGN KEY ("subScopeInstanceId") REFERENCES "project_sub_scope_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_observations" ADD CONSTRAINT "project_observations_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "observation_comments" ADD CONSTRAINT "observation_comments_observationId_fkey"
    FOREIGN KEY ("observationId") REFERENCES "project_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "observation_comments" ADD CONSTRAINT "observation_comments_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "project_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_issueCommentId_fkey"
    FOREIGN KEY ("issueCommentId") REFERENCES "issue_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_observationId_fkey"
    FOREIGN KEY ("observationId") REFERENCES "project_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_observationCommentId_fkey"
    FOREIGN KEY ("observationCommentId") REFERENCES "observation_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
