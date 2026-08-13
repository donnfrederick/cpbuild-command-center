import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { logApi, apiTimer } from "@/lib/api-logger";
import { getSession } from "@/lib/dev-session";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import { upsertInspectionHistoryRow } from "@/lib/inspections/inspection-history-sync";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

const BackfillInspectionSchema = z.object({
  outcome: z.enum(["PASS", "FAIL"]),
  /** Optional note explaining the backfill context (stored in payload.note). */
  note: z.string().max(1000).optional(),
  /** Canonical scope-type code at time of backfill — for reporting/filtering. */
  scopeTypeCode: z.string().optional(),
  /**
   * The unit-level ProjectRow id. Defaults to rowId if omitted (correct when
   * the scope row and unit row are the same, which is the common case).
   */
  unitId: z.string().optional(),
});

/**
 * POST /api/projects/[id]/units/[rowId]/backfill-inspection
 *
 * Marks a scope as previously inspected (e.g. from Procore) without requiring
 * a filled-out form. Creates a lightweight InspectionSubmission (source=BACKFILL)
 * and updates ProjectRow.inspectionStatus.
 *
 * Guards:
 *  - Blocked (409) if any FORM-source InspectionSubmission exists for this scope.
 *  - If a prior BACKFILL record exists, it is updated in place (upsert semantics).
 * Note: no Install·Complete gate — Procore migrations may predate that status.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/units/[rowId]/backfill-inspection", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!hasPermission(userRole, PERMISSIONS.MANAGE_UNIT_STATUS)) {
    logApi("POST", "/api/projects/[id]/units/[rowId]/backfill-inspection", 403, `Forbidden — role "${userRole}" lacks MANAGE_UNIT_STATUS`, elapsed());
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

  const parsed = BackfillInspectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { outcome, note, scopeTypeCode, unitId: unitIdOverride } = parsed.data;

  // Verify the scope row exists and belongs to this project.
  const row = await db.projectRow.findFirst({
    where: { id: rowId, projectId },
    select: {
      id: true,
      building: true,
      level: true,
      unit: true,
      scopeType: { select: { name: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  // Gate: block if any FORM-source submission exists for this scope.
  // A real inspection was performed — the status is already tracked with full data.
  const formSubmission = await db.inspectionSubmission.findFirst({
    where: { scopeRowId: rowId, source: "FORM" },
    select: { id: true },
  });
  if (formSubmission) {
    return NextResponse.json(
      { error: "This scope already has a form-based inspection. Backfill is not allowed." },
      { status: 409 }
    );
  }

  // Check for an existing BACKFILL record to decide create vs. update.
  const existingBackfill = await db.inspectionSubmission.findFirst({
    where: { scopeRowId: rowId, source: "BACKFILL" },
    select: { id: true },
  });

  const inspectionStatus = outcome === "PASS" ? "PASSED" : "FAILED";
  const inspectedById = await resolveSessionToDbUserId(session.user);

  let submission: Awaited<ReturnType<typeof db.inspectionSubmission.create>>;
  try {
    submission = await db.$transaction(async (tx) => {
      if (existingBackfill) {
        const updated = await tx.inspectionSubmission.update({
          where: { id: existingBackfill.id },
          data: {
            outcome,
            payload: note ? { note } : {},
            submittedAt: new Date(),
            scopeTypeCode: scopeTypeCode ?? null,
          },
        });
        await upsertInspectionHistoryRow(tx, {
          inspectionSubmissionId: updated.id,
          scopeRowId: rowId,
          category: "CLEAR_INSPECTION",
          outcome,
          inspectedById,
        });
        await tx.projectRow.update({
          where: { id: rowId },
          data: { inspectionStatus },
        });
        return updated;
      }

      const created = await tx.inspectionSubmission.create({
        data: {
          source: "BACKFILL",
          formId: null,
          formVersionId: null,
          templateSnapshot: {},
          payload: note ? { note } : {},
          projectId,
          unitId: unitIdOverride ?? rowId,
          scopeRowId: rowId,
          scopeTypeCode: scopeTypeCode ?? null,
          outcome,
          deficiencyCount: 0,
        },
      });
      await upsertInspectionHistoryRow(tx, {
        inspectionSubmissionId: created.id,
        scopeRowId: rowId,
        category: "CLEAR_INSPECTION",
        outcome,
        inspectedById,
      });
      await tx.projectRow.update({
        where: { id: rowId },
        data: { inspectionStatus },
      });
      return created;
    });
  } catch (error) {
    console.error("[POST backfill-inspection] transaction failed:", error);
    return NextResponse.json(
      { error: "Failed to save backfill inspection" },
      { status: 500 }
    );
  }

  const submissionWithInspector = await db.inspectionSubmission.findUnique({
    where: { id: submission.id },
    include: {
      clearInspection: {
        select: {
          inspectedById: true,
          inspectedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  logApi(
    "POST",
    `/api/projects/${projectId}/units/${rowId}/backfill-inspection`,
    existingBackfill ? 200 : 201,
    `Backfill inspection ${existingBackfill ? "updated" : "created"}: outcome=${outcome}`,
    elapsed()
  );

  void (async () => {
    const actorId = session.user.id ?? null;
    const userName = await resolveActorName(actorId);
    void logActivity(projectId, actorId, userName, {
      eventType: "INSPECTION_BACKFILL_SET",
      rowId,
      unit: row.unit,
      building: row.building,
      level: row.level,
      scopeName: row.scopeType?.name ?? "",
      status: inspectionStatus,
    });
  })();

  return NextResponse.json({ submission: submissionWithInspector ?? submission }, { status: existingBackfill ? 200 : 201 });
}

/**
 * DELETE /api/projects/[id]/units/[rowId]/backfill-inspection
 *
 * Removes the BACKFILL InspectionSubmission for this scope and clears
 * inspectionStatus. Only valid when no FORM-source submission exists.
 * Used when a user clears the backfill status per-scope.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("DELETE", "/api/projects/[id]/units/[rowId]/backfill-inspection", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!hasPermission(userRole, PERMISSIONS.MANAGE_UNIT_STATUS)) {
    logApi("DELETE", "/api/projects/[id]/units/[rowId]/backfill-inspection", 403, `Forbidden`, elapsed());
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: projectId, rowId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, session);
  if (prodBlock) return prodBlock;

  const row = await db.projectRow.findFirst({
    where: { id: rowId, projectId },
    select: {
      building: true,
      level: true,
      unit: true,
      scopeType: { select: { name: true } },
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  // Safety check: never delete if FORM-source submissions exist.
  const formSubmission = await db.inspectionSubmission.findFirst({
    where: { scopeRowId: rowId, source: "FORM" },
    select: { id: true },
  });
  if (formSubmission) {
    return NextResponse.json(
      { error: "Cannot clear backfill — a real form-based inspection exists for this scope." },
      { status: 409 }
    );
  }

  await db.inspectionSubmission.deleteMany({
    where: { scopeRowId: rowId, source: "BACKFILL", projectId },
  });

  await db.projectRow.updateMany({
    where: { id: rowId, projectId },
    data: { inspectionStatus: null },
  });

  logApi("DELETE", `/api/projects/${projectId}/units/${rowId}/backfill-inspection`, 200, "Backfill cleared", elapsed());

  void (async () => {
    const actorId = session.user.id ?? null;
    const userName = await resolveActorName(actorId);
    void logActivity(projectId, actorId, userName, {
      eventType: "INSPECTION_BACKFILL_DELETED",
      rowId,
      unit: row.unit,
      building: row.building,
      level: row.level,
      scopeName: row.scopeType?.name ?? "",
    });
  })();

  return NextResponse.json({ cleared: true });
}
