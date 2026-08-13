-- AlterTable: add unifierSubId to project_rows
-- Stores UNIFIER_UXSUB.ID for subcontractor assignment.
-- Nullable — no default required.
ALTER TABLE "project_rows" ADD COLUMN IF NOT EXISTS "unifierSubId" TEXT;
