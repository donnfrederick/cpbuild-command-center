import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  extractInspectionDeficiencies,
  replaceInspectionDeficiencies,
} from "@/lib/inspections/deficiency-extraction";
import {
  extractInspectionAnswers,
  normalizeFormSections,
  replaceInspectionAnswers,
  syncFormReportingStructure,
  syncFormVersionReportingStructure,
} from "@/lib/inspections/reporting-normalization";
import {
  categoryToInspectionTypeCode,
  getInspectionTypeIdByCode,
  resolvedSubmissionCategory,
} from "@/lib/inspections/inspection-type";
import { shouldCreateInspectionHistoryRow } from "@/lib/inspections/inspection-history-sync";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const dryRun = process.argv.includes("--dry-run");
const batchSize = Number(process.env.INSPECTION_BACKFILL_BATCH_SIZE ?? 250);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formVersionIdFromSnapshot(templateSnapshot: unknown): string | null {
  if (!isRecord(templateSnapshot)) return null;
  return typeof templateSnapshot.latestVersionId === "string"
    ? templateSnapshot.latestVersionId
    : null;
}

/** Set formId/formVersionId on legacy FORM submissions before FK constraint migration. */
async function backfillMissingFormVersionIds(): Promise<number> {
  if (dryRun) return 0;

  const missing = await db.inspectionSubmission.findMany({
    where: {
      source: "FORM",
      OR: [{ formVersionId: null }, { formId: null }],
    },
    select: { id: true, formId: true, formVersionId: true, templateSnapshot: true },
  });

  let updated = 0;
  for (const submission of missing) {
    const snapshotFormId = isRecord(submission.templateSnapshot)
      && typeof submission.templateSnapshot.id === "string"
      ? submission.templateSnapshot.id
      : null;
    const formId = submission.formId ?? snapshotFormId;

    let formVersionId = formVersionIdFromSnapshot(submission.templateSnapshot);
    if (!formVersionId && formId) {
      const latest = await db.formVersion.findFirst({
        where: { formId },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });
      formVersionId = latest?.id ?? null;
    }

    const data: { formId?: string; formVersionId?: string } = {};
    if (!submission.formId && formId) data.formId = formId;
    if (!submission.formVersionId && formVersionId) data.formVersionId = formVersionId;
    if (Object.keys(data).length === 0) continue;

    await db.inspectionSubmission.update({
      where: { id: submission.id },
      data,
    });
    updated++;
  }

  if (updated > 0) {
    console.log(
      `[backfill-inspection-deficiencies] backfilled formId/formVersionId on ${updated} submission(s)`
    );
  }
  return updated;
}

/** FORM rows whose form/version was deleted cannot satisfy the FORM version FK — treat as BACKFILL. */
async function reclassifyOrphanedFormSubmissions(): Promise<number> {
  if (dryRun) return 0;

  const missing = await db.inspectionSubmission.findMany({
    where: { source: "FORM", formVersionId: null },
    select: { id: true, formId: true, templateSnapshot: true },
  });

  let reclassified = 0;
  for (const submission of missing) {
    const snapshotFormId = isRecord(submission.templateSnapshot)
      && typeof submission.templateSnapshot.id === "string"
      ? submission.templateSnapshot.id
      : null;
    const formId = submission.formId ?? snapshotFormId;
    let formVersionId = formVersionIdFromSnapshot(submission.templateSnapshot);

    if (!formVersionId && formId) {
      const latest = await db.formVersion.findFirst({
        where: { formId },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });
      formVersionId = latest?.id ?? null;
    }

    if (formVersionId) continue;

    await db.inspectionSubmission.update({
      where: { id: submission.id },
      data: { source: "BACKFILL" },
    });
    reclassified++;
  }

  if (reclassified > 0) {
    console.log(
      `[backfill-inspection-deficiencies] reclassified ${reclassified} orphaned FORM submission(s) to BACKFILL`
    );
  }
  return reclassified;
}

