-- Migration: backfill_devtools_permission_name
-- The original developer_role_permissions migration inserted access:devtools
-- without a name value (name column was added to the schema after that migration ran).
-- This migration backfills the name on existing DBs.
-- Idempotent: only updates rows where name is blank or missing.

UPDATE permissions
SET name = 'Access DevTools'
WHERE code = 'access:devtools'
  AND (name IS NULL OR name = '');
