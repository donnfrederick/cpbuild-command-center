-- project_rows was created without createdAt / updatedAt columns.
-- The Prisma schema declares both fields (@default(now()) and @updatedAt),
-- and the raw INSERT in lib/project-rows.ts includes them in every bulk insert.
-- Add them now so the DB matches the schema.

ALTER TABLE "project_rows"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "project_rows"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
