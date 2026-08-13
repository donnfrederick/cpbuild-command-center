-- Migration: password_reset_and_login_security
-- Adds: PasswordResetToken table, login lockout fields on User

-- Add login-security columns to User
ALTER TABLE "User"
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil"         TIMESTAMP(3),
  ADD COLUMN "lastLoginAt"         TIMESTAMP(3);

-- Create password_reset_tokens table
CREATE TABLE "password_reset_tokens" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "tokenHash" TEXT         NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- Unique index on tokenHash for fast lookup + replay prevention
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key"
  ON "password_reset_tokens"("tokenHash");

-- Index for "invalidate all tokens for user" queries
CREATE INDEX "password_reset_tokens_userId_idx"
  ON "password_reset_tokens"("userId");

-- Foreign key: cascade delete when user is removed
ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
