/**
 * Shared helpers for admin role management API routes.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { hasPermission, isBuiltinRoleCode, PERMISSIONS } from "@/lib/permissions";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";

import { ROLE_CODE_REGEX } from "@/lib/role-code";

export { ROLE_CODE_REGEX };

type ManageRolesGuardResult =
  | { session: null; status: 401 }
  | { session: NonNullable<Awaited<ReturnType<typeof getSession>>>; status: 403; specialPerms: string[] }
  | { session: NonNullable<Awaited<ReturnType<typeof getSession>>>; status: null; specialPerms: string[] };

export async function requireManageRoles(): Promise<ManageRolesGuardResult> {
  const session = await getSession();
  if (!session?.user) return { session: null, status: 401 };

  const specialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES, specialPerms)) {
    return { session, status: 403, specialPerms };
  }

  return { session, status: null, specialPerms };
}

export function guardResponse(status: 401 | 403): NextResponse {
  return NextResponse.json(
    { error: status === 403 ? "Forbidden" : "Unauthorized" },
    { status },
  );
}

export type RoleWithPermissions = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissions: { permission: { code: string } }[];
  _count: { users: number };
};

export function serializeAdminRole(role: RoleWithPermissions) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    permissions: role.permissions.map((rp) => rp.permission.code),
    isBuiltin: isBuiltinRoleCode(role.code),
    userCount: role._count.users,
  };
}
