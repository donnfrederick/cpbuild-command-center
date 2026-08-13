import type { InspectionCategory } from "@/components/forms/formTypes";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import { isScopeInspectionStatusCategory } from "@/lib/inspections/inspection-type-codes";
import type { InspectionStatus, ScopeTileInspectionCategory } from "@/lib/scope-square-style";
import {
  latestScopeInspectionStatusSubmission,
  scopeInspectionStatusFromSubmission,
  inspectionSubmissionStatusCategory,
  submissionAuthoritativeForScopeInspectionStatus,
  isCalibrationSubmission,
  deriveLatestCalibrationOutcome,
} from "@/lib/inspections/scope-inspection-display";

/** Local-only scope row fields updated after submit/backfill — no API PATCH (server syncs DB). */
export type ScopeGridInspectionLocalUpdates = Partial<ScopeGridInspectionDerived> & {
  gridInspectionStatus?: InspectionStatus | null;
  latestInspectionCategory?: ScopeGridInspectionDerived["latestInspectionCategory"] | null;
  inspectionStatus?: InspectionStatus | null;
};

/** Optimistic parent state after a form submission; avoids duplicate SCOPE_INSPECTION_UPDATED logs. */
export function localScopeUpdatesFromSubmission(
  sub: InspectionSubmission,
): ScopeGridInspectionLocalUpdates | null {
  if (!submissionAuthoritativeForScopeInspectionStatus(sub)) return null;
  const status = scopeInspectionStatusFromSubmission(sub);
  return {
    gridInspectionStatus: status,
    latestInspectionCategory: submissionToGridInspectionCategory(sub),
    inspectionStatus: status,
  };
}

export function localScopeUpdatesFromBackfillOutcome(
  outcome: "PASS" | "FAIL",
): ScopeGridInspectionLocalUpdates {
  const status: InspectionStatus = outcome === "FAIL" ? "FAILED" : "PASSED";
  return {
    gridInspectionStatus: status,
    latestInspectionCategory: "BACKFILL",
    inspectionStatus: status,
  };
}

export function clearLocalScopeInspectionUpdates(): ScopeGridInspectionLocalUpdates {
  return {
    gridInspectionStatus: null,
    latestInspectionCategory: null,
    inspectionStatus: null,
  };
}

export interface ScopeGridInspectionDerived {
  /** Drives grid shield tiles — from latest authoritative submission, not DB-only. */
  gridInspectionStatus: InspectionStatus;
  latestInspectionCategory: ScopeTileInspectionCategory;
}

export function submissionToGridInspectionCategory(
  sub: InspectionSubmission,
): ScopeTileInspectionCategory {
  if (sub.source === "BACKFILL") return "BACKFILL";
  return inspectionSubmissionStatusCategory(sub) as InspectionCategory;
}

/** Derive grid tile inspection display from newest-first submissions for one scope. */
export function deriveScopeGridInspectionFromSubmissions(
  submissions: InspectionSubmission[],
): ScopeGridInspectionDerived | null {
  const latest = latestScopeInspectionStatusSubmission(submissions);
  if (!latest) return null;
  return {
    gridInspectionStatus: scopeInspectionStatusFromSubmission(latest),
    latestInspectionCategory: submissionToGridInspectionCategory(latest),
  };
}

export type ScopeGridSubmissionRow = {
  scopeRowId: string | null;
  outcome: InspectionSubmission["outcome"];
  source: InspectionSubmission["source"];
  category: string | null | undefined;
};

function rowAuthoritativeForGrid(row: ScopeGridSubmissionRow): boolean {
  if (row.source === "BACKFILL") return true;
  if (!row.category || row.category === "CALIBRATION_INSPECTION") return false;
  return isScopeInspectionStatusCategory(row.category);
}

/**
 * Build grid inspection display per scope from submission rows sorted newest-first.
 */
export function buildScopeGridInspectionMapFromSortedRows(
  rows: ScopeGridSubmissionRow[],
): Map<string, ScopeGridInspectionDerived> {
  const result = new Map<string, ScopeGridInspectionDerived>();
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.scopeRowId || seen.has(row.scopeRowId)) continue;
    if (!rowAuthoritativeForGrid(row)) continue;
    seen.add(row.scopeRowId);
    result.set(row.scopeRowId, {
      gridInspectionStatus: row.outcome === "FAIL" ? "FAILED" : "PASSED",
      latestInspectionCategory:
        row.source === "BACKFILL"
          ? "BACKFILL"
          : (row.category as InspectionCategory),
    });
  }

  return result;
}

/** @deprecated Use buildScopeGridInspectionMapFromSortedRows */
export function buildScopeGridInspectionMap(
  rows: ScopeGridSubmissionRow[],
): Map<string, ScopeGridInspectionDerived> {
  return buildScopeGridInspectionMapFromSortedRows(rows);
}

export function submissionRowAuthoritativeForGrid(row: ScopeGridSubmissionRow): boolean {
  return rowAuthoritativeForGrid(row);
}

function buildLatestCalibrationOutcomeMap(
  submissions: InspectionSubmission[],
): Map<string, "PASS" | "FAIL"> {
  const byScope = new Map<string, InspectionSubmission[]>();
  for (const sub of submissions) {
    if (!sub.scopeRowId || !isCalibrationSubmission(sub)) continue;
    const list = byScope.get(sub.scopeRowId) ?? [];
    list.push(sub);
    byScope.set(sub.scopeRowId, list);
  }

  const result = new Map<string, "PASS" | "FAIL">();
  for (const [scopeRowId, scopeSubs] of byScope) {
    const sorted = [...scopeSubs].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
    const outcome = deriveLatestCalibrationOutcome(sorted);
    if (outcome) result.set(scopeRowId, outcome);
  }
  return result;
}

/** Merge submission-derived grid shields onto unit rows (same logic as the location modal). */
export function mergeGridInspectionFromSubmissions<
  T extends {
    id: string;
    gridInspectionStatus?: InspectionStatus | null;
    latestInspectionCategory?: ScopeTileInspectionCategory | null;
    latestCalibrationOutcome?: "PASS" | "FAIL" | null;
  },
>(rows: T[], submissions: InspectionSubmission[]): T[] {
  if (submissions.length === 0) return rows;

  const sorted = [...submissions].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
  const map = buildScopeGridInspectionMapFromSortedRows(
    sorted
      .filter((s): s is InspectionSubmission & { scopeRowId: string } => Boolean(s.scopeRowId))
      .map((s) => ({
        scopeRowId: s.scopeRowId,
        outcome: s.outcome === "FAIL" ? ("FAIL" as const) : ("PASS" as const),
        source: s.source,
        category: inspectionSubmissionStatusCategory(s),
      })),
  );
  const calibrationMap = buildLatestCalibrationOutcomeMap(sorted);
  if (map.size === 0 && calibrationMap.size === 0) return rows;

  return rows.map((row) => {
    const derived = map.get(row.id);
    const latestCalibrationOutcome = calibrationMap.get(row.id) ?? null;
    if (!derived && latestCalibrationOutcome == null) return row;
    return {
      ...row,
      ...(derived
        ? {
            gridInspectionStatus: derived.gridInspectionStatus,
            latestInspectionCategory: derived.latestInspectionCategory,
          }
        : {}),
      ...(latestCalibrationOutcome != null ? { latestCalibrationOutcome } : {}),
    };
  });
}
