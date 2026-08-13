import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { collectAlbumCoverage } from "@/lib/media/album-coverage";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";

/** GET /api/projects/[id]/album/coverage — unit refs that have album-visible media. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  try {
    const coverage = await collectAlbumCoverage(db, projectId);
    return NextResponse.json(coverage);
  } catch (err) {
    console.error("[album/coverage GET] error:", err);
    return NextResponse.json({ error: "Failed to fetch album coverage" }, { status: 500 });
  }
}
