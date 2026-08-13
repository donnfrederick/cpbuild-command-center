-- Activity type for non-destructive issue image markup saves
SET search_path TO public;

DO $$ BEGIN
  ALTER TYPE "activity_event_type" ADD VALUE 'ISSUE_ANNOTATION_UPDATED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
