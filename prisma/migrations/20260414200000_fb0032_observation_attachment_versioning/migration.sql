-- FB-0032: Observation attachment versioning + activity enum values
SET search_path TO public;

-- activity_event_type: new values (idempotent)
DO $$ BEGIN
  ALTER TYPE "activity_event_type" ADD VALUE 'OBSERVATION_UPDATED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "activity_event_type" ADD VALUE 'OBSERVATION_IMAGE_VERSION_ADDED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- media_attachments: version chain + last marked
ALTER TABLE "media_attachments" ADD COLUMN IF NOT EXISTS "supersedesId" TEXT;
ALTER TABLE "media_attachments" ADD COLUMN IF NOT EXISTS "lastMarkedById" TEXT;
ALTER TABLE "media_attachments" ADD COLUMN IF NOT EXISTS "lastMarkedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "media_attachments"
    ADD CONSTRAINT "media_attachments_supersedesId_fkey"
    FOREIGN KEY ("supersedesId") REFERENCES "media_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "media_attachments"
    ADD CONSTRAINT "media_attachments_lastMarkedById_fkey"
    FOREIGN KEY ("lastMarkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "media_attachments_supersedesId_key" ON "media_attachments"("supersedesId");
