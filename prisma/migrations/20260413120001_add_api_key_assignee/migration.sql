-- Migration: add_api_key_assignee
-- Adds assignedToId to api_keys so a key can be linked to the user it was issued to.
-- This drives the API Access section on their Settings page.

ALTER TABLE "api_keys"
    ADD COLUMN "assignedToId" TEXT;

CREATE INDEX "api_keys_assignedToId_idx" ON "api_keys"("assignedToId");

ALTER TABLE "api_keys"
    ADD CONSTRAINT "api_keys_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
