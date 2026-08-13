-- Track inspection offline sync failures in the project activity feed (one row per queued submission, upserted on retry).
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'INSPECTION_SYNC_FAILED';
