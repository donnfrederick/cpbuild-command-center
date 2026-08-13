/**
 * PATCH  /api/admin/roles/[id] — Update role name/description (MANAGE_ROLES)
 * DELETE /api/admin/roles/[id] — Delete custom role with no users (MANAGE_ROLES)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  guardResponse,
  requireManageRoles,
  serializeAdminRole,
} from "@/lib/admin-roles";
import { isBuiltinRoleCode } from "@/lib/permissions";
import {
  invalidateRolePermissionCache,
  refreshRolePermissionCache,
} from "@/lib/role-permission-cache";

const updateRoleSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional().nullable(),
});

const roleInclude = {
  permissions: { select: { permission: { select: { code: true } } } },
  _count: { select: { users: true } },
} as const;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { status } = await requireManageRoles();
  if (status) return guardResponse(status);

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const existing = await db.role.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const role = await db.role.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    },
    include: roleInclude,
  });

  return NextResponse.json({ data: serializeAdminRole(role) });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { status } = await requireManageRoles();
  if (status) return guardResponse(status);

  const { id } = await context.params;

  const existing = await db.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });

  if (!existing) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (isBuiltinRoleCode(existing.code)) {
    return NextResponse.json({ error: "Built-in roles cannot be deleted" }, { status: 403 });
  }

  if (existing._count.users > 0) {
    return NextResponse.json(
      { error: "Cannot delete a role that is assigned to users" },
      { status: 409 },
    );
  }

  await db.role.delete({ where: { id } });

  invalidateRolePermissionCache();
  await refreshRolePermissionCache();

  return new NextResponse(null, { status: 204 });
}
