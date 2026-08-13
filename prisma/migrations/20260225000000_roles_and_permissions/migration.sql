-- CreateTable: roles (avoid conflict with Role enum type)
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: permissions
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: role_permissions
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert default roles (codes match old enum + new roles)
INSERT INTO "roles" ("id", "code", "name", "description", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'ADMIN', 'Admin', 'Full access to all features', NOW(), NOW()),
  (gen_random_uuid()::text, 'TEAM_LEAD', 'Team Lead', 'Team management and project oversight', NOW(), NOW()),
  (gen_random_uuid()::text, 'DESIGNER', 'Designer', 'Design system and UI', NOW(), NOW()),
  (gen_random_uuid()::text, 'MEMBER', 'Member', 'Base access', NOW(), NOW()),
  (gen_random_uuid()::text, 'PRODUCT', 'Product', 'Product management', NOW(), NOW()),
  (gen_random_uuid()::text, 'DEVELOPER', 'Developer', 'Development and technical', NOW(), NOW()),
  (gen_random_uuid()::text, 'EXECUTIVE', 'Executive', 'Executive access', NOW(), NOW()),
  (gen_random_uuid()::text, 'CONTROLS_MANAGER', 'Controls Manager', 'Project controls', NOW(), NOW()),
  (gen_random_uuid()::text, 'INSTALL_MANAGER', 'Install Manager', 'Installation management', NOW(), NOW()),
  (gen_random_uuid()::text, 'PROJECT_MANAGER', 'Project Manager', 'Project management', NOW(), NOW()),
  (gen_random_uuid()::text, 'PROJECT_COORDINATOR', 'Project Coordinator', 'Project coordination', NOW(), NOW());

-- Insert default permissions
INSERT INTO "permissions" ("id", "code", "name", "description", "createdAt") VALUES
  (gen_random_uuid()::text, 'invite:member', 'Invite members', 'Send invitations to new team members', NOW()),
  (gen_random_uuid()::text, 'view:team', 'View team', 'View team directory', NOW()),
  (gen_random_uuid()::text, 'manage:roles', 'Manage roles', 'Assign roles and permissions', NOW()),
  (gen_random_uuid()::text, 'remove:member', 'Remove members', 'Remove team members', NOW()),
  (gen_random_uuid()::text, 'design:edit', 'Edit design system', 'Modify design tokens', NOW()),
  (gen_random_uuid()::text, 'projects:manage', 'Manage projects', 'Full project CRUD', NOW()),
  (gen_random_uuid()::text, 'projects:view', 'View projects', 'View project list and details', NOW());

-- Assign all permissions to Admin
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'ADMIN';

-- Assign permissions to Team Lead
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'TEAM_LEAD'
AND p.code IN ('invite:member', 'view:team', 'design:edit', 'projects:manage', 'projects:view');

-- Assign permissions to Designer
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code = 'DESIGNER'
AND p.code IN ('view:team', 'design:edit', 'projects:view');

-- Assign permissions to Member and all others
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code IN ('MEMBER', 'PRODUCT', 'DEVELOPER', 'EXECUTIVE', 'CONTROLS_MANAGER', 'INSTALL_MANAGER', 'PROJECT_MANAGER', 'PROJECT_COORDINATOR')
AND p.code IN ('view:team', 'projects:view');

-- Add INSTALL_MANAGER and PROJECT_MANAGER permissions for manage
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r.id, p.id FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.code IN ('INSTALL_MANAGER', 'PROJECT_MANAGER')
AND p.code = 'projects:manage';

-- Add User.roleId column (nullable)
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;

-- Migrate User.role -> User.roleId (handle enum: ADMIN, MEMBER, TEAM_LEAD, DESIGNER)
UPDATE "User" u
SET "roleId" = r.id
FROM "roles" r
WHERE r.code = u.role::text;

-- For any users with role not in roles table (e.g. old enum), default to MEMBER
UPDATE "User" SET "roleId" = (SELECT id FROM "roles" WHERE code = 'MEMBER' LIMIT 1)
WHERE "roleId" IS NULL;

-- Make roleId NOT NULL, drop role
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "User" DROP COLUMN "role";

-- Add FK and index
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- Add Invite.roleId column (nullable)
ALTER TABLE "Invite" ADD COLUMN "roleId" TEXT;

-- Migrate Invite.role -> Invite.roleId
UPDATE "Invite" i
SET "roleId" = r.id
FROM "roles" r
WHERE r.code = i.role::text;

UPDATE "Invite" SET "roleId" = (SELECT id FROM "roles" WHERE code = 'MEMBER' LIMIT 1)
WHERE "roleId" IS NULL;

ALTER TABLE "Invite" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "Invite" DROP COLUMN "role";

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Invite_roleId_idx" ON "Invite"("roleId");

-- Drop old Role enum
DROP TYPE "Role";
