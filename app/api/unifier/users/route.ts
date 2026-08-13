/**
 * GET /api/unifier/users
 *
 * Returns all users from Unifier's UNIFIER_SYS_USER_INFO table.
 * Used for the user-linking workflow — admins can see Unifier users
 * and match them to Field Tracker accounts.
 *
 * Auth: ADMIN only.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getUnifierUsers } from "@/lib/unifier/users";
import type { ApiError } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await getUnifierUsers();
    return NextResponse.json({ data: users, total: users.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json<ApiError>({ error: message }, { status: 502 });
  }
}
