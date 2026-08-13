import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { loadLocationBuilderTagOptions } from "@/lib/field-notes/location-builder-tags";

/**
 * GET /api/projects/[id]/field-notes/location-builder-tags
 *
 * Distinct build phases and areas from project_rows for project-level field note tagging.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  try {
    const options = await loadLocationBuilderTagOptions(db, projectId);
    return NextResponse.json(options);
  } catch (err) {
    console.error("[field-notes/location-builder-tags GET] Prisma error:", err);
    return NextResponse.json({ error: "Failed to load location builder tags" }, { status: 500 });
  }
}
