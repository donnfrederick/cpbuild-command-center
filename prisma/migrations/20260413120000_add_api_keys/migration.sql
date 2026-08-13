-- Migration: add_api_keys
-- Adds the ApiKeyParty enum and ApiKey table for the read-only BI/reporting API.

CREATE TYPE "api_key_party" AS ENUM ('INTERNAL', 'SUBCONTRACTOR', 'GENERAL_CONTRACTOR');

CREATE TABLE "api_keys" (
    "id"                TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "keyHash"           TEXT NOT NULL,
    "keyPrefix"         TEXT NOT NULL,
    "scopes"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "allowedProjectIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "party"             "api_key_party" NOT NULL DEFAULT 'INTERNAL',
    "createdById"       TEXT NOT NULL,
    "lastUsedAt"        TIMESTAMP(3),
    "expiresAt"         TIMESTAMP(3),
    "revokedAt"         TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX "api_keys_createdById_idx" ON "api_keys"("createdById");

ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
