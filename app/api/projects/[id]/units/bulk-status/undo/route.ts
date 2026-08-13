import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { getSession } from "@/lib/dev-session";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import { getInspectionTypeIdByCode } from "@/lib/inspections/inspection-type";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

const SnapshotSchema = z.object({
  scopeStage: z.enum(["STAGING", "ASSEMBLY", "INSTALL"]).nullable(),
  scopeStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "PENDING_VERIFICATION", "COMPLETE"]),
  inspectionStatus: z.enum(["READY", "PASSED", "FAILED"]).nullable(),
});

const RevertRowSchema = z.object({
  id: z.string(),
}).merge(SnapshotSchema);

const RevertInstanceSchema = z.object({
  id: z.string(),
}).merge(SnapshotSchema);

const UndoBodySchema = z
  .object({
    revertRows: z.array(RevertRowSchema).max(500).default([]),
    revertInstances: z.array(RevertInstanceSchema).max(500).default([]),
  })
  .refine((d) => d.revertRows.length + d.revertInstances.length > 0, {
    message: "At least one revertRows or revertInstances entry is required",
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/units/bulk-status/undo", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!hasPermission(userRole, PERMISSIONS.MANAGE_UNIT_STATUS)) {
    logApi(
      "POST",
      "/api/projects/[id]/units/bulk-status/undo",
      403,
      `Forbidden — role "${userRole}" lacks MANAGE_UNIT_STATUS`,
      elapsed()
    );
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedInspectedById = await resolveSessionToDbUserId(session.user);

  const { id: projectId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UndoBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { revertRows, revertInstances } = parsed.data;
  let restoredRows = 0;
  let restoredInstances = 0;
  const errors: string[] = [];

  const restoredRowIds: string[] = [];
  const restoredInstanceIds: string[] = [];

  if (revertRows.length > 0) {
    const owned = await db.projectRow.findMany({
      where: { id: { in: revertRows.map((r) => r.id) }, projectId },
      select: { id: true },
    });
    const valid = new Set(owned.map((r) => r.id));
    for (const row of revertRows) {
      if (!valid.has(row.id)) continue;
      try {
        await db.projectRow.update({
          where: { id: row.id },
          data: {
            scopeStage: row.scopeStage,
            scopeStatus: row.scopeStatus,
            inspectionStatus: row.inspectionStatus,
          },
        });
        restoredRows += 1;
        restoredRowIds.push(row.id);
      } catch {
        errors.push(row.id);
      }
    }
  }

  if (revertInstances.length > 0) {
    const owned = await db.projectSubScopeInstance.findMany({
      where: { id: { in: revertInstances.map((r) => r.id) }, row: { projectId } },
      select: { id: true },
    });
    const valid = new Set(owned.map((i) => i.id));
    for (const inst of revertInstances) {
      if (!valid.has(inst.id)) continue;
      try {
        await db.projectSubScopeInstance.update({
          where: { id: inst.id },
          data: {
            scopeStage: inst.scopeStage,
            scopeStatus: inst.scopeStatus,
            inspectionStatus: inst.inspectionStatus,
          },
        });
        restoredInstances += 1;
        restoredInstanceIds.push(inst.id);
      } catch {
        errors.push(inst.id);
      }
    }
  }

  // ── Sync ClearInspection records ──────────────────────────────────────────
  // The snapshot captures the effective inspectionStatus (clearInspection?.status ??
  // inspectionStatus). We must restore ClearInspection records to match so the
  // display, which reads clearInspection first, shows the correct prior state.
  //
  // Group the reverted rows by the inspection status they're being restored to:
  // - PASSED / FAILED → create a new ClearInspection record with that status
  //   (history-preserving, same as the bulk inspection action itself)
  // - READY / null → soft-delete any active ClearInspection records so the
  //   fallback inspectionStatus field drives the display
  if (restoredRowIds.length > 0) {
    const revertByRow = new Map(
      revertRows.filter((r) => restoredRowIds.includes(r.id)).map((r) => [r.id, r.inspectionStatus])
    );

    const rowsNeedingClearInspection: string[] = [];

    for (const [rowId, status] of revertByRow) {
      if (status === "PASSED" || status === "FAILED") {
        rowsNeedingClearInspection.push(rowId);
      }
    }

    // Soft-delete active ClearInspection records for all restored rows first,
    // then re-create the ones that need a specific status. This ensures no
    // stale records from the bulk action interfere with the reverted state.
    if (restoredRowIds.length > 0) {
      await db.clearInspection.updateMany({
        where: { rowId: { in: restoredRowIds }, deletedAt: null },
        data: { deletedAt: new Date() },
      }).catch(() => { /* non-critical */ });
    }

    if (rowsNeedingClearInspection.length > 0) {
      const defaultTypeId = await getInspectionTypeIdByCode(db);
      const inspectionData = rowsNeedingClearInspection.map((rowId) => ({
        rowId,
        status: revertByRow.get(rowId) as "PASSED" | "FAILED",
        inspectionTypeId: defaultTypeId,
        inspectedById: resolvedInspectedById,
      }));
      await db.clearInspection.createMany({ data: inspectionData }).catch(() => { /* non-critical */ });
    }
  }

  logApi(
    "POST",
    `/api/projects/${projectId}/units/bulk-status/undo`,
    200,
    `Bulk undo: ${restoredRows} rows, ${restoredInstances} instances, ${errors.length} errors`,
    elapsed()
  );

  if (restoredRows + restoredInstances > 0) {
    void (async () => {
      const actorId = session.user.id ?? null;
      const userName = await resolveActorName(actorId);
      let rowRefs: { building: string; level: string; unit: string }[] = [];
      let instanceRefs: { row: { building: string; level: string; unit: string } }[] = [];
      try {
        if (restoredRowIds.length > 0) {
          const rowsResult = await db.projectRow.findMany({
            where: { id: { in: restoredRowIds } },
            select: { building: true, level: true, unit: true },
          });
          rowRefs = Array.isArray(rowsResult) ? rowsResult : [];
        }
        if (restoredInstanceIds.length > 0) {
          const instancesResult = await db.projectSubScopeInstance.findMany({
            where: { id: { in: restoredInstanceIds } },
            select: { row: { select: { building: true, level: true, unit: true } } },
          });
          instanceRefs = Array.isArray(instancesResult) ? instancesResult : [];
        }
      } catch {
        rowRefs = [];
        instanceRefs = [];
      }
      const unitRefMap = new Map<string, { building: string; level: string; unit: string }>();
      for (const r of rowRefs) unitRefMap.set(`${r.building}|${r.level}|${r.unit}`, r);
      for (const i of instanceRefs) unitRefMap.set(`${i.row.building}|${i.row.level}|${i.row.unit}`, i.row);
      void logActivity(projectId, actorId, userName, {
        eventType: "SCOPE_STATUS_BULK_UNDONE",
        count: restoredRows + restoredInstances,
        unitRefs: Array.from(unitRefMap.values()),
      });
    })();
  }

  return NextResponse.json({
    restoredRows,
    restoredInstances,
    errors: errors.length,
  });
}
