import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import type { ApiError } from "@/types";

type Params = { params: Promise<{ id: string; permissionId: string }> };

/** DELETE /api/users/[id]/special-permissions/[permissionId] — revoke a specific grant */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }
  const callerSpecialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES, callerSpecialPerms)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId, permissionId } = await params;

  const grant = await db.userSpecialPermission.findFirst({
    where: { id: permissionId, userId },
    select: { id: true, permission: true },
  });

  if (!grant) {
    return NextResponse.json<ApiError>({ error: "Permission grant not found" }, { status: 404 });
  }

  await db.userSpecialPermission.delete({ where: { id: permissionId } });

  return new NextResponse(null, { status: 204 });
}
