-- BI Reader Role Setup
-- Run once against the production Supabase PostgreSQL database.
-- Creates a read-only role "bi_reader" with SELECT on all tables,
-- then revokes access to purely security/session tables that have no BI value.
--
-- USAGE: Replace PLACEHOLDER_BI_READER_PASSWORD below with the actual password
-- (stored in Railway as BI_READER_PASSWORD), then run via psql or Supabase SQL editor.
-- Do NOT commit the real password — keep it in Railway secrets only.
--
-- NOTE: Steps 3–7 (grants, default privileges, revokes, and User column grants)
-- are also re-applied idempotently on every Railway deploy by
-- scripts/bootstrap-bi-reader-grants.ts. That keeps new tables added by future
-- migrations visible to bi_reader without requiring manual SQL. This file is
-- still the source of truth for the one-time role creation (steps 1–2) because
-- CREATE ROLE requires superuser privileges the Railway app role does not have.

-- 1. Create the role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bi_reader') THEN
    CREATE ROLE bi_reader WITH LOGIN PASSWORD 'PLACEHOLDER_BI_READER_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END;
$$;

-- 2. Allow connection to the database
GRANT CONNECT ON DATABASE postgres TO bi_reader;

-- 3. Allow schema inspection
GRANT USAGE ON SCHEMA public TO bi_reader;

-- 4. Grant SELECT on all existing tables
--    Tosh (BI analyst) needs access to all data tables for full analysis.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bi_reader;

-- 5. Ensure SELECT is granted on any future tables too
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bi_reader;

-- 6. Revoke access to tables with sensitive auth/security data
--    These contain credentials, session tokens, or failed-login tracking.
REVOKE SELECT ON "Session" FROM bi_reader;
REVOKE SELECT ON "Account" FROM bi_reader;
REVOKE SELECT ON "VerificationToken" FROM bi_reader;
REVOKE SELECT ON password_reset_tokens FROM bi_reader;

-- 7. Column-level SELECT on "User" — all columns except passwordHash
REVOKE SELECT ON "User" FROM bi_reader;
GRANT SELECT (
  id,
  email,
  "emailVerified",
  name,
  image,
  "roleId",
  status,
  "failedLoginAttempts",
  "lockedUntil",
  "lastLoginAt",
  "createdAt",
  "updatedAt",
  "unifierUserId",
  "unifierUsername",
  "agentName",
  "agentCallsign",
  "agentMission"
) ON "User" TO bi_reader;

-- Drop legacy view if present from older setups
DROP VIEW IF EXISTS user_public_info;

-- 8. Verify
SELECT rolname, rolcanlogin, rolsuper FROM pg_roles WHERE rolname = 'bi_reader';
