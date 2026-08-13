import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";

const QuerySchema = z.object({
  building: z.string().min(1),
  level: z.string().min(1),
  unit: z.string().min(1),
});

/**
 * GET /api/projects/[id]/field-notes/scope-rows?building=&level=&unit=
 *
 * Scope row options (id + display name) for a unit — used by field-notes edit pickers.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const parsed = QuerySchema.safeParse({
    building: req.nextUrl.searchParams.get("building") ?? "",
    level: req.nextUrl.searchParams.get("level") ?? "",
    unit: req.nextUrl.searchParams.get("unit") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const { building, level, unit } = parsed.data;

  const rows = await db.projectRow.findMany({
    where: { projectId, building, level, unit },
    orderBy: { rowIndex: "asc" },
    select: {
      id: true,
      description: true,
      scopeType: { select: { name: true } },
    },
  });

  return NextResponse.json({
    scopes: rows.map((row) => ({
      id: row.id,
      name: row.scopeType?.name?.trim() || row.description?.trim() || row.id,
    })),
  });
}