async function main(): Promise<void> {
  const forms = await db.form.findMany({
    select: {
      id: true,
      draftSections: true,
      versions: { select: { id: true, sections: true } },
    },
  });
  let formsScanned = 0;
  let formVersionsScanned = 0;
  let formQuestions = 0;
  let formVersionQuestions = 0;
  let scanned = 0;
  let withAnswers = 0;
  let answers = 0;
  let withDeficiencies = 0;
  let deficiencies = 0;
  let media = 0;
  let clearInspectionRowsCreated = 0;
  let deficienciesWritten = 0;
  let skipped = 0;

  for (const form of forms) {
    formsScanned++;
    try {
      const normalizedFormSections = normalizeFormSections(form.draftSections);
      formQuestions += normalizedFormSections.reduce((sum, section) => sum + section.questions.length, 0);
      if (!dryRun) {
        await syncFormReportingStructure({ formId: form.id, sections: form.draftSections }, db);
      }

      for (const version of form.versions) {
        formVersionsScanned++;
        const normalizedVersionSections = normalizeFormSections(version.sections);
        formVersionQuestions += normalizedVersionSections.reduce(
          (sum, section) => sum + section.questions.length,
          0
        );
        if (!dryRun) {
          await syncFormVersionReportingStructure(
            { formVersionId: version.id, sections: version.sections },
            db
          );
        }
      }
    } catch (error) {
      skipped++;
      console.warn("[backfill-inspection-deficiencies] skipped form", {
        formId: form.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await backfillMissingFormVersionIds();
  await reclassifyOrphanedFormSubmissions();

  let cursor: string | undefined;
  while (true) {
    const submissions = await db.inspectionSubmission.findMany({
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        form: { select: { category: true } },
        clearInspection: { select: { id: true, inspectedById: true } },
      },
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    });
    if (submissions.length === 0) break;

    for (const submission of submissions) {
      scanned++;
      cursor = submission.id;
      try {
        const category = resolvedSubmissionCategory(
          submission.templateSnapshot,
          submission.form?.category
        );
        let clearInspectionId = submission.clearInspection?.id ?? null;
        const shouldLinkClearInspection = shouldCreateInspectionHistoryRow({
          scopeRowId: submission.scopeRowId,
          category,
        });

        const answerPreview = extractInspectionAnswers({
          inspectionSubmissionId: submission.id,
          formVersionId: submission.formVersionId,
          templateSnapshot: submission.templateSnapshot,
          payload: submission.payload,
        });
        const preview = extractInspectionDeficiencies({
          inspectionSubmissionId: submission.id,
          templateSnapshot: submission.templateSnapshot,
          payload: submission.payload,
        });

        if (answerPreview.length === 0 && preview.length === 0 && !shouldLinkClearInspection) continue;
        if (answerPreview.length > 0) withAnswers++;
        if (preview.length > 0) withDeficiencies++;
        answers += answerPreview.length;
        deficiencies += preview.length;
        media += preview.reduce((sum, deficiency) => sum + deficiency.media.length, 0);

        if (dryRun) continue;

        if (shouldLinkClearInspection) {
          const status = submission.outcome === "FAIL" ? "FAILED" : "PASSED";
          const inspectionTypeId = await getInspectionTypeIdByCode(
            db,
            categoryToInspectionTypeCode(category)
          );
          const clearInspection = await db.clearInspection.upsert({
            where: { inspectionSubmissionId: submission.id },
            create: {
              rowId: submission.scopeRowId as string,
              status,
              inspectionSubmissionId: submission.id,
              inspectionTypeId,
              inspectedById: submission.clearInspection?.inspectedById ?? null,
            },
            update: {
              status,
              deletedAt: null,
              inspectionTypeId,
              inspectedById: submission.clearInspection?.inspectedById ?? null,
            },
            select: { id: true },
          });
          if (!clearInspectionId) clearInspectionRowsCreated++;
          clearInspectionId = clearInspection.id;
        }

        const answerIdByQuestionId = await replaceInspectionAnswers(
          {
            inspectionSubmissionId: submission.id,
            formVersionId: submission.formVersionId,
            templateSnapshot: submission.templateSnapshot,
            payload: submission.payload,
          },
          db
        );

        await replaceInspectionDeficiencies(
          {
            inspectionSubmissionId: submission.id,
            answerIdByQuestionId,
            templateSnapshot: submission.templateSnapshot,
            payload: submission.payload,
          },
          db
        ).then((count) => {
          deficienciesWritten += count;
        });
      } catch (error) {
        skipped++;
        console.warn("[backfill-inspection-deficiencies] skipped submission", {
          submissionId: submission.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (submissions.length < batchSize) break;
  }

  console.log("[backfill-inspection-deficiencies] complete", {
    dryRun,
    formsScanned,
    formVersionsScanned,
    formQuestions,
    formVersionQuestions,
    scanned,
    withAnswers,
    answers,
    withDeficiencies,
    deficiencies,
    media,
    clearInspectionRowsCreated,
    deficienciesWritten,
    skipped,
  });
}

main()
  .catch((error) => {
    console.error("[backfill-inspection-deficiencies] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
