import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/releases/latest-new
 *
 * Returns the most recently merged Release that has a ReleaseTour attached.
 * Used by ReleaseTourBanner to fetch the tour to play when a new deploy is detected.
 *
 * Returns:
 *   200 { release, tour } — most recent release with tour steps
 *   204                   — no release with a tour exists yet
 *   401                   — unauthenticated
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const release = await db.release.findFirst({
    where: {
      tour: { isNot: null },
    },
    orderBy: { mergedAt: "desc" },
    include: {
      tour: {
        include: { steps: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!release || !release.tour) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ release, tour: release.tour });
}
