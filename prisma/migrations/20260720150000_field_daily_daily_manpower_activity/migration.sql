-- Activity log event when daily manpower is set or cleared on a field daily report.
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'FIELD_DAILY_DAILY_MANPOWER_SET';
