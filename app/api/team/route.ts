import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import type { ApiError } from "@/types";

// GET /api/team — List all team members (authenticated users)
export async function GET() {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.VIEW_TEAM)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { code: true, name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const members = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.code,
    createdAt: u.createdAt.toISOString(),
  }));

  return NextResponse.json({ data: members });
}
