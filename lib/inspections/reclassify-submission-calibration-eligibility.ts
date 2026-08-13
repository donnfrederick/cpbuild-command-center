import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import { isCalibrationSubmission } from "@/lib/inspections/scope-inspection-display";

export function isClearSubmissionForReclassify(
  submission: Pick<InspectionSubmission, "categorySnapshot" | "source" | "_pendingSync" | "scopeRowId">,
): boolean {
  if (submission._pendingSync) return false;
  if (!submission.scopeRowId) return false;
  return submission.categorySnapshot === "CLEAR_INSPECTION" || submission.source === "BACKFILL";
}

export function findDefaultCalibratedAgainstSubmissionId(
  submissionId: string,
  submissions: InspectionSubmission[],
): string | null {
  const otherClears = submissions
    .filter(
      (sub) =>
        sub.id !== submissionId &&
        !isCalibrationSubmission(sub) &&
        (sub.categorySnapshot === "CLEAR_INSPECTION" || sub.source === "BACKFILL"),
    )
    .sort(
      (left, right) =>
        new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime(),
    );
  return otherClears[0]?.id ?? null;
}

export function canReclassifyClearSubmissionToCalibration(
  submission: InspectionSubmission,
  submissions: InspectionSubmission[],
): boolean {
  if (!isClearSubmissionForReclassify(submission)) return false;
  if (submissions.some((sub) => isCalibrationSubmission(sub))) return false;
  return findDefaultCalibratedAgainstSubmissionId(submission.id, submissions) != null;
}
