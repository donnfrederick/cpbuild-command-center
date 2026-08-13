-- Migration: add agent identity fields to User table
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "agentName"     TEXT,
  ADD COLUMN IF NOT EXISTS "agentCallsign" TEXT,
  ADD COLUMN IF NOT EXISTS "agentMission"  TEXT;
