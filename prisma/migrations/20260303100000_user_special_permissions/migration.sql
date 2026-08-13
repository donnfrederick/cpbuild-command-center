-- Migration: user_special_permissions table
-- Stores per-user permission grants that override role defaults.
-- A SUPER_ADMIN or ADMIN can grant any permission to any user regardless of role.

CREATE TABLE IF NOT EXISTS "user_special_permissions" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "permission"  TEXT NOT NULL,
    "grantedById" TEXT,
    "note"        TEXT,
    "grantedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_special_permissions_pkey" PRIMARY KEY ("id")
);

-- One row per (user, permission) pair — no duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "user_special_permissions_userId_permission_key"
    ON "user_special_permissions"("userId", "permission");

CREATE INDEX IF NOT EXISTS "user_special_permissions_userId_idx"
    ON "user_special_permissions"("userId");

-- FK: user who receives the permission
DO $$ BEGIN
    ALTER TABLE "user_special_permissions"
        ADD CONSTRAINT "user_special_permissions_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- FK: admin who granted it (nullable — set null if granter is deleted)
DO $$ BEGIN
    ALTER TABLE "user_special_permissions"
        ADD CONSTRAINT "user_special_permissions_grantedById_fkey"
        FOREIGN KEY ("grantedById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
