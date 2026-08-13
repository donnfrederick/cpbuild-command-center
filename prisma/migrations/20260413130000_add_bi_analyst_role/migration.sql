-- Add BI_ANALYST role for internal Business Intelligence consumers (e.g. Tosh / Power BI reporting).
-- Read-only access to project data via the web app and the /api/bi/v1 endpoints.
-- Idempotent: ON CONFLICT DO NOTHING ensures safe re-runs.

INSERT INTO "roles" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'BI_ANALYST', 'BI Analyst', 'Read-only access for internal BI reporting', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
