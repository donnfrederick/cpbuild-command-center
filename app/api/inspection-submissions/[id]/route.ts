import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { replaceInspectionDeficiencies } from "@/lib/inspections/deficiency-extraction";
import {
  INSPECTION_JSON_STUB,
  MissingFormVersionQuestionError,
  replaceInspectionAnswers,
} from "@/lib/inspections/reporting-normalization";
import { persistInspectionAutoAppendix } from "@/lib/inspections/inspection-auto-appendix";
import { loadFormVersionSectionsFromReporting } from "@/lib/inspections/form-reporting-structure";
import { hydrateInspectionSubmissionView } from "@/lib/inspections/hydrate-inspection-submission-view";
import { getInspectionDeficiencyMetrics } from "@/lib/inspections/activity-metadata";
import { buildInspectionActivityLocationMetadata } from "@/lib/inspections/unit-inspection-ref";
import {
  getInspectionTypeIdByCode,
  inspectionTypeCodeForSubmission,
} from "@/lib/inspections/inspection-type";
import {
  shouldCreateInspectionHistoryRow,
  upsertInspectionHistoryRow,
} from "@/lib/inspections/inspection-history-sync";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";
import { recomputeScopeInspectionStatusFromSubmissions } from "@/lib/inspections/recompute-scope-inspection-status";

