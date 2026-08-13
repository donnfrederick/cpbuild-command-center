-- MUTATION_SYNC_FAILED: offline mutation queue upload failure (observations, issues, status, etc.)
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'MUTATION_SYNC_FAILED';
