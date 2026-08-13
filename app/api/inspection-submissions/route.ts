import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { getActivityReplayMetadata } from "@/lib/activity-logger";
import { voidLogFieldActivity } from "@/lib/activity/log-field-activity";
import { replaceInspectionDeficiencies } from "@/lib/inspections/deficiency-extraction";
import {
  buildInspectionCategoryStub,
  INSPECTION_JSON_STUB,
  MissingFormVersionQuestionError,
  replaceInspectionAnswers,
} from "@/lib/inspections/reporting-normalization";
import { persistInspectionAutoAppendix } from "@/lib/inspections/inspection-auto-appendix";
import { loadFormVersionSectionsFromReporting } from "@/lib/inspections/form-reporting-structure";
import { hydrateInspectionSubmissionView } from "@/lib/inspections/hydrate-inspection-submission-view";
import { assertScopeReadyForClearInspection } from "@/lib/inspections/assert-scope-ready-for-clear-inspection";
import { getInspectionDeficiencyMetrics } from "@/lib/inspections/activity-metadata";
import {
  createInspectionHistoryRow,
  shouldCreateInspectionHistoryRow,
  shouldSyncScopeInspectionStatus,
} from "@/lib/inspections/inspection-history-sync";
import { recomputeScopeInspectionStatusFromSubmissions } from "@/lib/inspections/recompute-scope-inspection-status";
import {
  CalibrationTargetError,
  resolveCalibratedAgainstClearInspectionId,
} from "@/lib/inspections/calibration-target";
import {
  buildInspectionActivityLocationMetadata,
  PROJECT_LEVEL_INSPECTION_UNIT_ID,
  validateFormLevelScopeBinding,
} from "@/lib/inspections/unit-inspection-ref";
import {
  attachSubmitterFromSession,
  enrichSubmissionsWithActivitySubmitters,
} from "@/lib/inspections/resolve-submission-submitter";
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

// ─── Validation ───────────────────────────────────────────────────────────────

const SubmitInspectionSchema = z.object({
  formId: z.string().min(1),
  formVersionId: z.string().min(1),
  /** Legacy field — ignored for storage; version structure loaded from relational mirror. */
  templateSnapshot: z.unknown().optional(),
  projectId: z.string().min(1),
  unitId: z.string().min(1),
  scopeRowId: z.string().optional(),
  scopeTypeCode: z.string().optional(),
  outcome: z.enum(["PASS", "FAIL", "COMPLETE"]),
  deficiencyCount: z.number().int().min(0).default(0),
  /** Answer payload keyed by question id */
  payload: z.record(z.string(), z.unknown()),
  /**
   * Optional category override. When set to "CALIBRATION_INSPECTION" the submission
   * is stored with that category snapshot and all clear-inspection business rules
   * (install-complete gate, chain-rule pass block, inspectionStatus sync) are skipped.
   */
  categoryOverride: z.enum(["CALIBRATION_INSPECTION"]).optional(),
  /** Required when categoryOverride is CALIBRATION_INSPECTION — the clear submission being calibrated. */
  calibratedAgainstSubmissionId: z.string().cuid().optional(),
});

class ClearInspectionConflictError extends Error {
  constructor() {
    super("This scope already has a passing clear inspection and cannot be re-inspected.");
    this.name = "ClearInspectionConflictError";
  }
}

// ─── GET /api/inspection-submissions ─────────────────────────────────────────
// Query params: scopeRowId, unitId, projectId (all optional, at least one required)

