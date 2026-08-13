import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { getSession } from "@/lib/dev-session";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";

/**
 * Records a single activity-log entry after chunked bulk status updates
 * (when each chunk used `skipActivityLog: true` on POST .../bulk-status).
 */
const BulkStatusActivitySchema = z.object({
  appliedRowIds: z.array(z.string()).default([]),
  appliedSubScopeInstanceIds: z.array(z.string()).default([]),
  scopeStage: z.enum(["STAGING", "ASSEMBLY", "INSTALL"]).nullable().optional(),
  scopeStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "PENDING_VERIFICATION", "COMPLETE"]),
}).refine(
  (d) => d.appliedRowIds.length + d.appliedSubScopeInstanceIds.length > 0,
  { message: "At least one applied row or sub-scope instance id is required" }
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/units/bulk-status/activity", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!hasPermission(userRole, PERMISSIONS.MANAGE_UNIT_STATUS)) {
    logApi("POST", "/api/projects/[id]/units/bulk-status/activity", 403, `Forbidden — role "${userRole}" lacks MANAGE_UNIT_STATUS`, elapsed());
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

  const parsed = BulkStatusActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { appliedRowIds, appliedSubScopeInstanceIds, scopeStage, scopeStatus } = parsed.data;

  const unitRefMap = new Map<string, { building: string; level: string; unit: string }>();

  if (appliedRowIds.length > 0) {
    const rows = await db.projectRow.findMany({
      where: { id: { in: appliedRowIds }, projectId },
      select: { building: true, level: true, unit: true },
    });
    for (const r of rows) {
      const key = `${r.building}|${r.level}|${r.unit}`;
      unitRefMap.set(key, { building: r.building, level: r.level, unit: r.unit });
    }
  }

  if (appliedSubScopeInstanceIds.length > 0) {
    const instances = await db.projectSubScopeInstance.findMany({
      where: { id: { in: appliedSubScopeInstanceIds }, row: { projectId } },
      select: { row: { select: { building: true, level: true, unit: true } } },
    });
    for (const inst of instances) {
      const r = inst.row;
      const key = `${r.building}|${r.level}|${r.unit}`;
      unitRefMap.set(key, { building: r.building, level: r.level, unit: r.unit });
    }
  }

  const unitRefs = Array.from(unitRefMap.values()).sort((a, b) => {
    const c1 = a.building.localeCompare(b.building);
    if (c1 !== 0) return c1;
    const c2 = a.level.localeCompare(b.level);
    if (c2 !== 0) return c2;
    return a.unit.localeCompare(b.unit);
  });

  const count = appliedRowIds.length + appliedSubScopeInstanceIds.length;
  const requestBody =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;

  logApi(
    "POST",
    `/api/projects/${projectId}/units/bulk-status/activity`,
    200,
    `Bulk status activity log: ${count} applies, ${unitRefs.length} unique units`,
    elapsed()
  );

  voidLogFieldActivity(
    projectId,
    session,
    {
      eventType: "SCOPE_STATUS_BULK_UPDATED",
      count,
      scopeStage: scopeStage ?? null,
      scopeStatus,
      unitRefs,
    },
    { requestBody },
  );

  return NextResponse.json({ ok: true });
}
