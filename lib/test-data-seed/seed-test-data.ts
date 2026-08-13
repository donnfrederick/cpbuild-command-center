import { db } from "@/lib/db";
import { logActivity, resolveActorName } from "@/lib/activity-logger";
import {
  DEFAULT_DATE_RANGE_DAYS,
  MAX_SEED_CALIBRATIONS,
  MAX_SEED_CLEAR_INSPECTIONS,
  MAX_SEED_ISSUES,
  MAX_SEED_OBSERVATIONS,
  type SeedCounts,
  type SeedTestDataInput,
  type SeedTestDataResult,
} from "./constants";
import { TestSeedValidationError } from "./guards";
import { createRng } from "./random";
import { pickAndPromoteClearInspectionRows, pickRandomScopeRows } from "./pick-rows";
import { loadPublishedClearInspectionForms } from "./resolve-published-clear-forms";
import { removeTestSeedBatch } from "./remove-batch";
import { defaultIssueRatios, seedIssues } from "./seed-issues";
import { defaultMediaRatio, seedObservations } from "./seed-observations";
import { defaultPassedRatio, seedClearInspections } from "./seed-clear-inspections";
import { defaultCalibrationPassedRatio, seedCalibrations } from "./seed-calibrations";
import { seedActivityLogs } from "./seed-activity";
import { resolveSeedMediaPool } from "./media-pool";

function validateCounts(input: SeedTestDataInput): void {
  const issueCount = input.issues?.count ?? 0;
  const obsCount = input.observations?.count ?? 0;
  const clearCount = input.clearInspections?.count ?? 0;
  const calibrationCount = input.calibrations?.count ?? 0;

  if (issueCount > MAX_SEED_ISSUES) {
    throw new TestSeedValidationError(`Issue count exceeds maximum of ${MAX_SEED_ISSUES}`);
  }
  if (obsCount > MAX_SEED_OBSERVATIONS) {
    throw new TestSeedValidationError(`Observation count exceeds maximum of ${MAX_SEED_OBSERVATIONS}`);
  }
  if (clearCount > MAX_SEED_CLEAR_INSPECTIONS) {
    throw new TestSeedValidationError(
      `Clear inspection count exceeds maximum of ${MAX_SEED_CLEAR_INSPECTIONS}`
    );
  }
  if (calibrationCount > MAX_SEED_CALIBRATIONS) {
    throw new TestSeedValidationError(
      `Calibration count exceeds maximum of ${MAX_SEED_CALIBRATIONS}`
    );
  }
  if (issueCount + obsCount + clearCount + calibrationCount === 0) {
    throw new TestSeedValidationError("At least one entity count must be greater than zero");
  }
}

function formatSeedSkippedReason(
  skippedClear: number,
  skippedNoPublishedForm: number,
  skippedCalibrations: number
): string {
  const parts: string[] = [];
  if (skippedClear > 0) {
    parts.push("Rows with existing ClearInspection or InspectionSubmission history were skipped");
  }
  if (skippedNoPublishedForm > 0) {
    parts.push("Scopes without a published clear inspection form were skipped");
  }
  if (skippedCalibrations > 0) {
    parts.push("Some calibration slots could not be created (no scopes with existing clear inspection history)");
  }
  return parts.join("; ");
}

