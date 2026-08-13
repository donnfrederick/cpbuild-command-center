import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * GET /api/releases/tour-history
 *
 * Returns a paginated list of releases that have a ReleaseTour attached,
 * ordered by mergedAt descending. Used by the TourHistory panel.
 *
 * Query params:
 *   limit  — number of records to return (default 10, max 50)
 *   cursor — releaseId to paginate from (exclusive, i.e. items after this ID)
 *
 * Returns:
 *   200 { items: ReleaseWithTour[], nextCursor: string | null, total: number }
 *   401 — unauthenticated
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : rawLimit, MAX_LIMIT);
  const cursor = searchParams.get("cursor") ?? undefined;

  const [total, items] = await Promise.all([
    db.release.count({ where: { tour: { isNot: null } } }),
    db.release.findMany({
      where: { tour: { isNot: null } },
      orderBy: { mergedAt: "desc" },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        title: true,
        prNumber: true,
        branch: true,
        environment: true,
        mergedAt: true,
        changes: true,
        tour: {
          select: {
            id: true,
            steps: { select: { order: true, pageUrl: true, title: true }, orderBy: { order: "asc" } },
          },
        },
      },
    }),
  ]);

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return NextResponse.json({ items: page, nextCursor, total });
}
