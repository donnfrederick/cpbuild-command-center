import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdminWithSession } from "@/lib/devtools-auth";

/**
 * DELETE /api/devtools/releases/[id]/tour
 *
 * Removes the ReleaseTour (and its steps, via cascade) from a release without
 * deleting the Release record itself. The release disappears from the tour picker
 * but remains in release history.
 *
 * Requires DevTools admin access.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isDevToolsAllowed()) {
    return NextResponse.json({ error: DEVTOOLS_BLOCKED_MESSAGE }, { status: 403 });
  }

  const { guard } = await requireDevToolsAdminWithSession();
  if (guard) return guard;

  const { id } = await params;

  const release = await db.release.findUnique({
    where: { id },
    select: { id: true, title: true, tour: { select: { id: true } } },
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  if (!release.tour) {
    return NextResponse.json({ error: "Release has no tour" }, { status: 404 });
  }

  await db.releaseTour.delete({ where: { releaseId: id } });

  return NextResponse.json({ deleted: true, releaseId: id, title: release.title });
}
