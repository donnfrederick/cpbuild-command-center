import { NextResponse } from "next/server";
import { z } from "zod";
import { type InspectionOutcome } from "@prisma/client";
import { getInspectionTypeIdByCode } from "@/lib/inspections/inspection-type";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { getSession } from "@/lib/dev-session";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

const BulkInspectionSchema = z.object({
  /** Parent scope row IDs to update. Max 500. */
  rowIds: z.array(z.string()).max(500).default([]),
  /** Sub-scope instance IDs to update directly. Max 500. */
  subScopeInstanceIds: z.array(z.string()).max(500).default([]),
  /**
   * Inspection status to apply.
   * - "READY" / "PASSED" / "FAILED": sets scopeStage=INSTALL + scopeStatus=COMPLETE + inspectionStatus
   *   (mirrors the individual "Start Inspection" / "Pass" / "Fail" actions).
   * - null: clears inspectionStatus only — stage and status are left unchanged.
   */
  inspectionStatus: z.enum(["READY", "PASSED", "FAILED"]).nullable(),
  /** When true, DB updates run but activity log is skipped (client sends a follow-up). */
  skipActivityLog: z.boolean().optional(),
  /**
   * Pre-collected row IDs from prior chunks — used only in the multi-chunk activity-log
   * follow-up request where rowIds and subScopeInstanceIds are both empty.
   * These IDs are used exclusively for building the activity log entry.
   */
  appliedRowIds: z.array(z.string()).optional(),
  /** Pre-collected sub-scope instance IDs from prior chunks (activity log only). */
  appliedSubScopeInstanceIds: z.array(z.string()).optional(),
}).refine(
  (d) =>
    d.rowIds.length + d.subScopeInstanceIds.length > 0 ||
    (d.appliedRowIds?.length ?? 0) + (d.appliedSubScopeInstanceIds?.length ?? 0) > 0,
  { message: "At least one rowId, subScopeInstanceId, appliedRowId, or appliedSubScopeInstanceId is required" }
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/units/bulk-inspection", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedSubmitterId = await resolveSessionToDbUserId(session.user);

  const userRole = session.user.role;
  if (!hasPermission(userRole, PERMISSIONS.MANAGE_UNIT_STATUS)) {
    logApi("POST", "/api/projects/[id]/units/bulk-inspection", 403, `Forbidden — role "${userRole}" lacks MANAGE_UNIT_STATUS`, elapsed());
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const parsed = BulkInspectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const {
    rowIds,
    subScopeInstanceIds,
    inspectionStatus,
    skipActivityLog,
    appliedRowIds: preAppliedRowIds,
    appliedSubScopeInstanceIds: preAppliedSubScopeInstanceIds,
  } = parsed.data;

  // Activity-log-only mode: when both ID arrays are empty but pre-collected IDs are
  // provided, skip all DB writes and only write the combined activity log entry.
  // This is used by the multi-chunk client after all chunks have been applied.
  if (rowIds.length === 0 && subScopeInstanceIds.length === 0) {
    const logRows = preAppliedRowIds ?? [];
    const logSubs = preAppliedSubScopeInstanceIds ?? [];
    if (!skipActivityLog && (logRows.length > 0 || logSubs.length > 0)) {
      const actorId = session.user.id ?? null;
      void (async () => {
        try {
          const [userName, rowRefs, instanceRefs] = await Promise.all([
            resolveActorName(actorId),
            logRows.length > 0
              ? db.projectRow.findMany({
                  where: { id: { in: logRows } },
                  select: { building: true, level: true, unit: true },
                }).catch(() => [] as { building: string; level: string; unit: string }[])
              : Promise.resolve([] as { building: string; level: string; unit: string }[]),
            logSubs.length > 0
              ? db.projectSubScopeInstance.findMany({
                  where: { id: { in: logSubs } },
                  select: { row: { select: { building: true, level: true, unit: true } } },
                }).catch(() => [] as { row: { building: string; level: string; unit: string } }[])
              : Promise.resolve([] as { row: { building: string; level: string; unit: string } }[]),
          ]);
          const unitRefMap = new Map<string, { building: string; level: string; unit: string }>();
          for (const r of rowRefs) unitRefMap.set(`${r.building}|${r.level}|${r.unit}`, r);
          for (const i of instanceRefs) {
            const r = i.row;
            unitRefMap.set(`${r.building}|${r.level}|${r.unit}`, r);
          }
          const unitRefs = Array.from(unitRefMap.values()).sort((a, b) => {
            const c = a.building.localeCompare(b.building);
            if (c !== 0) return c;
            const d = a.level.localeCompare(b.level);
            if (d !== 0) return d;
            return a.unit.localeCompare(b.unit);
          });
          void logActivity(projectId, actorId, userName, {
            eventType: "SCOPE_INSPECTION_BULK_UPDATED",
            count: logRows.length + logSubs.length,
            inspectionStatus,
            unitRefs,
          });
        } catch {
          // non-critical — swallow
        }
      })();
    }
    logApi("POST", `/api/projects/${projectId}/units/bulk-inspection`, 200, `Activity-log-only mode: ${(preAppliedRowIds?.length ?? 0) + (preAppliedSubScopeInstanceIds?.length ?? 0)} refs`, elapsed());
    return NextResponse.json({ updated: 0, skipped: 0, errors: 0, appliedRowIds: [], appliedSubScopeInstanceIds: [] });
  }

  const updatedIds: string[] = [];
  const appliedRowIds: string[] = [];
  const appliedSubScopeInstanceIds: string[] = [];
  const errorIds: string[] = [];

  // When inspectionStatus is non-null, every row is promoted to INSTALL + COMPLETE
  // alongside the inspection status — mirrors individual "Start Inspection" behavior.
  // When inspectionStatus is null, only inspectionStatus is cleared; stage/status untouched.
  const isSettingInspection = inspectionStatus !== null;
  const rowData = isSettingInspection
    ? { scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const, inspectionStatus }
    : { inspectionStatus: null };
  const instanceData = rowData;

  // ── Collect all parent row IDs that need updating ─────────────────────────
  // This includes both directly-supplied row IDs AND parent rows of any
  // sub-scope instances. Inspection status is stored and displayed at the row
  // level (via the ClearInspection relation), so every affected row must be
  // touched regardless of whether we got here via row ID or instance ID.
  const allAffectedRowIds = new Set<string>(rowIds);

  // Resolve instance → parent row mapping before updating anything.
  let resolvedInstances: Array<{ id: string; rowId: string }> = [];
  if (subScopeInstanceIds.length > 0) {
    const ownedInstances = await db.projectSubScopeInstance.findMany({
      where: { id: { in: subScopeInstanceIds }, row: { projectId } },
      select: { id: true, rowId: true },
    });
    resolvedInstances = ownedInstances;
    for (const inst of ownedInstances) allAffectedRowIds.add(inst.rowId);
  }

  // ── Pre-check: find rows that already have FORM-source submissions ────────
  // For a backfill action (PASSED/FAILED), those rows are skipped entirely —
  // a real form-based inspection already tracks the outcome with full data.
  // For READY / null (clearing), we always proceed (no FORM-source check needed).
  // Wrapped in try-catch: if the source field query fails (e.g. stale module
  // cache before server restart), we degrade gracefully and skip no rows.
  const rowIdsWithFormSubmissions = new Set<string>();
  if (isSettingInspection && (inspectionStatus === "PASSED" || inspectionStatus === "FAILED") && allAffectedRowIds.size > 0) {
    try {
      const formSubs = await db.inspectionSubmission.findMany({
        where: {
          scopeRowId: { in: Array.from(allAffectedRowIds) },
          source: "FORM",
        },
        select: { scopeRowId: true },
      });
      for (const sub of formSubs) {
        if (sub.scopeRowId) rowIdsWithFormSubmissions.add(sub.scopeRowId);
      }
    } catch (err) {
      logApi(
        "POST",
        `/api/projects/${projectId}/units/bulk-inspection`,
        500,
        `FORM-source pre-check failed (non-fatal — proceeding without guard): ${String(err)}`,
        0
      );
    }
  }

  // ── Update parent scope rows ───────────────────────────────────────────────
  if (allAffectedRowIds.size > 0) {
    const ownedRows = await db.projectRow.findMany({
      where: { id: { in: Array.from(allAffectedRowIds) }, projectId },
      select: { id: true },
    });
    const ownedRowIds = new Set(ownedRows.map((r) => r.id));

    for (const rowId of allAffectedRowIds) {
      if (!ownedRowIds.has(rowId)) continue;
      // Skip rows that already have a real form-based inspection.
      if (rowIdsWithFormSubmissions.has(rowId)) continue;

      try {
        await db.projectRow.update({
          where: { id: rowId },
          data: rowData,
        });
        updatedIds.push(rowId);
        // Track every successfully updated row — including rows synthesised from
        // sub-scope instances — so callers can build complete undo payloads and
        // activity-log entries without needing to re-derive parent IDs.
        appliedRowIds.push(rowId);
      } catch {
        errorIds.push(rowId);
      }
    }
  }

  // ── Update sub-scope instances ─────────────────────────────────────────────
  if (resolvedInstances.length > 0) {
    const ownedInstanceIds = new Set(resolvedInstances.map((i) => i.id));

    for (const instanceId of subScopeInstanceIds) {
      if (!ownedInstanceIds.has(instanceId)) continue;

      try {
        await db.projectSubScopeInstance.update({
          where: { id: instanceId },
          data: instanceData,
        });
        appliedSubScopeInstanceIds.push(instanceId);
      } catch {
        errorIds.push(instanceId);
      }
    }
  }

  // ── Sync ClearInspection + BACKFILL submission records ────────────────────
  // PASSED / FAILED → paired BACKFILL submission + ClearInspection per row
  //   (each clear row links via inspectionSubmissionId — same as form submit).
  // READY / null (Clear) → soft-delete active ClearInspection records and
  //   remove BACKFILL submissions for affected rows.
  if (updatedIds.length > 0) {
    const updatedIdSet = new Set(updatedIds);
    const successfulRowIds = appliedRowIds.filter((id) => updatedIdSet.has(id));

    if (successfulRowIds.length > 0) {
      try {
        if (inspectionStatus === "PASSED" || inspectionStatus === "FAILED") {
          const submitterId = resolvedSubmitterId;
          const outcome: InspectionOutcome =
            inspectionStatus === "PASSED" ? "PASS" : "FAIL";
          const CHUNK_SIZE = 25;
          const defaultTypeId = await getInspectionTypeIdByCode(db);

          for (let i = 0; i < successfulRowIds.length; i += CHUNK_SIZE) {
            const chunk = successfulRowIds.slice(i, i + CHUNK_SIZE);
            const retiredAt = new Date();
            await db.$transaction([
              // Retire prior active clears before deleting BACKFILL submissions —
              // submission delete uses onDelete: SetNull on linked clears.
              db.clearInspection.updateMany({
                where: { rowId: { in: chunk }, deletedAt: null },
                data: { deletedAt: retiredAt },
              }),
              db.inspectionSubmission.deleteMany({
                where: { scopeRowId: { in: chunk }, source: "BACKFILL" },
              }),
              ...chunk.map((rowId) =>
                db.inspectionSubmission.create({
                  data: {
                    source: "BACKFILL",
                    formId: null,
                    formVersionId: null,
                    templateSnapshot: {},
                    payload: {},
                    projectId,
                    unitId: rowId,
                    scopeRowId: rowId,
                    outcome,
                    deficiencyCount: 0,
                    clearInspection: {
                      create: {
                        rowId,
                        status: inspectionStatus,
                        inspectionTypeId: defaultTypeId,
                        inspectedById: submitterId,
                      },
                    },
                  },
                })
              ),
            ]);
          }
        } else {
          await db.$transaction([
            db.clearInspection.updateMany({
              where: { rowId: { in: successfulRowIds }, deletedAt: null },
              data: { deletedAt: new Date() },
            }),
            db.inspectionSubmission.deleteMany({
              where: { scopeRowId: { in: successfulRowIds }, source: "BACKFILL" },
            }),
          ]);
        }
      } catch (err) {
        logApi(
          "POST",
          `/api/projects/${projectId}/units/bulk-inspection`,
          500,
          `ClearInspection/BACKFILL sync failed (non-fatal): ${String(err)}`,
          0
        );
      }
    }
  }

  logApi(
    "POST",
    `/api/projects/${projectId}/units/bulk-inspection`,
    200,
    `Bulk inspection update: ${appliedRowIds.length} rows updated, ${appliedSubScopeInstanceIds.length} instances updated, ${errorIds.length} errors — inspectionStatus: ${inspectionStatus}`,
    elapsed()
  );

  if (updatedIds.length > 0 && !skipActivityLog) {
    const actorId = session.user.id ?? null;
    void (async () => {
      try {
        const [userName, rowRefs, instanceRefs] = await Promise.all([
          resolveActorName(actorId),
          appliedRowIds.length > 0
            ? db.projectRow.findMany({
                where: { id: { in: appliedRowIds } },
                select: { building: true, level: true, unit: true },
              }).catch(() => [] as { building: string; level: string; unit: string }[])
            : Promise.resolve([] as { building: string; level: string; unit: string }[]),
          appliedSubScopeInstanceIds.length > 0
            ? db.projectSubScopeInstance.findMany({
                where: { id: { in: appliedSubScopeInstanceIds } },
                select: { row: { select: { building: true, level: true, unit: true } } },
              }).catch(() => [] as { row: { building: string; level: string; unit: string } }[])
            : Promise.resolve([] as { row: { building: string; level: string; unit: string } }[]),
        ]);
        const unitRefMap = new Map<string, { building: string; level: string; unit: string }>();
        for (const r of rowRefs) unitRefMap.set(`${r.building}|${r.level}|${r.unit}`, r);
        for (const i of instanceRefs) {
          const r = i.row;
          unitRefMap.set(`${r.building}|${r.level}|${r.unit}`, r);
        }
        const unitRefs = Array.from(unitRefMap.values()).sort((a, b) => {
          const c = a.building.localeCompare(b.building);
          if (c !== 0) return c;
          const d = a.level.localeCompare(b.level);
          if (d !== 0) return d;
          return a.unit.localeCompare(b.unit);
        });
        void logActivity(projectId, actorId, userName, {
          eventType: "SCOPE_INSPECTION_BULK_UPDATED",
          count: appliedRowIds.length + appliedSubScopeInstanceIds.length,
          inspectionStatus,
          unitRefs,
        });
      } catch {
        // non-critical post-response activity logging — swallow all errors
      }
    })();
  }

  return NextResponse.json({
    updated: appliedRowIds.length + appliedSubScopeInstanceIds.length,
    skipped: rowIdsWithFormSubmissions.size,
    errors: errorIds.length,
    appliedRowIds,
    appliedSubScopeInstanceIds,
  });
}
