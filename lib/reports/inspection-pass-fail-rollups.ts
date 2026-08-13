import type { GlobalInspectionSubmissionRow } from "@/lib/inspections/fetch-global-inspections-report";
import {
  personFilterOptionLabel,
  submissionIMName,
  submissionInstallerName,
  submissionPMName,
} from "@/lib/inspections/inspection-report-filters";

export type InspectionPassFailDimension = "im" | "pm" | "subcontractor" | "project";

export interface InspectionPassFailRow {
  id: string;
  name: string;
  passed: number;
  failed: number;
  total: number;
  passRate: number | null;
}

export function isScoredInspectionSubmission(
  submission: Pick<GlobalInspectionSubmissionRow, "isCalibration" | "outcome">
): boolean {
  if (submission.isCalibration) return false;
  return submission.outcome === "PASS" || submission.outcome === "FAIL";
}

export function getPassFailGroupKey(
  submission: GlobalInspectionSubmissionRow,
  dimension: InspectionPassFailDimension
): { id: string; rawName: string } {
  switch (dimension) {
    case "im":
      return { id: submissionIMName(submission), rawName: submissionIMName(submission) };
    case "pm":
      return { id: submissionPMName(submission), rawName: submissionPMName(submission) };
    case "subcontractor":
      return {
        id: submissionInstallerName(submission),
        rawName: submissionInstallerName(submission),
      };
    case "project":
      return {
        id: submission.projectId,
        rawName: submission.projectName?.trim() || submission.projectId,
      };
  }
}

export function rollupInspectionPassFailRates(
  submissions: readonly GlobalInspectionSubmissionRow[],
  dimension: InspectionPassFailDimension,
  unassignedLabel: string
): InspectionPassFailRow[] {
  const buckets = new Map<string, { id: string; name: string; passed: number; failed: number }>();

  for (const submission of submissions) {
    if (!isScoredInspectionSubmission(submission)) continue;
    const { id, rawName } = getPassFailGroupKey(submission, dimension);
    const name =
      dimension === "project" ? rawName : personFilterOptionLabel(rawName, unassignedLabel);
    const bucket = buckets.get(id) ?? { id, name, passed: 0, failed: 0 };
    if (submission.outcome === "PASS") bucket.passed += 1;
    else bucket.failed += 1;
    buckets.set(id, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => {
      const total = bucket.passed + bucket.failed;
      return {
        ...bucket,
        total,
        passRate: total > 0 ? Math.round((bucket.passed / total) * 100) : null,
      };
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}
