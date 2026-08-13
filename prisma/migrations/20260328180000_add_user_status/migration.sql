-- CreateEnum (idempotent — type may already exist if a prior failed attempt ran)
DO $$ BEGIN
  CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "status" "user_status" NOT NULL DEFAULT 'ACTIVE';
