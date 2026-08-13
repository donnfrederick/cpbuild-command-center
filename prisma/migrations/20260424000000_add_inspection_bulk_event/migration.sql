-- Add SCOPE_INSPECTION_BULK_UPDATED to the ActivityEventType enum.
-- Idempotent: EXCEPTION block silently ignores duplicate_object errors on re-run.
DO $$ BEGIN
  ALTER TYPE "activity_event_type" ADD VALUE 'SCOPE_INSPECTION_BULK_UPDATED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
