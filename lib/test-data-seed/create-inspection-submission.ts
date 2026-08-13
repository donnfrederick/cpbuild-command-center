import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { FormTemplate, InspectionCategory } from "@/components/forms/formTypes";
import { replaceInspectionDeficiencies } from "@/lib/inspections/deficiency-extraction";
import {
  buildInspectionCategoryStub,
  INSPECTION_JSON_STUB,
  replaceInspectionAnswers,
} from "@/lib/inspections/reporting-normalization";
import { countFormVersionQuestions } from "@/lib/inspections/form-reporting-structure";
import type { InspectionOutcome } from "@/lib/inspections/submissionsApi";
import { buildSeedInspectionPayload } from "./build-seed-inspection-payload";
import type { SeedMediaContext } from "./media-pool";
import type { PublishedClearForm } from "./resolve-published-clear-forms";
import type { ScopeRowCandidate } from "./pick-rows";
import {
  categoryToInspectionTypeCode,
  getInspectionTypeIdByCode,
} from "@/lib/inspections/inspection-type";
import { shouldCreateInspectionHistoryRow } from "@/lib/inspections/inspection-history-sync";

type PrismaWriteClient = typeof db | Prisma.TransactionClient;

export interface CreateSeededInspectionParams {
  projectId: string;
  batchId: string;
  row: ScopeRowCandidate;
  form: PublishedClearForm;
  outcome: InspectionOutcome;
  submittedAt: Date;
  submitterId: string;
  submitterName: string;
  seedPrefix: string;
  /** When set, overrides the form's category in the stored category stub. */
  categoryOverride?: InspectionCategory;
  /** When true, syncs scope inspectionStatus and creates a ClearInspection row. */
  syncClearInspection?: boolean;
  /** When seeding a calibration, link to the clear_inspection being reviewed. */
  calibratedAgainstClearInspectionId?: string;
  media: SeedMediaContext;
}

function storedCategory(
  form: PublishedClearForm,
  categoryOverride?: InspectionCategory
): InspectionCategory {
  return categoryOverride ?? form.template.category;
}

export async function createSeededInspectionSubmission(
  params: CreateSeededInspectionParams,
  client: PrismaWriteClient = db
): Promise<string> {
  const template = params.form.template;
  const category = storedCategory(params.form, params.categoryOverride);

  const versionQuestionCount = await countFormVersionQuestions(params.form.formVersionId, client);
  if (versionQuestionCount === 0) {
    throw new Error(
      `Form version ${params.form.formVersionId} has no relational question rows — publish the form before seeding.`
    );
  }

  const { payload, deficiencyCount } = buildSeedInspectionPayload(
    template,
    params.outcome,
    params.seedPrefix,
    params.media
  );

  const run = async (tx: Prisma.TransactionClient) => {
    if (params.syncClearInspection) {
      const inspectionStatus = params.outcome === "FAIL" ? "FAILED" : "PASSED";
      await tx.projectRow.update({
        where: { id: params.row.id },
        data: { inspectionStatus },
      });
    }

    const submission = await tx.inspectionSubmission.create({
      data: {
        source: "FORM",
        formId: params.form.formId,
        formVersionId: params.form.formVersionId,
        templateSnapshot: buildInspectionCategoryStub(category),
        payload: INSPECTION_JSON_STUB,
        projectId: params.projectId,
        unitId: params.row.id,
        scopeRowId: params.row.id,
        scopeTypeCode: params.row.scopeTypeCode,
        outcome: params.outcome,
        deficiencyCount,
        testSeedBatchId: params.batchId,
        submittedAt: params.submittedAt,
      },
    });

    if (params.syncClearInspection && shouldCreateInspectionHistoryRow({ scopeRowId: params.row.id, category })) {
      const inspectionStatus = params.outcome === "FAIL" ? "FAILED" : "PASSED";
      const inspectionTypeId = await getInspectionTypeIdByCode(tx, categoryToInspectionTypeCode(category));
      await tx.clearInspection.create({
        data: {
          rowId: params.row.id,
          status: inspectionStatus,
          inspectionSubmissionId: submission.id,
          inspectionTypeId,
          inspectedById: params.submitterId,
          testSeedBatchId: params.batchId,
          createdAt: params.submittedAt,
          updatedAt: params.submittedAt,
          ...(params.calibratedAgainstClearInspectionId
            ? { calibratedAgainstClearInspectionId: params.calibratedAgainstClearInspectionId }
            : {}),
        },
      });
    }

    const answerIdByQuestionId = await replaceInspectionAnswers(
      {
        inspectionSubmissionId: submission.id,
        formVersionId: params.form.formVersionId,
        templateSnapshot: template,
        payload,
      },
      tx
    );

    await replaceInspectionDeficiencies(
      {
        inspectionSubmissionId: submission.id,
        answerIdByQuestionId,
        templateSnapshot: template,
        payload,
      },
      tx
    );

    return submission.id;
  };

  if ("$transaction" in client) {
    return client.$transaction(run);
  }
  return run(client);
}