export async function GET(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scopeRowId = searchParams.get("scopeRowId");
  const unitId = searchParams.get("unitId");
  const projectId = searchParams.get("projectId");

  if (!scopeRowId && !unitId && !projectId) {
    return NextResponse.json({ error: "At least one filter (scopeRowId, unitId, or projectId) is required" }, { status: 400 });
  }

  if (unitId?.includes("|") && !scopeRowId && !projectId) {
    return NextResponse.json(
      { error: "projectId is required when querying by unit location ref" },
      { status: 400 },
    );
  }

  const submissions = await db.inspectionSubmission.findMany({
    where: {
      ...(scopeRowId ? { scopeRowId } : {}),
      ...(unitId
        ? {
            unitId,
            ...(unitId === PROJECT_LEVEL_INSPECTION_UNIT_ID && !scopeRowId
              ? { scopeRowId: null }
              : unitId.includes("|") && !scopeRowId
                ? { scopeRowId: null }
                : {}),
          }
        : {}),
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { submittedAt: "desc" },
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

  const hydratedSubmissions = await Promise.all(
    submissions.map(async (submission) => {
      const hydrated = await hydrateInspectionSubmissionView(submission);
      return {
        ...submission,
        templateSnapshot: hydrated.templateSnapshot,
        payload: hydrated.payload,
      };
    }),
  );

  const withSubmitters = await enrichSubmissionsWithActivitySubmitters(
    db,
    hydratedSubmissions,
  );

  return NextResponse.json({ submissions: withSubmitters });
}

// ─── POST /api/inspection-submissions ────────────────────────────────────────

export async function POST(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SubmitInspectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const {
    formId,
    formVersionId,
    projectId,
    unitId,
    scopeRowId,
    scopeTypeCode,
    outcome,
    deficiencyCount,
    payload,
    categoryOverride,
    calibratedAgainstSubmissionId,
  } = parsed.data;

  const isCalibration = categoryOverride === "CALIBRATION_INSPECTION";
  const inspectedById = await resolveSessionToDbUserId(effective.user);

  if (isCalibration && !calibratedAgainstSubmissionId) {
    return NextResponse.json(
      { error: "calibratedAgainstSubmissionId is required for calibration inspections" },
      { status: 400 },
    );
  }

  // Verify form exists and capture category/name for business-rule checks and activity log.
  const form = await db.form.findUnique({
    where: { id: formId },
    select: { id: true, name: true, category: true, level: true },
  });
  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const levelBinding = validateFormLevelScopeBinding({
    formLevel: form.level,
    formCategory: form.category,
    unitId,
    scopeRowId,
  });
  if (!levelBinding.ok) {
    return NextResponse.json({ error: levelBinding.error }, { status: levelBinding.status });
  }

  const formVersion = await db.formVersion.findFirst({
    where: { id: formVersionId, formId },
    select: { id: true },
  });
  if (!formVersion) {
    return NextResponse.json(
      { error: "formVersionId does not belong to the specified form" },
      { status: 422 },
    );
  }

  const versionSections = await loadFormVersionSectionsFromReporting(formVersionId);
  if (versionSections.length === 0) {
    return NextResponse.json(
      { error: "Form version has no published questions — republish the form and try again" },
      { status: 422 },
    );
  }

  const templateForNormalization = { sections: versionSections };
  const storedCategory = isCalibration ? "CALIBRATION_INSPECTION" : form.category;
  const storedSnapshot = buildInspectionCategoryStub(storedCategory);

  // ── Clear Inspection business rules ──────────────────────────────────────
  if (!isCalibration && form.category === "CLEAR_INSPECTION" && scopeRowId) {
    const gate = await assertScopeReadyForClearInspection(scopeRowId, db);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // Chain rule: no new attempt if the scope already has a passing clear inspection.
    const existingPass = await db.inspectionSubmission.findFirst({
      where: {
        scopeRowId,
        outcome: { in: ["PASS", "COMPLETE"] },
        form: { category: "CLEAR_INSPECTION" },
      },
      select: { id: true },
    });
    if (existingPass) {
      return NextResponse.json(
        { error: "This scope already has a passing clear inspection and cannot be re-inspected." },
        { status: 409 },
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  let calibratedAgainstClearInspectionId: string | null = null;
  try {
    calibratedAgainstClearInspectionId = await resolveCalibratedAgainstClearInspectionId(db, {
      isCalibration,
      scopeRowId,
      calibratedAgainstSubmissionId,
    });
  } catch (error) {
    if (error instanceof CalibrationTargetError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  let submission: Awaited<ReturnType<typeof db.inspectionSubmission.create>>;
  try {
    submission = await db.$transaction(async (tx) => {
      if (!isCalibration && form.category === "CLEAR_INSPECTION" && scopeRowId) {
        const existingPass = await tx.inspectionSubmission.findFirst({
          where: {
            scopeRowId,
            outcome: { in: ["PASS", "COMPLETE"] },
            form: { category: "CLEAR_INSPECTION" },
          },
          select: { id: true },
        });
        if (existingPass) throw new ClearInspectionConflictError();
      }

      const createdSubmission = await tx.inspectionSubmission.create({
        data: {
          formId,
          formVersionId,
          templateSnapshot: storedSnapshot,
          projectId,
          unitId,
          scopeRowId: scopeRowId ?? null,
          scopeTypeCode: scopeTypeCode ?? null,
          outcome,
          deficiencyCount,
          payload: INSPECTION_JSON_STUB,
        },
        include: {
          form: { select: { id: true, name: true } },
          formVersion: { select: { id: true, versionNumber: true } },
        },
      });

      // Sync scope status for formal clears only; all clear + calibration submissions
      // get a history row on clear_inspections (future: inspections).
      if (scopeRowId && shouldSyncScopeInspectionStatus({ category: storedCategory, scopeRowId })) {
        await recomputeScopeInspectionStatusFromSubmissions(scopeRowId, tx);
      }
      if (shouldCreateInspectionHistoryRow({ scopeRowId, category: storedCategory })) {
        await createInspectionHistoryRow(tx, {
          scopeRowId: scopeRowId!,
          inspectionSubmissionId: createdSubmission.id,
          category: storedCategory,
          outcome,
          inspectedById,
          calibratedAgainstClearInspectionId,
        });
      }

      const answerIdByQuestionId = await replaceInspectionAnswers({
        inspectionSubmissionId: createdSubmission.id,
        formVersionId,
        templateSnapshot: templateForNormalization,
        payload,
      }, tx);

      await replaceInspectionDeficiencies({
        inspectionSubmissionId: createdSubmission.id,
        answerIdByQuestionId,
        templateSnapshot: templateForNormalization,
        payload,
      }, tx);

      await persistInspectionAutoAppendix(tx, createdSubmission.id, payload);

      return createdSubmission;
    });
  } catch (error) {
    if (error instanceof ClearInspectionConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 },
      );
    }
    if (error instanceof MissingFormVersionQuestionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.warn("[inspection-submissions] failed to create normalized submission", error);
    throw error;
  }

  const deficiencyMetrics = getInspectionDeficiencyMetrics(payload);

  // Fire-and-forget activity log — never blocks the HTTP response.
  void (async () => {
    try {
      // Fetch unit location and scope name from the scope row (if present).
      const scopeRow = scopeRowId
        ? await db.projectRow.findUnique({
            where: { id: scopeRowId },
            select: {
              building: true,
              level: true,
              unit: true,
              scopeType: { select: { name: true } },
            },
          })
        : null;

      // Count all submissions for this scope+form up to and including this one
      // to derive a 1-based attempt number.
      const attemptNumber = await db.inspectionSubmission.count({
        where: {
          formId,
          ...(scopeRowId ? { scopeRowId } : { unitId }),
        },
      });

      const locationMeta = buildInspectionActivityLocationMetadata({
        scopeRowId: scopeRowId ?? null,
        unitId,
        scopeRow,
        scopeTypeCode,
      });

      voidLogFieldActivity(
        projectId,
        { user: effective.user },
        {
          eventType: "INSPECTION_SUBMITTED",
          submissionId: submission.id,
          formName: form.name,
          category: isCalibration ? "CALIBRATION_INSPECTION" : form.category,
          outcome,
          deficiencyCount,
          failedQuestionCount: deficiencyMetrics.failedQuestionCount,
          totalDeficiencyCount: deficiencyMetrics.totalDeficiencyCount,
          attemptNumber,
          isEdit: false,
          ...locationMeta,
          ...getActivityReplayMetadata(req.headers),
        },
        {
          requestBody: typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null,
        },
      );
    } catch {
      // Silently swallow — logging must never fail the submission.
    }
  })();

  const submissionWithInspector = await db.inspectionSubmission.findUnique({
    where: { id: submission.id },
    include: {
      form: { select: { id: true, name: true } },
      formVersion: { select: { id: true, versionNumber: true } },
      clearInspection: {
        select: {
          inspectedById: true,
          inspectedBy: { select: { id: true, name: true } },
        },
      },
    },
  });

  const enrichedSubmission = submissionWithInspector
    ? attachSubmitterFromSession(submissionWithInspector, effective.user)
    : submission;

  return NextResponse.json({ submission: enrichedSubmission }, { status: 201 });
}
