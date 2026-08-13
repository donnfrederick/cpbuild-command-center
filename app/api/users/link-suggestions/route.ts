/**
 * GET /api/users/link-suggestions
 *
 * Returns auto-match suggestions for linking Field Tracker users to Unifier users.
 * Matches by email (case-insensitive exact match). Only returns suggestions for
 * CC users that are not yet linked.
 *
 * Auth: ADMIN only.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { suggestUserLinks } from "@/lib/unifier/users";
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

  const ccUsers = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      unifierUserId: true,
    },
    orderBy: { email: "asc" },
  });

  try {
    const suggestions = await suggestUserLinks(ccUsers);
    return NextResponse.json({ data: suggestions, total: suggestions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json<ApiError>({ error: message }, { status: 502 });
  }
}
