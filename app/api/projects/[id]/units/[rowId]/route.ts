import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { hasSubScopeInstances } from "@/lib/sub-scopes";
import { getActivityReplayMetadata } from "@/lib/activity-logger";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { resolveSubcontractorDisplayName } from "@/lib/activity-subcontractor-log";
import {
  enforceProductionProjectMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";
import {
  BLOCKING_ISSUE_OPEN_CODE,
} from "@/lib/blocking-issue-code";
import {
  isTransitionToInstallComplete,
  projectRowHasOpenBlockingIssue,
} from "@/lib/install-complete-blocking";
import { getSession } from "@/lib/dev-session";

const UpdateProjectRowSchema = z.object({
  building: z.string().max(100).optional(),
  level: z.string().max(100).optional(),
  unit: z.string().max(100).optional(),
  area: z.string().max(200).optional(),
  shipPhase: z.string().max(100).optional(),
  buildPhase: z.string().max(100).optional(),
  scheme: z.string().max(100).optional(),
  unitType: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  scopeTypeId: z.string().nullable().optional(),
  /** Free-text code for scope type — auto-upserts lookup if not found. */
  scopeTypeCode: z.string().trim().min(1).max(100).optional(),
  csiPrimeCode: z.string().max(20).optional(),
  csiDetailCode: z.string().max(20).optional(),
  locationTypeId: z.string().nullable().optional(),
  /** Free-text code for location type — auto-upserts lookup if not found. */
  locationTypeCode: z.string().max(100).nullable().optional(),
  costTypeId: z.string().nullable().optional(),
  /** Free-text code for cost type — auto-upserts lookup if not found. */
  costTypeCode: z.string().max(100).nullable().optional(),
  installerId: z.string().nullable().optional(),
  /** Free-text code for installer/install team — auto-upserts lookup if not found. */
  installerCode: z.string().max(100).nullable().optional(),
  /** Unifier subcontractor assignment — stores UNIFIER_UXSUB.ID. */
  unifierSubId: z.string().nullable().optional(),
  /** Display name from SubcontractorPicker — activity log only, not persisted on the row. */
  subcontractorDisplayName: z.string().trim().max(200).optional(),
  qty: z.number().nullable().optional(),
  uomId: z.string().nullable().optional(),
  /** Free-text code for unit of measure — auto-upserts lookup if not found. */
  uomCode: z.string().max(100).nullable().optional(),
  unitRate: z.number().nullable().optional(),
  budgetedManHours: z.number().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  finishDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  percentComplete: z.number().nullable().optional(),
  actualManHours: z.number().nullable().optional(),
  scopeStage: z.enum(["STAGING", "ASSEMBLY", "INSTALL"]).nullable().optional(),
  scopeStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "PENDING_VERIFICATION", "COMPLETE"]).nullable().optional(),
  inspectionStatus: z.enum(["READY", "PASSED", "FAILED"]).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.scopeTypeId === null && data.scopeTypeCode === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scopeTypeId"],
      message: "Scope Type is required",
    });
  }
});

