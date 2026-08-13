-- Create forms and form_versions tables (and related enums).
-- These were previously applied only via `prisma db push` in local dev
-- environments and were never tracked as a migration, so Railway never
-- created them. This migration is fully idempotent.

-- 1. form_status enum
DO $$ BEGIN
  CREATE TYPE "form_status" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. forms table
CREATE TABLE IF NOT EXISTS "forms" (
  "id"             TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "status"         "form_status" NOT NULL DEFAULT 'DRAFT',
  "level"          TEXT NOT NULL,
  "category"       TEXT NOT NULL,
  "scopeTypeCodes" TEXT[] NOT NULL DEFAULT '{}',
  "draftSections"  JSONB,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- 3. form_versions table
CREATE TABLE IF NOT EXISTS "form_versions" (
  "id"            TEXT NOT NULL,
  "formId"        TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "sections"      JSONB NOT NULL,
  "publishedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedById" TEXT,
  CONSTRAINT "form_versions_pkey" PRIMARY KEY ("id")
);

-- 4. Unique constraint on form_versions(formId, versionNumber)
DO $$ BEGIN
  ALTER TABLE "form_versions"
    ADD CONSTRAINT "form_versions_formId_versionNumber_key"
    UNIQUE ("formId", "versionNumber");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 5. FK: form_versions.formId → forms.id (CASCADE delete)
DO $$ BEGIN
  ALTER TABLE "form_versions"
    ADD CONSTRAINT "form_versions_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 6. FK: forms.createdById → users.id (SET NULL on delete)
DO $$ BEGIN
  ALTER TABLE "forms"
    ADD CONSTRAINT "forms_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 7. FK: form_versions.publishedById → users.id (SET NULL on delete)
DO $$ BEGIN
  ALTER TABLE "form_versions"
    ADD CONSTRAINT "form_versions_publishedById_fkey"
    FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 8. FK: inspection_submissions.formId → forms.id (nullable)
DO $$ BEGIN
  ALTER TABLE "inspection_submissions"
    ADD CONSTRAINT "inspection_submissions_formId_fkey"
    FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 9. FK: inspection_submissions.formVersionId → form_versions.id (nullable)
DO $$ BEGIN
  ALTER TABLE "inspection_submissions"
    ADD CONSTRAINT "inspection_submissions_formVersionId_fkey"
    FOREIGN KEY ("formVersionId") REFERENCES "form_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
