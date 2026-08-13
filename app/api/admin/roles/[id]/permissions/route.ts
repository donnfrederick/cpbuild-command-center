/**
 * PUT /api/admin/roles/[id]/permissions — Replace a role's default permissions (MANAGE_ROLES)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  guardResponse,
  requireManageRoles,
  serializeAdminRole,
} from "@/lib/admin-roles";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { ROLE_GRANTABLE_PERMISSIONS } from "@/lib/permission-metadata";
import { ensurePermissionRows } from "@/lib/ensure-permission-rows";
import {
  invalidateRolePermissionCache,
  refreshRolePermissionCache,
} from "@/lib/role-permission-cache";

const GRANTABLE_CODES = new Set<string>(
  ROLE_GRANTABLE_PERMISSIONS.map((m) => m.code),
);

const ALL_PERMISSION_CODES = Object.values(PERMISSIONS) as [Permission, ...Permission[]];

const putPermissionsSchema = z.object({
  permissions: z.array(z.enum(ALL_PERMISSION_CODES)),
});

const roleInclude = {
  permissions: { select: { permission: { select: { code: true } } } },
  _count: { select: { users: true } },
} as const;

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, context: RouteContext) {
  const { status } = await requireManageRoles();
  if (status) return guardResponse(status);

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = putPermissionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const existing = await db.role.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      permissions: { select: { permission: { select: { code: true } } } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const requested = [...new Set(parsed.data.permissions)];

  // Role Manager only edits grantable codes; silently drop any non-grantable codes
  // in the payload (e.g. masquerade:user still on ADMIN from bootstrap).
  const grantableRequested = requested.filter((code) => GRANTABLE_CODES.has(code));

  // Preserve permissions that must never be toggled via Role Manager (masquerade:user).
  const preservedNonGrantable = existing.permissions
    .map((rp) => rp.permission.code)
    .filter((code) => !GRANTABLE_CODES.has(code));

  const finalCodes = [...new Set([...grantableRequested, ...preservedNonGrantable])] as Permission[];

  const permissionRows = await ensurePermissionRows(db, finalCodes);

  if (permissionRows.length !== finalCodes.length) {
    return NextResponse.json({ error: "One or more permission codes are invalid" }, { status: 400 });
  }

  const permissionIds = permissionRows.map((p) => p.id);

  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId: id } }),
    ...(permissionIds.length > 0
      ? [
          db.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          }),
        ]
      : []),
  ]);

  const role = await db.role.findUniqueOrThrow({
    where: { id },
    include: roleInclude,
  });

  invalidateRolePermissionCache();
  await refreshRolePermissionCache();

  return NextResponse.json({ data: serializeAdminRole(role) });
}
