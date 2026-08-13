-- Migration: developer_role_permissions
-- Adds access:devtools permission and wires it to ADMIN and DEVELOPER roles.
-- Also ensures DEVELOPER has view:team permission in the DB.
-- All inserts are idempotent (ON CONFLICT DO NOTHING).

-- 1. Add access:devtools permission code
INSERT INTO permissions (id, code, name)
VALUES (gen_random_uuid(), 'access:devtools', 'Access DevTools')
ON CONFLICT (code) DO NOTHING;

-- 2. Grant ADMIN: access:devtools
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'ADMIN' AND p.code = 'access:devtools'
ON CONFLICT DO NOTHING;

-- 3. Grant SUPER_ADMIN: access:devtools
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'SUPER_ADMIN' AND p.code = 'access:devtools'
ON CONFLICT DO NOTHING;

-- 4. Grant DEVELOPER: access:devtools
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'DEVELOPER' AND p.code = 'access:devtools'
ON CONFLICT DO NOTHING;

-- 5. Grant DEVELOPER: view:team (ensures DB matches in-code ROLE_PERMISSIONS)
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'DEVELOPER' AND p.code = 'view:team'
ON CONFLICT DO NOTHING;

-- 6. Grant DEVELOPER: projects:view
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'DEVELOPER' AND p.code = 'projects:view'
ON CONFLICT DO NOTHING;

-- 7. Grant DEVELOPER: dashboard:view
INSERT INTO role_permissions ("roleId", "permissionId")
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'DEVELOPER' AND p.code = 'dashboard:view'
ON CONFLICT DO NOTHING;
