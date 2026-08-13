-- Add standalone unit photo album columns to media_attachments.
-- Idempotent: safe to run multiple times.

ALTER TABLE "media_attachments"
  ADD COLUMN IF NOT EXISTS "unitPhotoProjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "unitPhotoUnitRef"   TEXT;

-- FK to projects (cascade delete when project is removed)
DO $$ BEGIN
  ALTER TABLE "media_attachments"
    ADD CONSTRAINT "media_attachments_unitPhotoProjectId_fkey"
    FOREIGN KEY ("unitPhotoProjectId")
    REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Composite index for album queries by project + unitRef
CREATE INDEX IF NOT EXISTS "media_attachments_unitPhotoProjectId_unitPhotoUnitRef_idx"
  ON "media_attachments" ("unitPhotoProjectId", "unitPhotoUnitRef");
