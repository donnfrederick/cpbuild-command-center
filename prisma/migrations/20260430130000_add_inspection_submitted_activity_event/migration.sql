-- Add INSPECTION_SUBMITTED to the activity_event_type enum.
-- This new value tracks when a form-based inspection is submitted or edited
-- via the /api/inspection-submissions endpoints.
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'INSPECTION_SUBMITTED';
