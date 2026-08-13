import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { getSession } from "@/lib/dev-session";
import { hasSubScopeInstances } from "@/lib/sub-scopes";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";
import {
  isTransitionToInstallComplete,
  projectRowHasOpenBlockingIssue,
  subScopeInstanceHasOpenBlockingIssue,
} from "@/lib/install-complete-blocking";

const BulkStatusSchema = z.object({
  /** Parent scope row IDs to update (rows with no sub-scope instances). Max 500. */
  rowIds: z.array(z.string()).max(500).default([]),
  /** Sub-scope instance IDs to update directly. Max 500. */
  subScopeInstanceIds: z.array(z.string()).max(500).default([]),
  /**
   * Stage to set. When omitted, the row's current stage is preserved.
   * Pass null explicitly to clear the stage (i.e. reset to Not Started).
   */
  scopeStage: z.enum(["STAGING", "ASSEMBLY", "INSTALL"]).nullable().optional(),
  scopeStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "PENDING_VERIFICATION", "COMPLETE"]),
  /** When true, DB updates run but activity log is skipped (client sends a follow-up to `/bulk-status/activity`). */
  skipActivityLog: z.boolean().optional(),
}).refine(
  (d) => d.rowIds.length + d.subScopeInstanceIds.length > 0,
  { message: "At least one rowId or subScopeInstanceId is required" }
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/units/bulk-status", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!hasPermission(userRole, PERMISSIONS.MANAGE_UNIT_STATUS)) {
    logApi("POST", "/api/projects/[id]/units/bulk-status", 403, `Forbidden — role "${userRole}" lacks MANAGE_UNIT_STATUS`, elapsed());
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

  const parsed = BulkStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { rowIds, subScopeInstanceIds, scopeStage, scopeStatus, skipActivityLog } = parsed.data;

  const skippedSubScope: string[] = [];
  const blockedByBlockingIssue: string[] = [];
  const updatedIds: string[] = [];
  const appliedRowIds: string[] = [];
  const appliedSubScopeInstanceIds: string[] = [];
  const errorIds: string[] = [];

  // ── Update parent scope rows (rows without sub-scope instances) ───────────
  if (rowIds.length > 0) {
    const ownedRows = await db.projectRow.findMany({
      where: { id: { in: rowIds }, projectId },
      select: { id: true, scopeStage: true, scopeStatus: true, unifierSubId: true },
    });
    const rowById = new Map(ownedRows.map((r) => [r.id, r]));

    for (const rowId of rowIds) {
      const row = rowById.get(rowId);
      if (!row) continue;

      const blocked = await hasSubScopeInstances(db, rowId);
      if (blocked) {
        skippedSubScope.push(rowId);
        continue;
      }

      const nextStage = scopeStage !== undefined ? scopeStage : row.scopeStage;
      const nextStatus = scopeStatus;
      if (
        isTransitionToInstallComplete(
          row.scopeStage,
          row.scopeStatus,
          nextStage,
          nextStatus
        ) &&
        (await projectRowHasOpenBlockingIssue(projectId, rowId))
      ) {
        blockedByBlockingIssue.push(rowId);
        continue;
      }

      try {
        const isInstallComplete =
          (scopeStage === "INSTALL" || scopeStage === undefined) &&
          scopeStatus === "COMPLETE";

        await db.projectRow.update({
          where: { id: rowId },
          data: {
            ...(scopeStage !== undefined ? { scopeStage } : {}),
            scopeStatus,
            ...(!isInstallComplete ? { inspectionStatus: null } : {}),
          },
        });
        updatedIds.push(rowId);
        appliedRowIds.push(rowId);
      } catch {
        errorIds.push(rowId);
      }
    }
  }

  // ── Update sub-scope instances directly ───────────────────────────────────
  if (subScopeInstanceIds.length > 0) {
    const ownedInstances = await db.projectSubScopeInstance.findMany({
      where: { id: { in: subScopeInstanceIds }, row: { projectId } },
      select: {
        id: true,
        scopeStage: true,
        scopeStatus: true,
        row: { select: { unifierSubId: true } },
      },
    });
    const instanceById = new Map(ownedInstances.map((i) => [i.id, i]));

    for (const instanceId of subScopeInstanceIds) {
      const inst = instanceById.get(instanceId);
      if (!inst) continue;

      const nextStage = scopeStage !== undefined ? scopeStage : inst.scopeStage;
      const nextStatus = scopeStatus;
      if (
        isTransitionToInstallComplete(
          inst.scopeStage,
          inst.scopeStatus,
          nextStage,
          nextStatus
        ) &&
        (await subScopeInstanceHasOpenBlockingIssue(projectId, instanceId))
      ) {
        blockedByBlockingIssue.push(instanceId);
        continue;
      }

      try {
        const isInstallComplete =
          (scopeStage === "INSTALL" || scopeStage === undefined) &&
          scopeStatus === "COMPLETE";

        await db.projectSubScopeInstance.update({
          where: { id: instanceId },
          data: {
            ...(scopeStage !== undefined ? { scopeStage } : {}),
            scopeStatus,
            ...(!isInstallComplete ? { inspectionStatus: null } : {}),
          },
        });
        updatedIds.push(instanceId);
        appliedSubScopeInstanceIds.push(instanceId);
      } catch {
        errorIds.push(instanceId);
      }
    }
  }

  logApi(
    "POST",
    `/api/projects/${projectId}/units/bulk-status`,
    200,
    `Bulk update: ${updatedIds.length} updated (${rowIds.length} rows, ${subScopeInstanceIds.length} instances), ${skippedSubScope.length} skipped (sub-scope blocked), ${blockedByBlockingIssue.length} blocked (open blocking issue), ${errorIds.length} errors`,
    elapsed()
  );

  if (updatedIds.length > 0 && !skipActivityLog) {
    void (async () => {
      try {
        const [rowRefs, instanceRefs] = await Promise.all([
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
        const requestBody =
          typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
        voidLogFieldActivity(
          projectId,
          session,
          {
            eventType: "SCOPE_STATUS_BULK_UPDATED",
            count: updatedIds.length,
            scopeStage: scopeStage ?? null,
            scopeStatus,
            unitRefs,
          },
          { requestBody },
        );
      } catch {
        // non-critical post-response activity logging — swallow all errors
      }
    })();
  }

  return NextResponse.json({
    updated: updatedIds.length,
    skipped: skippedSubScope.length,
    skippedIds: skippedSubScope,
    blockedByBlockingIssue,
    errors: errorIds.length,
    appliedRowIds,
    appliedSubScopeInstanceIds,
  });
}