/**
 * GET /api/projects/[id]/units/[rowId]
 *
 * Returns a lightweight preview of the unit that owns this scope row.
 * Fetches all sibling scope rows for the same building/level/unit combination
 * so the caller can render a full unit preview without loading every unit.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId, rowId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const anchor = await db.projectRow.findUnique({
    where: { id: rowId },
    select: { building: true, level: true, unit: true, unitType: true },
  });
  if (!anchor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const scopes = await db.projectRow.findMany({
    where: { projectId, building: anchor.building, level: anchor.level, unit: anchor.unit },
    orderBy: { rowIndex: "asc" },
    include: {
      scopeType: {
        select: {
          id: true, code: true, name: true,
          canonicalScopeType: { select: { id: true, code: true, displayName: true } },
        },
      },
      uom: { select: { code: true, name: true } },
      installer: { select: { name: true } },
      subScopeInstances: {
        include: {
          subScope: {
            select: { id: true, name: true, displayOrder: true, unitType: true, scopeTypeId: true },
          },
        },
        orderBy: { subScope: { displayOrder: "asc" } },
      },
      clearInspections: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({
    building: anchor.building,
    level: anchor.level,
    unit: anchor.unit,
    area: "",
    unitType: anchor.unitType ?? "",
    scopes: scopes.map((s) => ({
      id: s.id,
      scopeType: s.scopeType
        ? {
            id: s.scopeType.id,
            code: s.scopeType.code,
            name: s.scopeType.name,
            canonicalScopeType: s.scopeType.canonicalScopeType ?? null,
          }
        : null,
      description: "",
      qty: s.qty != null ? Number(s.qty) : null,
      uom: s.uom ? { code: s.uom.code, name: s.uom.name } : null,
      percentComplete: s.percentComplete != null ? Number(s.percentComplete) : null,
      installer: s.installer ? { name: s.installer.name } : null,
      shipPhase: s.shipPhase ?? "",
      buildPhase: s.buildPhase ?? "",
      scopeStage: s.scopeStage ?? null,
      scopeStatus: s.scopeStatus ?? null,
      inspectionStatus: s.inspectionStatus ?? null,
      subScopeInstances: s.subScopeInstances.map((inst) => ({
        id: inst.id,
        subScopeId: inst.subScopeId,
        subScope: inst.subScope,
        qty: inst.qty != null ? Number(inst.qty) : null,
        scopeStage: inst.scopeStage ?? null,
        scopeStatus: inst.scopeStatus ?? null,
        inspectionStatus: inst.inspectionStatus ?? null,
      })),
      clearInspection: s.clearInspections[0]
        ? { id: s.clearInspections[0].id, status: s.clearInspections[0].status, createdAt: s.clearInspections[0].createdAt.toISOString() }
        : null,
    })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("PATCH", "/api/projects/[id]/units/[rowId]", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  const canEditUPM = hasPermission(userRole, PERMISSIONS.EDIT_UPM);
  const canManageStatus = hasPermission(userRole, PERMISSIONS.MANAGE_UNIT_STATUS);
  // Any row update requires either Field Tracker edit rights or unit status management rights.
  if (!userRole || (!canEditUPM && !canManageStatus)) {
    logApi("PATCH", "/api/projects/[id]/units/[rowId]", 403, `Forbidden — role "${userRole}" lacks EDIT_UPM or MANAGE_UNIT_STATUS`, elapsed());
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId, rowId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateProjectRowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { subcontractorDisplayName, ...data } = parsed.data;

  // Field-level gate: scopeStage, scopeStatus, and inspectionStatus are owned by roles with
  // MANAGE_UNIT_STATUS (ADMIN, DESIGNER, DEVELOPER, INSTALL_MANAGER, PROJECT_MANAGER). CONTROLS_MANAGER has
  // EDIT_UPM for UPM fields but must not change stage/status values.
  const touchesStatus =
    data.scopeStage !== undefined ||
    data.scopeStatus !== undefined ||
    data.inspectionStatus !== undefined;
  if (touchesStatus && !canManageStatus) {
    logApi("PATCH", "/api/projects/[id]/units/[rowId]", 403, `Forbidden — role "${userRole}" lacks MANAGE_UNIT_STATUS to update stage/status`, elapsed());
    return NextResponse.json({ error: "Forbidden — stage and status updates require MANAGE_UNIT_STATUS" }, { status: 403 });
  }

  const existing = await db.projectRow.findFirst({
    where: { id: rowId, projectId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Sub-scope gate: if this row has sub-scope instances, direct stage/status updates are
  // blocked. The install manager must update each sub-scope instance independently via
  // PATCH /api/projects/[id]/sub-scopes/instances/[instanceId].
  const touchesStageOrStatus =
    data.scopeStage !== undefined || data.scopeStatus !== undefined;
  if (touchesStageOrStatus) {
    const blocked = await hasSubScopeInstances(db, rowId);
    if (blocked) {
      logApi(
        "PATCH",
        `/api/projects/${projectId}/units/${rowId}`,
        409,
        "Blocked — row has sub-scope instances; update each instance instead",
        elapsed()
      );
      return NextResponse.json(
        {
          error:
            "This row has sub-scopes defined. Update stage and status on each sub-scope instance instead.",
          hint: `PATCH /api/projects/${projectId}/sub-scopes/instances/{instanceId}`,
        },
        { status: 409 }
      );
    }
  }

  /**
   * Resolve a code string to a lookup table ID, auto-upserting if the code
   * doesn't yet exist. Returns null when code is null/empty.
   */
  async function resolveCode(
    table: "scopeType" | "locationType" | "costType" | "installTeam" | "uomType",
    code: string | null | undefined
  ): Promise<string | null | undefined> {
    if (code === undefined) return undefined;
    if (!code || !code.trim()) return null;
    const normalized = code.trim();
    type TableMap = {
      scopeType: typeof db.scopeType;
      locationType: typeof db.locationType;
      costType: typeof db.costType;
      installTeam: typeof db.installTeam;
      uomType: typeof db.uomType;
    };
    const tableMap: TableMap = {
      scopeType: db.scopeType,
      locationType: db.locationType,
      costType: db.costType,
      installTeam: db.installTeam,
      uomType: db.uomType,
    };
    const model = tableMap[table] as unknown as {
      findFirst: (args: { where: { code: string } }) => Promise<{ id: string } | null>;
      create: (args: { data: { code: string; name: string } }) => Promise<{ id: string }>;
    };
    const found = await model.findFirst({ where: { code: normalized } });
    if (found) return found.id;
    const created = await model.create({ data: { code: normalized, name: normalized } });
    return created.id;
  }

  const updateData: Record<string, unknown> = {};
  if (data.building !== undefined) updateData.building = data.building;
  if (data.level !== undefined) updateData.level = data.level;
  if (data.unit !== undefined) updateData.unit = data.unit;
  if (data.area !== undefined) updateData.area = data.area;
  if (data.shipPhase !== undefined) updateData.shipPhase = data.shipPhase;
  if (data.buildPhase !== undefined) updateData.buildPhase = data.buildPhase;
  if (data.scheme !== undefined) updateData.scheme = data.scheme;
  if (data.unitType !== undefined) updateData.unitType = data.unitType;
  if (data.description !== undefined) updateData.description = data.description;
  // FK fields: prefer code-based resolution over raw ID
  if (data.scopeTypeCode !== undefined) {
    updateData.scopeTypeId = await resolveCode("scopeType", data.scopeTypeCode);
  } else if (data.scopeTypeId !== undefined) {
    updateData.scopeTypeId = data.scopeTypeId;
  }
  if (data.csiPrimeCode !== undefined) updateData.csiPrimeCode = data.csiPrimeCode;
  if (data.csiDetailCode !== undefined) updateData.csiDetailCode = data.csiDetailCode;
  if (data.locationTypeCode !== undefined) {
    updateData.locationTypeId = await resolveCode("locationType", data.locationTypeCode);
  } else if (data.locationTypeId !== undefined) {
    updateData.locationTypeId = data.locationTypeId;
  }
  if (data.costTypeCode !== undefined) {
    updateData.costTypeId = await resolveCode("costType", data.costTypeCode);
  } else if (data.costTypeId !== undefined) {
    updateData.costTypeId = data.costTypeId;
  }
  if (data.installerCode !== undefined) {
    updateData.installerId = await resolveCode("installTeam", data.installerCode);
  } else if (data.installerId !== undefined) {
    updateData.installerId = data.installerId;
  }
  if (data.unifierSubId !== undefined) updateData.unifierSubId = data.unifierSubId;
  if (data.qty !== undefined) updateData.qty = data.qty;
  if (data.uomCode !== undefined) {
    updateData.uomId = await resolveCode("uomType", data.uomCode);
  } else if (data.uomId !== undefined) {
    updateData.uomId = data.uomId;
  }
  if (data.unitRate !== undefined) updateData.unitRate = data.unitRate;
  if (data.budgetedManHours !== undefined) updateData.budgetedManHours = data.budgetedManHours;
  if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.finishDate !== undefined) updateData.finishDate = data.finishDate ? new Date(data.finishDate) : null;
  if (data.percentComplete !== undefined) updateData.percentComplete = data.percentComplete;
  if (data.actualManHours !== undefined) updateData.actualManHours = data.actualManHours;
  if (data.scopeStage !== undefined) updateData.scopeStage = data.scopeStage;
  if (data.scopeStatus !== undefined) updateData.scopeStatus = data.scopeStatus;
  if (data.inspectionStatus !== undefined) {
    // Inspection clearance is only valid when the row is at INSTALL+COMPLETE.
    // Determine effective stage/status: use incoming values if provided, else the persisted values.
    const effectiveStage = (data.scopeStage !== undefined ? data.scopeStage : existing.scopeStage) as string | null;
    const effectiveStatus = (data.scopeStatus !== undefined ? data.scopeStatus : existing.scopeStatus) as string | null;
    if (data.inspectionStatus !== null && (effectiveStage !== "INSTALL" || effectiveStatus !== "COMPLETE")) {
      return NextResponse.json(
        { error: "inspectionStatus can only be set when scopeStage=INSTALL and scopeStatus=COMPLETE" },
        { status: 422 }
      );
    }
    updateData.inspectionStatus = data.inspectionStatus;
  }

  const nextStage = (data.scopeStage !== undefined ? data.scopeStage : existing.scopeStage) as
    | string
    | null;
  const nextStatus = (data.scopeStatus !== undefined ? data.scopeStatus : existing.scopeStatus) as
    | string
    | null;
  if (
    data.inspectionStatus === undefined &&
    (data.scopeStage !== undefined || data.scopeStatus !== undefined) &&
    (nextStage !== "INSTALL" || nextStatus !== "COMPLETE")
  ) {
    updateData.inspectionStatus = null;
  }
  if (
    isTransitionToInstallComplete(
      existing.scopeStage,
      existing.scopeStatus,
      nextStage,
      nextStatus
    ) &&
    (await projectRowHasOpenBlockingIssue(projectId, rowId))
  ) {
    return NextResponse.json(
      {
        error: "Cannot mark install complete while a blocking issue is open on this scope.",
        code: BLOCKING_ISSUE_OPEN_CODE,
      },
      { status: 422 }
    );
  }

  const updated = await db.projectRow.update({
    where: { id: rowId },
    data: updateData,
    include: {
      scopeType: {
        include: {
          canonicalScopeType: { select: { id: true, code: true, displayName: true } },
        },
      },
      locationType: true,
      costType: true,
      installer: true,
      uom: true,
    },
  });

  const payload = {
    id: updated.id,
    rowIndex: updated.rowIndex,
    building: updated.building,
    level: updated.level,
    unit: updated.unit,
    area: updated.area,
    shipPhase: updated.shipPhase,
    buildPhase: updated.buildPhase,
    scheme: updated.scheme,
    unitType: updated.unitType,
    description: updated.description,
    scopeType: updated.scopeType
      ? {
          id: updated.scopeType.id,
          code: updated.scopeType.code,
          name: updated.scopeType.name,
          canonicalScopeType: updated.scopeType.canonicalScopeType ?? null,
        }
      : null,
    csiPrimeCode: updated.csiPrimeCode,
    csiDetailCode: updated.csiDetailCode,
    locationType: updated.locationType ? { id: updated.locationType.id, code: updated.locationType.code, name: updated.locationType.name } : null,
    costType: updated.costType ? { id: updated.costType.id, code: updated.costType.code, name: updated.costType.name } : null,
    installer: updated.installer ? { id: updated.installer.id, code: updated.installer.code, name: updated.installer.name } : null,
    unifierSubId: updated.unifierSubId ?? null,
    qty: updated.qty != null ? Number(updated.qty) : null,
    uom: updated.uom ? { id: updated.uom.id, code: updated.uom.code, name: updated.uom.name } : null,
    unitRate: updated.unitRate != null ? Number(updated.unitRate) : null,
    budgetedManHours: updated.budgetedManHours != null ? Number(updated.budgetedManHours) : null,
    startDate: updated.startDate?.toISOString().slice(0, 10) ?? null,
    finishDate: updated.finishDate?.toISOString().slice(0, 10) ?? null,
    percentComplete: updated.percentComplete != null ? Number(updated.percentComplete) : null,
    actualManHours: updated.actualManHours != null ? Number(updated.actualManHours) : null,
    scopeStage: updated.scopeStage ?? null,
    scopeStatus: updated.scopeStatus ?? null,
    inspectionStatus: updated.inspectionStatus ?? null,
  };

  logApi("PATCH", `/api/projects/${projectId}/units/${rowId}`, 200, "Updated row", elapsed(), payload);

  // Log status, inspection, and subcontractor edits to the activity feed.
  const replayMeta = getActivityReplayMetadata(request.headers);
  const requestBody =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const touchesStageStatus = data.scopeStage !== undefined || data.scopeStatus !== undefined;
  const touchesInspectionOnly =
    data.inspectionStatus !== undefined && !touchesStageStatus;
  const touchesSubcontractor = data.unifierSubId !== undefined;
  if (touchesStageStatus || touchesInspectionOnly || touchesSubcontractor) {
    void (async () => {
      if (touchesStageStatus) {
        voidLogFieldActivity(projectId, session, {
          eventType: "SCOPE_STATUS_UPDATED",
          rowId,
          unit: existing.unit,
          building: existing.building,
          level: existing.level,
          scopeName: updated.scopeType?.name ?? "",
          fromStage: existing.scopeStage ?? null,
          toStage: updated.scopeStage ?? null,
          fromStatus: existing.scopeStatus ?? null,
          toStatus: updated.scopeStatus ?? null,
          ...replayMeta,
        }, { requestBody });
      } else if (touchesInspectionOnly) {
        voidLogFieldActivity(projectId, session, {
          eventType: "SCOPE_INSPECTION_UPDATED",
          rowId,
          unit: existing.unit,
          building: existing.building,
          level: existing.level,
          scopeName: updated.scopeType?.name ?? "",
          fromInspectionStatus: existing.inspectionStatus ?? null,
          toInspectionStatus: updated.inspectionStatus ?? null,
          ...replayMeta,
        }, { requestBody });
      }

      if (touchesSubcontractor) {
        const fromUnifierSubId = existing.unifierSubId ?? null;
        const toUnifierSubId = updated.unifierSubId ?? null;
        if (fromUnifierSubId !== toUnifierSubId) {
          const subcontractorName =
            subcontractorDisplayName?.trim() ||
            (await resolveSubcontractorDisplayName(toUnifierSubId));
          voidLogFieldActivity(projectId, session, {
            eventType: "SCOPE_SUBCONTRACTOR_UPDATED",
            rowId,
            unit: updated.unit,
            building: updated.building,
            level: updated.level,
            scopeName: updated.scopeType?.name ?? "",
            fromUnifierSubId,
            toUnifierSubId,
            subcontractorName,
            ...replayMeta,
          }, { requestBody });
        }
      }
    })();
  }

  return NextResponse.json(payload);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("DELETE", "/api/projects/[id]/units/[rowId]", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  // Deleting a unit row requires EDIT_UPM (CONTROLS_MANAGER) or MANAGE_PROJECTS (INSTALL_MANAGER etc).
  if (!userRole || (!hasPermission(userRole, PERMISSIONS.EDIT_UPM) && !hasPermission(userRole, PERMISSIONS.MANAGE_PROJECTS))) {
    logApi("DELETE", "/api/projects/[id]/units/[rowId]", 403, `Forbidden — role "${userRole}" lacks EDIT_UPM or MANAGE_PROJECTS`, elapsed());
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId, rowId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  const existing = await db.projectRow.findFirst({
    where: { id: rowId, projectId },
    include: { scopeType: { select: { name: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.projectRow.delete({ where: { id: rowId } });
  logApi("DELETE", `/api/projects/${projectId}/units/${rowId}`, 200, "Deleted row", elapsed(), null);

  return NextResponse.json({ deleted: true });
}
