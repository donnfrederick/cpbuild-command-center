-- Add INSTALL_DIRECTOR role — a director-level role above INSTALL_MANAGER.
-- Permissions are enforced in code (lib/permissions.ts). This row is required
-- so users can be assigned the role via the admin UI.
-- Idempotent: ON CONFLICT DO NOTHING ensures safe re-runs.

INSERT INTO "roles" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'INSTALL_DIRECTOR',
  'Install Director',
  'Director-level oversight of installation operations. Full project and unit management, issue ownership, and team invitation rights.',
  NOW(),
  NOW()
)
ON CONFLICT ("code") DO NOTHING;
