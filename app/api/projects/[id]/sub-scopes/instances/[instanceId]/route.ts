import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/lib/dev-session";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";
import {
  BLOCKING_ISSUE_OPEN_CODE,
} from "@/lib/blocking-issue-code";
import {
  isTransitionToInstallComplete,
  subScopeInstanceHasOpenBlockingIssue,
} from "@/lib/install-complete-blocking";
import { logActivity, resolveActorName } from "@/lib/activity-logger";

// ─── Validation ───────────────────────────────────────────────────────────────

const UpdateInstanceSchema = z.object({
  scopeStage: z
    .enum(["STAGING", "ASSEMBLY", "INSTALL"])
    .nullable()
    .optional(),
  scopeStatus: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "PENDING_VERIFICATION", "COMPLETE"])
    .nullable()
    .optional(),
  inspectionStatus: z.enum(["READY", "PASSED", "FAILED"]).nullable().optional(),
  /** Override the quantity for this specific unit's sub-scope slice. */
  qty: z.number().positive().nullable().optional(),
});

// ─── PATCH /api/projects/[id]/sub-scopes/instances/[instanceId] ──────────────
//
// Updates stage/status/inspectionStatus on a single sub-scope tracking instance.
// Same auth gate as updating a row's stage/status (MANAGE_UNIT_STATUS).
// Same inspection-status gate: only settable when scopeStage=INSTALL + scopeStatus=COMPLETE.

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_UNIT_STATUS)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId, instanceId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Verify the instance exists and belongs to this project (via sub-scope → project chain)
  const instance = await db.projectSubScopeInstance.findUnique({
    where: { id: instanceId },
    include: {
      subScope: { select: { projectId: true, name: true } },
      row: { select: { id: true, building: true, level: true, unit: true, unifierSubId: true } },
    },
  });

  if (!instance || instance.subScope.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Inspection-status gate: only valid at INSTALL+COMPLETE
  if (data.inspectionStatus !== undefined && data.inspectionStatus !== null) {
    const effectiveStage =
      data.scopeStage !== undefined ? data.scopeStage : instance.scopeStage;
    const effectiveStatus =
      data.scopeStatus !== undefined ? data.scopeStatus : instance.scopeStatus;
    if (effectiveStage !== "INSTALL" || effectiveStatus !== "COMPLETE") {
      return NextResponse.json(
        {
          error:
            "inspectionStatus can only be set when scopeStage=INSTALL and scopeStatus=COMPLETE",
        },
        { status: 422 }
      );
    }
  }

  const nextStage =
    data.scopeStage !== undefined ? data.scopeStage : instance.scopeStage;
  const nextStatus =
    data.scopeStatus !== undefined ? data.scopeStatus : instance.scopeStatus;
  if (
    isTransitionToInstallComplete(
      instance.scopeStage,
      instance.scopeStatus,
      nextStage,
      nextStatus
    ) &&
    (await subScopeInstanceHasOpenBlockingIssue(projectId, instanceId))
  ) {
    return NextResponse.json(
      {
        error:
          "Cannot mark install complete while a blocking issue is open on this scope.",
        code: BLOCKING_ISSUE_OPEN_CODE,
      },
      { status: 422 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (data.scopeStage !== undefined) updateData.scopeStage = data.scopeStage;
  if (data.scopeStatus !== undefined) updateData.scopeStatus = data.scopeStatus;
  if (data.inspectionStatus !== undefined)
    updateData.inspectionStatus = data.inspectionStatus;
  if (data.qty !== undefined) updateData.qty = data.qty;

  if (
    data.inspectionStatus === undefined &&
    (data.scopeStage !== undefined || data.scopeStatus !== undefined) &&
    (nextStage !== "INSTALL" || nextStatus !== "COMPLETE")
  ) {
    updateData.inspectionStatus = null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  try {
    const updated = await db.projectSubScopeInstance.update({
      where: { id: instanceId },
      data: updateData,
      include: {
        subScope: {
          select: {
            id: true,
            name: true,
            displayOrder: true,
            unitType: true,
            scopeTypeId: true,
          },
        },
      },
    });

    void (async () => {
      const actorId = session.user.id ?? null;
      const userName = await resolveActorName(actorId);
      void logActivity(projectId, actorId, userName, {
        eventType: "SUB_SCOPE_INSTANCE_UPDATED",
        instanceId,
        rowId: instance.row?.id ?? instance.rowId,
        unit: instance.row?.unit ?? "",
        building: instance.row?.building ?? "",
        level: instance.row?.level ?? "",
        scopeName: instance.subScope.name,
        changedFields: Object.keys(updateData),
        fromStage: instance.scopeStage ?? null,
        toStage: updated.scopeStage ?? null,
        fromStatus: instance.scopeStatus ?? null,
        toStatus: updated.scopeStatus ?? null,
        fromInspectionStatus: instance.inspectionStatus ?? null,
        toInspectionStatus: updated.inspectionStatus ?? null,
      });
    })();

    return NextResponse.json({
      id: updated.id,
      subScopeId: updated.subScopeId,
      rowId: updated.rowId,
      subScope: updated.subScope,
      qty: updated.qty != null
        ? Number((updated.qty as { toNumber?: () => number }).toNumber?.() ?? updated.qty)
        : null,
      scopeStage: updated.scopeStage ?? null,
      scopeStatus: updated.scopeStatus ?? null,
      inspectionStatus: updated.inspectionStatus ?? null,
    });
  } catch (err) {
    console.error(
      "[PATCH /api/projects/[id]/sub-scopes/instances/[instanceId]]",
      err
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
