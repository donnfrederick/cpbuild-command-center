import { db } from "@/lib/db";
import { planCalibrationOutcomesForBatch } from "./plan-clear-attempts";
import { createSeededInspectionSubmission } from "./create-inspection-submission";
import { DEFAULT_PASSED_RATIO } from "./constants";
import { pickOne } from "./random";
import { findLatestClearInspectionIdForScope } from "@/lib/inspections/calibration-target";
import {
  scopeCodeFromScopeType,
  loadPublishedClearFormForSubmission,
  type PublishedClearForm,
} from "./resolve-published-clear-forms";
import type { ScopeRowCandidate } from "./pick-rows";
import type { SeedMediaContext } from "./media-pool";

export interface ClearInspectionReference {
  row: ScopeRowCandidate;
  form: PublishedClearForm;
  latestSubmittedAt: Date;
}

/** Scopes with at least one non-calibration clear inspection submission. */
export async function loadClearInspectionReferences(
  projectId: string
): Promise<ClearInspectionReference[]> {
  const submissions = await db.inspectionSubmission.findMany({
    where: {
      projectId,
      scopeRowId: { not: null },
      source: "FORM",
      formId: { not: null },
      formVersionId: { not: null },
    },
    orderBy: { submittedAt: "desc" },
    include: {
      form: { select: { category: true } },
    },
  });

  const candidates: Array<{
    scopeRowId: string;
    form: PublishedClearForm;
    latestSubmittedAt: Date;
  }> = [];
  const seenScopeIds = new Set<string>();

  for (const submission of submissions) {
    const scopeRowId = submission.scopeRowId;
    if (!scopeRowId || seenScopeIds.has(scopeRowId)) continue;
    if (!submission.formId || !submission.formVersionId) continue;

    const raw = submission.templateSnapshot;
    const catFromStub =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? ((raw as Record<string, unknown>).category as string | undefined)
        : undefined;
    const category = catFromStub ?? submission.form?.category ?? null;
    if (category === "CALIBRATION_INSPECTION") continue;
    if (category && category !== "CLEAR_INSPECTION") continue;

    const form = await loadPublishedClearFormForSubmission({
      formId: submission.formId,
      formVersionId: submission.formVersionId,
    });
    if (!form) continue;

    seenScopeIds.add(scopeRowId);
    candidates.push({
      scopeRowId,
      form,
      latestSubmittedAt: submission.submittedAt,
    });
  }

  if (candidates.length === 0) return [];

  const rows = await db.projectRow.findMany({
    where: { id: { in: candidates.map((candidate) => candidate.scopeRowId) } },
    select: {
      id: true,
      building: true,
      level: true,
      unit: true,
      scopeType: {
        select: {
          code: true,
          canonicalScopeType: { select: { code: true } },
        },
      },
    },
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const references: ClearInspectionReference[] = [];
  for (const candidate of candidates) {
    const row = rowById.get(candidate.scopeRowId);
    if (!row) continue;

    references.push({
      row: {
        id: row.id,
        building: row.building,
        level: row.level,
        unit: row.unit,
        scopeTypeCode: scopeCodeFromScopeType(row.scopeType),
      },
      form: candidate.form,
      latestSubmittedAt: candidate.latestSubmittedAt,
    });
  }

  return references;
}

export interface SeedCalibrationsContext {
  projectId: string;
  batchId: string;
  count: number;
  passedRatio: number;
  dateRangeDays: number;
  userIds: string[];
  userNames: Map<string, string>;
  rng: () => number;
  media: SeedMediaContext;
}

export async function seedCalibrations(ctx: SeedCalibrationsContext): Promise<number> {
  if (ctx.count <= 0) return 0;

  const references = await loadClearInspectionReferences(ctx.projectId);
  if (references.length === 0) return 0;

  let created = 0;

  const calibrationOutcomes = planCalibrationOutcomesForBatch(ctx.count, ctx.passedRatio, ctx.rng);

  for (let i = 0; i < ctx.count; i++) {
    const reference = pickOne(references, ctx.rng);
    const outcome = calibrationOutcomes[i] ?? "PASS";
    const submitterId = pickOne(ctx.userIds, ctx.rng);
    const submitterName = ctx.userNames.get(submitterId) ?? "Test Seeder";

    const minMs = reference.latestSubmittedAt.getTime() + 86400000;
    const maxMs = Date.now();
    const submittedAt =
      minMs >= maxMs
        ? new Date(reference.latestSubmittedAt.getTime() + 3600000)
        : new Date(minMs + ctx.rng() * (maxMs - minMs));

    if (submittedAt.getTime() > Date.now()) {
      submittedAt.setTime(Date.now() - ctx.rng() * ctx.dateRangeDays * 86400000);
    }

    const calibratedAgainstClearInspectionId = await findLatestClearInspectionIdForScope(
      db,
      reference.row.id,
      submittedAt,
    );
    if (!calibratedAgainstClearInspectionId) continue;

    await createSeededInspectionSubmission({
      projectId: ctx.projectId,
      batchId: ctx.batchId,
      row: reference.row,
      form: reference.form,
      outcome,
      submittedAt,
      submitterId,
      submitterName,
      seedPrefix: `${reference.row.id}-cal-${i}`,
      categoryOverride: "CALIBRATION_INSPECTION",
      syncClearInspection: true,
      calibratedAgainstClearInspectionId,
      media: ctx.media,
    });

    created++;
  }

  return created;
}

export function defaultCalibrationPassedRatio(passedRatio?: number): number {
  return passedRatio ?? DEFAULT_PASSED_RATIO;
}