// ─── GET /api/inspection-submissions/[id] ─────────────────────────────────────
// Returns a single submission with templateSnapshot and payload for the record
// viewer. Relational-authoritative rows hydrate from mirror tables when JSON
// columns hold stubs.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const submission = await db.inspectionSubmission.findUnique({
    where: { id },
    include: {
      form: {
        select: {
          id: true,
          name: true,
          category: true,
          level: true,
          purpose: true,
          scopeTypeCodes: true,
          description: true,
        },
      },
      formVersion: { select: { id: true, versionNumber: true } },
      clearInspection: {
        select: {
          inspectedById: true,
          inspectedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const readBlock = await enforceProjectReadVisibility(submission.projectId, effective);
  if (readBlock) return readBlock;

  const hydrated = await hydrateInspectionSubmissionView(submission);

  return NextResponse.json({
    submission: {
      ...submission,
      templateSnapshot: hydrated.templateSnapshot,
      payload: hydrated.payload,
    },
  });
}

const UpdateSchema = z.object({
  outcome: z.enum(["PASS", "FAIL", "COMPLETE"]),
  deficiencyCount: z.number().int().min(0).default(0),
  payload: z.record(z.string(), z.unknown()),
});

async function restoreSubmissionAfterUpdateFailure(input: {
  submissionId: string;
  previousOutcome: "PASS" | "FAIL" | "COMPLETE";
  previousDeficiencyCount: number;
  previousPayload: object;
  previousTemplateSnapshot: unknown;
  previousFormVersionId: string | null;
  scopeRowId: string | null;
  previousInspectionStatus: "READY" | "PASSED" | "FAILED" | null;
  previousClearInspection: {
    rowId: string;
    status: "PASSED" | "FAILED";
    deletedAt: Date | null;
    inspectionTypeId: string;
    inspectedById: string | null;
  } | null;
}): Promise<void> {
  await db.inspectionSubmission.update({
    where: { id: input.submissionId },
    data: {
      outcome: input.previousOutcome,
      deficiencyCount: input.previousDeficiencyCount,
      payload: input.previousPayload,
    },
  }).catch(() => null);

  if (input.scopeRowId) {
    await db.projectRow.update({
      where: { id: input.scopeRowId },
      data: { inspectionStatus: input.previousInspectionStatus },
    }).catch(() => null);
  }

  if (input.previousClearInspection) {
    await db.clearInspection.upsert({
      where: { inspectionSubmissionId: input.submissionId },
      create: {
        rowId: input.previousClearInspection.rowId,
        status: input.previousClearInspection.status,
        inspectionSubmissionId: input.submissionId,
        deletedAt: input.previousClearInspection.deletedAt,
        inspectionTypeId: input.previousClearInspection.inspectionTypeId,
        inspectedById: input.previousClearInspection.inspectedById,
      },
      update: {
        status: input.previousClearInspection.status,
        deletedAt: input.previousClearInspection.deletedAt,
        inspectionTypeId: input.previousClearInspection.inspectionTypeId,
        inspectedById: input.previousClearInspection.inspectedById,
      },
    }).catch(() => null);
  } else {
    await db.clearInspection.deleteMany({ where: { inspectionSubmissionId: input.submissionId } }).catch(() => null);
  }

  const answerIdByQuestionId = await replaceInspectionAnswers({
    inspectionSubmissionId: input.submissionId,
    formVersionId: input.previousFormVersionId ?? undefined,
    templateSnapshot: input.previousTemplateSnapshot,
    payload: input.previousPayload,
  }).catch(() => new Map<string, string>());

  await replaceInspectionDeficiencies({
    inspectionSubmissionId: input.submissionId,
    answerIdByQuestionId,
    templateSnapshot: input.previousTemplateSnapshot,
    payload: input.previousPayload,
  }).catch(() => null);
}

// ─── PUT /api/inspection-submissions/[id] ─────────────────────────────────────
// Edit the most recent attempt for a submission. Enforces that no newer
// attempt exists for the same scope+form combo before allowing the update.

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedUserId = await resolveSessionToDbUserId(effective.user);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await db.inspectionSubmission.findUnique({
    where: { id },
    include: {
      form: { select: { category: true } },
      clearInspection: { select: { inspectedById: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const readBlock = await enforceProjectReadVisibility(existing.projectId, effective);
  if (readBlock) return readBlock;

  const existingTemplateSnapshot =
    existing.templateSnapshot && typeof existing.templateSnapshot === "object" && !Array.isArray(existing.templateSnapshot)
      ? (existing.templateSnapshot as Record<string, unknown>)
      : null;
  const isCalibration = existingTemplateSnapshot?.category === "CALIBRATION_INSPECTION";

  const typeCode = inspectionTypeCodeForSubmission(
    existing.templateSnapshot,
    existing.form?.category,
  );
  if (existing.source === "FORM") {
    const authorId = existing.clearInspection?.inspectedById;
    if (authorId && (!resolvedUserId || authorId !== resolvedUserId)) {
      return NextResponse.json(
        { error: "Only the original submitter can edit this inspection." },
        { status: 403 },
      );
    }
  }

  // Ensure this is the most recent submission for this scope + form.
  if (existing.scopeRowId && existing.formId) {
    const newer = await db.inspectionSubmission.findFirst({
      where: {
        scopeRowId: existing.scopeRowId,
        formId: existing.formId,
        submittedAt: { gt: existing.submittedAt },
      },
      select: { id: true },
    });
    if (newer) {
      return NextResponse.json(
        { error: "Only the most recent attempt can be edited." },
        { status: 409 },
      );
    }
  }

  const { outcome, deficiencyCount, payload } = parsed.data;
  const previousInspectionStatus = existing.scopeRowId
    ? await db.projectRow.findUnique({
        where: { id: existing.scopeRowId },
        select: { inspectionStatus: true },
      })
    : null;
  const previousClearInspection = await db.clearInspection.findUnique({
    where: { inspectionSubmissionId: id },
    select: { rowId: true, status: true, deletedAt: true, inspectionTypeId: true, inspectedById: true },
  });

  const updated = await db.inspectionSubmission.update({
    where: { id },
    data: { outcome, deficiencyCount, payload: INSPECTION_JSON_STUB },
    include: {
      form: { select: { id: true, name: true } },
      formVersion: { select: { id: true, versionNumber: true } },
    },
  });

  try {
    if (!updated.formVersionId) {
      return NextResponse.json(
        { error: "Submission is missing formVersionId and cannot be updated relationally" },
        { status: 422 },
      );
    }

    const versionSections = await loadFormVersionSectionsFromReporting(updated.formVersionId);
    const templateForNormalization = { sections: versionSections };

    if (existing.scopeRowId) {
      await recomputeScopeInspectionStatusFromSubmissions(existing.scopeRowId, db);
    }
    if (shouldCreateInspectionHistoryRow({ scopeRowId: existing.scopeRowId, category: typeCode })) {
      await upsertInspectionHistoryRow(db, {
        inspectionSubmissionId: id,
        scopeRowId: existing.scopeRowId!,
        category: typeCode,
        outcome,
        inspectedById: previousClearInspection?.inspectedById ?? resolvedUserId,
      });
    }

    const answerIdByQuestionId = await replaceInspectionAnswers({
      inspectionSubmissionId: updated.id,
      formVersionId: updated.formVersionId,
      templateSnapshot: templateForNormalization,
      payload,
    });

    await replaceInspectionDeficiencies({
      inspectionSubmissionId: updated.id,
      answerIdByQuestionId,
      templateSnapshot: templateForNormalization,
      payload,
    });
  } catch (error) {
    if (error instanceof MissingFormVersionQuestionError) {
      await restoreSubmissionAfterUpdateFailure({
        submissionId: existing.id,
        previousOutcome: existing.outcome,
        previousDeficiencyCount: existing.deficiencyCount,
        previousPayload: existing.payload as object,
        previousTemplateSnapshot: existing.templateSnapshot,
        previousFormVersionId: existing.formVersionId,
        scopeRowId: existing.scopeRowId,
        previousInspectionStatus: previousInspectionStatus?.inspectionStatus ?? null,
        previousClearInspection,
      });
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    await restoreSubmissionAfterUpdateFailure({
      submissionId: existing.id,
      previousOutcome: existing.outcome,
      previousDeficiencyCount: existing.deficiencyCount,
      previousPayload: existing.payload as object,
      previousTemplateSnapshot: existing.templateSnapshot,
      previousFormVersionId: existing.formVersionId,
      scopeRowId: existing.scopeRowId,
      previousInspectionStatus: previousInspectionStatus?.inspectionStatus ?? null,
      previousClearInspection,
    });
    console.warn("[inspection-submissions] restored submission after update normalization failure", error);
    throw error;
  }

  // After relational answers/deficiencies succeed — decouple appendix JSON from restore path.
  await persistInspectionAutoAppendix(db, updated.id, payload);

  const deficiencyMetrics = getInspectionDeficiencyMetrics(payload);

  // Fire-and-forget activity log — never blocks the HTTP response.
  void (async () => {
    try {
      const scopeRow = existing.scopeRowId
        ? await db.projectRow.findUnique({
            where: { id: existing.scopeRowId },
            select: {
              building: true,
              level: true,
              unit: true,
              scopeType: { select: { name: true } },
            },
          })
        : null;

      const attemptNumber = await db.inspectionSubmission.count({
        where: {
          formId: existing.formId ?? undefined,
          ...(existing.scopeRowId
            ? { scopeRowId: existing.scopeRowId }
            : { unitId: existing.unitId }),
        },
      });

      const locationMeta = buildInspectionActivityLocationMetadata({
        scopeRowId: existing.scopeRowId,
        unitId: existing.unitId,
        scopeRow,
        scopeTypeCode: existing.scopeTypeCode,
      });

      voidLogFieldActivity(
        existing.projectId,
        { user: effective.user },
        {
          eventType: "INSPECTION_SUBMITTED",
          submissionId: updated.id,
          formName: updated.form?.name ?? "",
          category: isCalibration ? "CALIBRATION_INSPECTION" : (existing.form?.category ?? ""),
          outcome,
          deficiencyCount,
          failedQuestionCount: deficiencyMetrics.failedQuestionCount,
          totalDeficiencyCount: deficiencyMetrics.totalDeficiencyCount,
          attemptNumber,
          isEdit: true,
          ...locationMeta,
        },
        {
          requestBody: typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null,
        },
      );
    } catch {
      // Silently swallow — logging must never fail the update.
    }
  })();

  return NextResponse.json({ submission: updated });
}
