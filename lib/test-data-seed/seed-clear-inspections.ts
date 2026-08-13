import { pickOne, randomDateInRange } from "./random";
import { createSeededInspectionSubmission } from "./create-inspection-submission";
import { planClearInspectionOutcomesForBatch } from "./plan-clear-attempts";
import { DEFAULT_PASSED_RATIO } from "./constants";
import { pickClearFormForRow, type ScopeRowCandidate } from "./pick-rows";
import type { PublishedClearForm } from "./resolve-published-clear-forms";
import type { SeedMediaContext } from "./media-pool";

export interface SeedClearInspectionsContext {
  projectId: string;
  batchId: string;
  rows: ScopeRowCandidate[];
  publishedForms: PublishedClearForm[];
  passedRatio: number;
  dateRangeDays: number;
  userIds: string[];
  userNames: Map<string, string>;
  rng: () => number;
  media: SeedMediaContext;
}

export interface SeedClearInspectionsResult {
  /** Scope rows that received clear inspection history. */
  scopesSeeded: number;
  /** Total FORM clear-inspection submissions created (includes retries). */
  submissionsCreated: number;
}

function attemptDates(
  attemptCount: number,
  dateRangeDays: number,
  rng: () => number
): Date[] {
  if (attemptCount <= 1) {
    return [randomDateInRange(dateRangeDays, rng)];
  }

  const end = Date.now() - rng() * dateRangeDays * 86400000;
  const spacingMs = (1 + Math.floor(rng() * 2)) * 86400000;
  const start = end - spacingMs * (attemptCount - 1);
  return Array.from({ length: attemptCount }, (_, i) => new Date(start + i * spacingMs));
}

export async function seedClearInspections(
  ctx: SeedClearInspectionsContext
): Promise<SeedClearInspectionsResult> {
  let scopesSeeded = 0;
  let submissionsCreated = 0;

  const outcomePlans = planClearInspectionOutcomesForBatch(ctx.rows.length, ctx.passedRatio, ctx.rng);

  for (let rowIndex = 0; rowIndex < ctx.rows.length; rowIndex++) {
    const row = ctx.rows[rowIndex]!;
    const form = pickClearFormForRow(ctx.publishedForms, row, ctx.rng);
    if (!form) continue;

    const outcomes = outcomePlans[rowIndex] ?? ["PASS"];
    const dates = attemptDates(outcomes.length, ctx.dateRangeDays, ctx.rng);

    for (let attempt = 0; attempt < outcomes.length; attempt++) {
      const outcome = outcomes[attempt]!;
      const submittedAt = dates[attempt]!;
      const submitterId = pickOne(ctx.userIds, ctx.rng);
      const submitterName = ctx.userNames.get(submitterId) ?? "Test Seeder";

      await createSeededInspectionSubmission({
        projectId: ctx.projectId,
        batchId: ctx.batchId,
        row,
        form,
        outcome,
        submittedAt,
        submitterId,
        submitterName,
        seedPrefix: `${row.id}-attempt${attempt}`,
        syncClearInspection: true,
        media: ctx.media,
      });

      submissionsCreated++;
    }

    scopesSeeded++;
  }

  return { scopesSeeded, submissionsCreated };
}

export function defaultPassedRatio(passedRatio?: number): number {
  return passedRatio ?? DEFAULT_PASSED_RATIO;
}
