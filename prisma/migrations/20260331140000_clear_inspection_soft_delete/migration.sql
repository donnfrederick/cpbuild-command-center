-- Add soft-delete support to clear_inspections
ALTER TABLE "clear_inspections"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
