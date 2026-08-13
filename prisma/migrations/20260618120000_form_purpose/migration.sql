-- Add form purpose: inspection (pass/fail rollup) vs documentation (capture only).
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'inspection';
