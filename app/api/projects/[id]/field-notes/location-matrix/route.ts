import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { buildFieldNotesLocationMatrix } from "@/lib/field-notes-location-ref";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";

/**
 * GET /api/projects/[id]/field-notes/location-matrix
 *
 * Distinct building / level / unit hierarchy from project_rows for field-notes location pickers.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const rows = await db.projectRow.findMany({
    where: { projectId },
    select: { building: true, level: true, unit: true },
  });

  return NextResponse.json(buildFieldNotesLocationMatrix(rows));
}
