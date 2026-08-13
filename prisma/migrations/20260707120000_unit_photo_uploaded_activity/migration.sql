-- Activity log entry when a photo is added to a unit album.
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'UNIT_PHOTO_UPLOADED';
