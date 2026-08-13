import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";
import { getInspectionTypeIdByCode } from "@/lib/inspections/inspection-type";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

const CreateClearInspectionSchema = z.object({
  rowId: z.string().min(1),
  status: z.enum(["PASSED", "FAILED"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/clear-inspections", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!hasPermission(userRole, PERMISSIONS.MANAGE_UNIT_STATUS)) {
    logApi("POST", "/api/projects/[id]/clear-inspections", 403, `Forbidden — role "${userRole}" lacks MANAGE_UNIT_STATUS`, elapsed());
    return NextResponse.json({ error: "Forbidden — requires MANAGE_UNIT_STATUS" }, { status: 403 });
  }

  const { id: projectId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateClearInspectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { rowId, status } = parsed.data;

  // Verify the row belongs to this project — fetch display fields for activity log
  const row = await db.projectRow.findUnique({
    where: { id: rowId },
    select: {
      projectId: true,
      building: true,
      level: true,
      unit: true,
      scopeType: { select: { name: true } },
    },
  });

  if (!row || row.projectId !== projectId) {
    logApi("POST", "/api/projects/[id]/clear-inspections", 404, `Row ${rowId} not found in project ${projectId}`, elapsed());
    return NextResponse.json({ error: "Scope row not found" }, { status: 404 });
  }

  const defaultTypeId = await getInspectionTypeIdByCode(db);
  const inspectedById = await resolveSessionToDbUserId(session.user);
  // Each status change creates a new record — history is preserved for the activity feed
  const inspection = await db.clearInspection.create({
    data: {
      rowId,
      status,
      inspectionTypeId: defaultTypeId,
      inspectedById,
    },
    select: {
      id: true,
      rowId: true,
      status: true,
      inspectionTypeId: true,
      inspectedById: true,
      inspectionType: { select: { code: true } },
      createdAt: true,
    },
  });

  logApi("POST", "/api/projects/[id]/clear-inspections", 201, `Created clear inspection ${inspection.id} (${status}) for row ${rowId}`, elapsed());

  void (async () => {
    const actorId = session.user.id ?? null;
    const userName = await resolveActorName(actorId);
    void logActivity(projectId, actorId, userName, {
      eventType: "CLEAR_INSPECTION_SET",
      rowId,
      unit: row.unit,
      building: row.building,
      level: row.level,
      scopeName: row.scopeType?.name ?? "",
      status,
    });
  })();

  return NextResponse.json(inspection, { status: 201 });
}
