import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession, productionGuardSession, writeAuthorizationRole } from "@/lib/masquerade";
import { logApi, apiTimer } from "@/lib/api-logger";
import { enforceProductionProjectMutation } from "@/lib/production-project-access";
import { INSPECTION_CATEGORIES } from "@/components/forms/formTypes";
import {
  categoryFromSubmissionSnapshot,
} from "@/lib/inspections/inspection-type-codes";
import { resolveGridSubmissionCategory } from "@/lib/inspections/resolve-grid-submission-category";
import { recomputeScopeInspectionStatusFromSubmissions } from "@/lib/inspections/recompute-scope-inspection-status";
import { isFieldLeadershipRole } from "@/lib/permissions";

const ResetInspectionSchema = z.object({
  category: z.enum(INSPECTION_CATEGORIES),
});

function submissionMatchesCategory(
  submission: {
    source: string;
    templateSnapshot: unknown;
    form: { category: string } | null;
  },
  category: z.infer<typeof ResetInspectionSchema>["category"],
): boolean {
  if (category === "CALIBRATION_INSPECTION") {
    return categoryFromSubmissionSnapshot(submission.templateSnapshot) === "CALIBRATION_INSPECTION";
  }
  if (category === "CLEAR_INSPECTION" && submission.source === "BACKFILL") {
    return true;
  }
  const resolved = resolveGridSubmissionCategory(
    submission.templateSnapshot,
    submission.form?.category ?? null,
  );
  return resolved === category;
}

/**
 * POST /api/projects/[id]/units/[rowId]/inspections/reset
 *
 * Admin-only: removes the latest submission for a given inspection category on
 * this scope, soft-deletes the linked clear_inspections row, and recomputes
 * project_rows.inspectionStatus from remaining history.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; rowId: string }> },
) {
  const elapsed = apiTimer();
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    logApi("POST", "/api/projects/[id]/units/[rowId]/inspections/reset", 401, "Unauthorized", elapsed());
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isFieldLeadershipRole(writeAuthorizationRole(effective))) {
    logApi("POST", "/api/projects/[id]/units/[rowId]/inspections/reset", 403, "Forbidden — field leadership only", elapsed());
    return NextResponse.json({ error: "Forbidden — field leadership only" }, { status: 403 });
  }

  const { id: projectId, rowId } = await params;

  const prodBlock = await enforceProductionProjectMutation(projectId, productionGuardSession(effective));
  if (prodBlock) return prodBlock;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ResetInspectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = await db.projectRow.findUnique({
    where: { id: rowId },
    select: { projectId: true },
  });
  if (!row || row.projectId !== projectId) {
    logApi("POST", "/api/projects/[id]/units/[rowId]/inspections/reset", 404, "Scope not found", elapsed());
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  const submissions = await db.inspectionSubmission.findMany({
    where: { scopeRowId: rowId, projectId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      source: true,
      templateSnapshot: true,
      form: { select: { category: true } },
      clearInspection: { select: { id: true, deletedAt: true } },
    },
  });

  const target = submissions.find((sub) => submissionMatchesCategory(sub, parsed.data.category));
  if (!target) {
    logApi("POST", "/api/projects/[id]/units/[rowId]/inspections/reset", 404, "No submission for category", elapsed());
    return NextResponse.json({ error: "No inspection submission found for this category" }, { status: 404 });
  }

  await db.$transaction(async (tx) => {
    if (target.clearInspection && !target.clearInspection.deletedAt) {
      await tx.clearInspection.update({
        where: { id: target.clearInspection.id },
        data: { deletedAt: new Date() },
      });
    }
    await tx.inspectionSubmission.delete({ where: { id: target.id } });
    await recomputeScopeInspectionStatusFromSubmissions(rowId, tx);
  });

  logApi("POST", "/api/projects/[id]/units/[rowId]/inspections/reset", 200, `Reset ${parsed.data.category} on ${rowId}`, elapsed());
  return NextResponse.json({ ok: true, deletedSubmissionId: target.id });
}
