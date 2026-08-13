-- Idempotent: recovery if a prior run created enums/then failed on FK (wrong "users" ref).
DO $$ BEGIN
    CREATE TYPE "BacklogItemSource" AS ENUM ('MANUAL', 'AI_SUGGESTED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "BacklogItemStatus" AS ENUM ('ACTIVE', 'DISMISSED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "backlog_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "source" "BacklogItemSource" NOT NULL DEFAULT 'MANUAL',
    "status" "BacklogItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "backlog_items_userId_status_idx" ON "backlog_items"("userId", "status");

DO $$ BEGIN
    ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
