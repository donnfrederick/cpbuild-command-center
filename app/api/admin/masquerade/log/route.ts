import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

/**
 * GET /api/admin/masquerade/log
 * Returns paginated masquerade audit log. ADMIN only.
 *
 * Query params:
 *   page  — 1-based page number (default: 1)
 *   limit — items per page (default: 20, max: 100)
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.MASQUERADE_USER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));
  const skip = (page - 1) * limit;

  try {
    const [total, entries] = await db.$transaction([
      db.masqueradeLog.count(),
      db.masqueradeLog.findMany({
        skip,
        take: limit,
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          actor: { select: { id: true, name: true, email: true } },
          target: { select: { id: true, name: true, email: true, role: { select: { code: true, name: true } } } },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      entries,
    });
  } catch (err) {
    console.error("[GET /api/admin/masquerade/log]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
