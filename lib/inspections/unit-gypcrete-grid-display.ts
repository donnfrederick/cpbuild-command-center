import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import {
  inspectionSubmissionStatusCategory,
  scopeInspectionStatusFromSubmission,
} from "@/lib/inspections/scope-inspection-display";
import { unitHasFlooringScope } from "@/lib/inspections/flooring-scope-eligibility";
import type { InspectionStatus } from "@/lib/scope-square-style";

/** Card field: undefined = hide droplet (no flooring scope); null = not performed yet. */
export type UnitGypcreteGridStatus = InspectionStatus | null | undefined;

export interface UnitCardGypcreteTarget {
  key: string;
  scopes: Parameters<typeof unitHasFlooringScope>[0];
  gypcreteInspectionStatus?: UnitGypcreteGridStatus;
}

/** Newest unit-level Gypcrete submission for a location ref (building|level|unit). */
export function latestUnitGypcreteSubmission(
  submissions: InspectionSubmission[],
  unitRef: string,
): InspectionSubmission | null {
  const sorted = [...submissions].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );

  for (const sub of sorted) {
    if (sub.scopeRowId) continue;
    if (sub.unitId !== unitRef) continue;
    if (inspectionSubmissionStatusCategory(sub) !== "GYPCRETE_MOISTURE_TEST") continue;
    return sub;
  }

  return null;
}

export function deriveUnitGypcreteGridStatus(
  submissions: InspectionSubmission[],
  unitRef: string,
): InspectionStatus | null {
  const latest = latestUnitGypcreteSubmission(submissions, unitRef);
  if (!latest) return null;
  return scopeInspectionStatusFromSubmission(latest);
}

/** Precompute newest unit-level Gypcrete status per location ref (building|level|unit). */
export function buildUnitGypcreteStatusMap(
  submissions: InspectionSubmission[],
): Map<string, InspectionStatus> {
  const sorted = [...submissions].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
  const map = new Map<string, InspectionStatus>();
  for (const sub of sorted) {
    if (sub.scopeRowId) continue;
    if (inspectionSubmissionStatusCategory(sub) !== "GYPCRETE_MOISTURE_TEST") continue;
    if (!map.has(sub.unitId)) {
      map.set(sub.unitId, scopeInspectionStatusFromSubmission(sub));
    }
  }
  return map;
}

/** Attach gypcrete droplet status to location cards for grid view. */
export function mergeUnitGypcreteOntoCards<T extends UnitCardGypcreteTarget>(
  cards: T[],
  submissions: InspectionSubmission[],
): T[] {
  const statusByUnit = buildUnitGypcreteStatusMap(submissions);
  return cards.map((card) => {
    if (!unitHasFlooringScope(card.scopes)) {
      return { ...card, gypcreteInspectionStatus: undefined };
    }
    const status = statusByUnit.get(card.key) ?? null;
    return { ...card, gypcreteInspectionStatus: status };
  });
}

/** Fill color for the grid droplet — bright enough to read at 12px (passed tile bg is too dark). */
export function gypcreteGridDropletFillColor(status: UnitGypcreteGridStatus): string {
  if (status === "PASSED") return "var(--green-500)";
  if (status === "FAILED") return "var(--scope-tile-failed-bg)";
  return "var(--neutral-400)";
}
