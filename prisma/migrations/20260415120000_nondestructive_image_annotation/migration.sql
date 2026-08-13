-- Non-destructive observation image annotations (JSON overlay on unchanged base file)
SET search_path TO public;

DO $$ BEGIN
  ALTER TYPE "activity_event_type" ADD VALUE 'OBSERVATION_ANNOTATION_UPDATED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "media_attachments" ADD COLUMN IF NOT EXISTS "imageAnnotation" JSONB;
