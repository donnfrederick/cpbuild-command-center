/**
 * GET /api/roles — List all roles (for invite form, admin UI).
 * Requires INVITE_MEMBER or MANAGE_ROLES permission.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import type { ApiError } from "@/types";

async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) return { user: { id: "dev-user", role: "ADMIN" } };
  return auth();
}

export async function GET() {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  const specialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (
    !hasPermission(session.user.role, PERMISSIONS.INVITE_MEMBER, specialPerms) &&
    !hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES, specialPerms) &&
    !hasPermission(session.user.role, PERMISSIONS.PREVIEW_ROLE, specialPerms)
  ) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const roles = await db.role.findMany({
    select: { id: true, code: true, name: true, description: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ data: roles });
}
