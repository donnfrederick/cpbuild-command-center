-- Add SUPER_ADMIN role (full access, same as ADMIN)
INSERT INTO "roles" ("id", "code", "name", "description", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'SUPER_ADMIN', 'Super Admin', 'Full access to all features including Users dashboard', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- Assign all permissions to Super Admin (same as Admin)
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'SUPER_ADMIN'
AND NOT EXISTS (
  SELECT 1 FROM "role_permissions" rp
  WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
);