export async function seedTestData(
  projectId: string,
  adminUserId: string,
  input: SeedTestDataInput
): Promise<SeedTestDataResult> {
  validateCounts(input);

  const rng = createRng(input.randomSeed);
  const dateRangeDays = input.dateRangeDays ?? DEFAULT_DATE_RANGE_DAYS;
  const issueCount = input.issues?.count ?? 0;
  const obsCount = input.observations?.count ?? 0;
  const clearCount = input.clearInspections?.count ?? 0;
  const calibrationCount = input.calibrations?.count ?? 0;
  const issueRatios = defaultIssueRatios(input.issues?.resolvedRatio, input.issues?.commentRatio);
  const mediaRatio = defaultMediaRatio(input.observations?.withMediaRatio);
  const passedRatio = defaultPassedRatio(input.clearInspections?.passedRatio);
  const calibrationPassedRatio = defaultCalibrationPassedRatio(input.calibrations?.passedRatio);

  const users = await db.user.findMany({
    where: { id: { in: input.userIds }, status: "ACTIVE" },
    select: { id: true, name: true, email: true },
  });
  const userNames = new Map(users.map((u) => [u.id, u.name ?? u.email ?? "User"]));

  const batch = await db.testSeedBatch.create({
    data: {
      projectId,
      createdById: adminUserId,
      config: input as object,
      counts: {
        issues: 0,
        observations: 0,
        clearInspections: 0,
        calibrations: 0,
        comments: 0,
        activityLogs: 0,
      },
    },
  });

  const warnings: string[] = [];
  let skippedClear = 0;
  let skippedNoPublishedForm = 0;
  let skippedCalibrations = 0;

  try {
    const seedMedia = await resolveSeedMediaPool(projectId);

    const scopeRowsForIssues =
      issueCount > 0 ? await pickRandomScopeRows(projectId, issueCount, rng) : [];
    const scopeRowsForObs =
      obsCount > 0 ? await pickRandomScopeRows(projectId, obsCount, rng) : [];

    const issueResult =
      issueCount > 0
        ? await seedIssues({
            projectId,
            batchId: batch.id,
            count: issueCount,
            resolvedRatio: issueRatios.resolvedRatio,
            commentRatio: issueRatios.commentRatio,
            dateRangeDays,
            userIds: input.userIds,
            userNames,
            rng,
            rows: scopeRowsForIssues,
            media: seedMedia,
          })
        : { issues: 0, comments: 0 };

    const observationCount =
      obsCount > 0
        ? await seedObservations({
            projectId,
            batchId: batch.id,
            count: obsCount,
            withMediaRatio: mediaRatio,
            dateRangeDays,
            userIds: input.userIds,
            rng,
            rows: scopeRowsForObs,
            media: seedMedia,
          })
        : 0;

    let clearInspectionCount = 0;
    if (clearCount > 0) {
      const publishedClearForms = await loadPublishedClearInspectionForms();
      if (publishedClearForms.length === 0) {
        warnings.push(
          "No published CLEAR_INSPECTION forms found — clear inspection seeding was skipped"
        );
      } else {
        const { selected, skippedExistingHistory, skippedNoPublishedForm: skippedNoForm } =
          await pickAndPromoteClearInspectionRows(projectId, clearCount, rng, publishedClearForms);
        skippedClear = skippedExistingHistory;
        skippedNoPublishedForm = skippedNoForm;
        if (skippedNoForm > 0) {
          warnings.push(
            `${skippedNoForm} scope row(s) skipped — no published clear inspection form matches their scope type`
          );
        }
        if (selected.length < clearCount) {
          warnings.push(
            `Requested ${clearCount} clear inspection scopes but only ${selected.length} eligible scope rows were available`
          );
        }
        if (selected.length > 0) {
          const clearResult = await seedClearInspections({
            projectId,
            batchId: batch.id,
            rows: selected,
            publishedForms: publishedClearForms,
            passedRatio,
            dateRangeDays,
            userIds: input.userIds,
            userNames,
            rng,
            media: seedMedia,
          });
          clearInspectionCount = clearResult.scopesSeeded;
          if (clearResult.submissionsCreated > clearResult.scopesSeeded) {
            warnings.push(
              `Created ${clearResult.submissionsCreated} clear inspection submissions across ${clearResult.scopesSeeded} scopes (includes failed retries)`
            );
          }
        }
      }
    }

    let calibrationsCreated = 0;
    if (calibrationCount > 0) {
      calibrationsCreated = await seedCalibrations({
        projectId,
        batchId: batch.id,
        count: calibrationCount,
        passedRatio: calibrationPassedRatio,
        dateRangeDays,
        userIds: input.userIds,
        userNames,
        rng,
        media: seedMedia,
      });
      if (calibrationsCreated < calibrationCount) {
        skippedCalibrations = calibrationCount - calibrationsCreated;
        warnings.push(
          `Requested ${calibrationCount} calibrations but only ${calibrationsCreated} were created — scopes need an existing passed or failed clear inspection`
        );
      }
    }

    const counts: SeedCounts = {
      issues: issueResult.issues,
      observations: observationCount,
      clearInspections: clearInspectionCount,
      calibrations: calibrationsCreated,
      comments: issueResult.comments,
      activityLogs: 0,
    };

    counts.activityLogs = await seedActivityLogs({
      projectId,
      batchId: batch.id,
      counts,
      dateRangeDays,
      userIds: input.userIds,
      userNames,
      rng,
    });

    await db.testSeedBatch.update({
      where: { id: batch.id },
      data: { counts: counts as object },
    });

    const actorName = await resolveActorName(adminUserId);
    await logActivity(projectId, adminUserId, actorName, {
      eventType: "PROJECT_TEST_DATA_SEEDED",
      batchId: batch.id,
      counts,
      configSummary: {
        issues: issueCount,
        observations: obsCount,
        clearInspections: clearCount,
        calibrations: calibrationCount,
        dateRangeDays,
        userCount: input.userIds.length,
      },
    });

    const hasSkipped =
      skippedClear > 0 || skippedNoPublishedForm > 0 || skippedCalibrations > 0;

    return {
      batchId: batch.id,
      counts,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(hasSkipped
        ? {
            skipped: {
              clearInspections: skippedClear,
              reason: formatSeedSkippedReason(
                skippedClear,
                skippedNoPublishedForm,
                skippedCalibrations
              ),
              ...(skippedNoPublishedForm > 0 ? { noPublishedForm: skippedNoPublishedForm } : {}),
              ...(skippedCalibrations > 0
                ? {
                    calibrations: skippedCalibrations,
                    calibrationsReason:
                      "No scopes with an existing passed or failed clear inspection were available",
                  }
                : {}),
            },
          }
        : {}),
    };
  } catch (err) {
    await removeTestSeedBatch(batch.id).catch(() => undefined);
    throw err;
  }
}

export async function removeTestDataBatch(
  projectId: string,
  batchId: string,
  adminUserId: string
): Promise<SeedCounts> {
  const batch = await db.testSeedBatch.findFirst({
    where: { id: batchId, projectId },
    select: { counts: true },
  });

  if (!batch) {
    throw new TestSeedValidationError("Batch not found on this project");
  }

  const counts = (batch.counts ?? {}) as unknown as SeedCounts;
  await removeTestSeedBatch(batchId);

  const actorName = await resolveActorName(adminUserId);
  await logActivity(projectId, adminUserId, actorName, {
    eventType: "PROJECT_TEST_DATA_BATCH_REMOVED",
    batchId,
    counts,
  });

  return counts;
}
