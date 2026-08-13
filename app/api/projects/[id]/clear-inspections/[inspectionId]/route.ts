import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";
import { logActivity, resolveActorName } from "@/lib/activity-logger";

/**
 * DELETE /api/projects/[id]/clear-inspections/[inspectionId]
 *
 * Soft-deletes a clear inspection record by setting deletedAt = now().
 * Only users with MANAGE_UNIT_STATUS may delete. The record must belong to this project.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; inspectionId: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("DELETE", "/api/projects/[id]/clear-inspections/[inspectionId]", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!hasPermission(userRole, PERMISSIONS.MANAGE_UNIT_STATUS)) {
    logApi("DELETE", "/api/projects/[id]/clear-inspections/[inspectionId]", 403, `Forbidden — role "${userRole}" lacks MANAGE_UNIT_STATUS`, elapsed());
    return NextResponse.json({ error: "Forbidden — requires MANAGE_UNIT_STATUS" }, { status: 403 });
  }

  const { id: projectId, inspectionId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  // Verify the record exists and belongs to this project via its row
  const inspection = await db.clearInspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
      rowId: true,
      row: {
        select: {
          projectId: true,
          building: true,
          level: true,
          unit: true,
          scopeType: { select: { name: true } },
        },
      },
    },
  });

  if (!inspection || inspection.row.projectId !== projectId) {
    logApi("DELETE", "/api/projects/[id]/clear-inspections/[inspectionId]", 404, `Inspection ${inspectionId} not found in project ${projectId}`, elapsed());
    return NextResponse.json({ error: "Clear inspection not found" }, { status: 404 });
  }

  if (inspection.deletedAt) {
    return NextResponse.json({ error: "Already deleted" }, { status: 409 });
  }

  await db.clearInspection.update({
    where: { id: inspectionId },
    data: { deletedAt: new Date() },
  });

  logApi("DELETE", "/api/projects/[id]/clear-inspections/[inspectionId]", 200, `Soft-deleted clear inspection ${inspectionId}`, elapsed());

  void (async () => {
    const actorId = session.user.id ?? null;
    const userName = await resolveActorName(actorId);
    void logActivity(projectId, actorId, userName, {
      eventType: "CLEAR_INSPECTION_DELETED",
      inspectionId,
      rowId: inspection.rowId,
      unit: inspection.row.unit,
      building: inspection.row.building,
      level: inspection.row.level,
      scopeName: inspection.row.scopeType?.name ?? "",
      status: inspection.status,
    });
  })();

  return NextResponse.json({ ok: true });
}
