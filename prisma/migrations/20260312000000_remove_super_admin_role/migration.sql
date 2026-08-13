-- Remove SUPER_ADMIN role tier — fold all users and permissions into ADMIN.
-- Idempotent: safe to run multiple times.

-- 1. Re-assign any users currently holding SUPER_ADMIN to ADMIN
UPDATE "User"
SET "roleId" = (SELECT id FROM "roles" WHERE code = 'ADMIN')
WHERE "roleId" = (SELECT id FROM "roles" WHERE code = 'SUPER_ADMIN');

-- 2. Re-assign any pending invites targeting SUPER_ADMIN role to ADMIN
--    (FK is onDelete: Restrict — must clear before deleting the role row)
UPDATE "Invite"
SET "roleId" = (SELECT id FROM "roles" WHERE code = 'ADMIN')
WHERE "roleId" = (SELECT id FROM "roles" WHERE code = 'SUPER_ADMIN');

-- 3. Remove all role_permissions rows for SUPER_ADMIN
DELETE FROM "role_permissions"
WHERE "roleId" = (SELECT id FROM "roles" WHERE code = 'SUPER_ADMIN');

-- 4. Remove the SUPER_ADMIN role row itself
DELETE FROM "roles"
WHERE code = 'SUPER_ADMIN';
