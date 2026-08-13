-- Track per-scope subcontractor assignment (unifierSubId) separately from Location Builder edits.
ALTER TYPE "activity_event_type" ADD VALUE IF NOT EXISTS 'SCOPE_SUBCONTRACTOR_UPDATED';
