/**
 * GET  /api/admin/roles — List roles with permissions (MANAGE_ROLES)
 * POST /api/admin/roles — Create a custom role (MANAGE_ROLES)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  guardResponse,
  requireManageRoles,
  ROLE_CODE_REGEX,
  serializeAdminRole,
} from "@/lib/admin-roles";
import { PERMISSIONS, type Permission, isBuiltinRoleCode } from "@/lib/permissions";
import { ROLE_GRANTABLE_PERMISSIONS } from "@/lib/permission-metadata";
import { ensurePermissionRows } from "@/lib/ensure-permission-rows";
import {
  invalidateRolePermissionCache,
  refreshRolePermissionCache,
} from "@/lib/role-permission-cache";

const ALL_PERMISSION_CODES = Object.values(PERMISSIONS) as [Permission, ...Permission[]];
const GRANTABLE_CODES = ROLE_GRANTABLE_PERMISSIONS.map((m) => m.code) as [
  Permission,
  ...Permission[],
];

const createRoleSchema = z.object({
  code: z.string().regex(ROLE_CODE_REGEX, "Invalid role code format"),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().nullable(),
  permissions: z.array(z.enum(GRANTABLE_CODES)).optional().default([]),
});

const roleInclude = {
  permissions: { select: { permission: { select: { code: true } } } },
  _count: { select: { users: true } },
} as const;

export async function GET() {
  const { status } = await requireManageRoles();
  if (status) return guardResponse(status);

  const roles = await db.role.findMany({
    orderBy: [{ code: "asc" }],
    include: roleInclude,
  });

  return NextResponse.json({ data: roles.map(serializeAdminRole) });
}

export async function POST(req: NextRequest) {
  const { status } = await requireManageRoles();
  if (status) return guardResponse(status);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = createRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { code, name, description, permissions } = parsed.data;

  if (isBuiltinRoleCode(code)) {
    return NextResponse.json({ error: "A built-in role with this code already exists" }, { status: 409 });
  }

  const existing = await db.role.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: "Role code already in use" }, { status: 409 });
  }

  const permissionRows = await ensurePermissionRows(db, permissions);

  if (permissionRows.length !== permissions.length) {
    return NextResponse.json({ error: "One or more permission codes are invalid" }, { status: 400 });
  }

  const role = await db.role.create({
    data: {
      code,
      name,
      description: description ?? null,
      permissions: {
        create: permissionRows.map((p) => ({ permissionId: p.id })),
      },
    },
    include: roleInclude,
  });

  invalidateRolePermissionCache();
  await refreshRolePermissionCache();

  return NextResponse.json({ data: serializeAdminRole(role) }, { status: 201 });
}
