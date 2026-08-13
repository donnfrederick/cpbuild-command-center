import type { InspectionCategory } from "@/components/forms/formTypes";
import { categoryFromSubmissionSnapshot } from "@/lib/inspections/inspection-type-codes";
import { resolveGridSubmissionCategory } from "@/lib/inspections/resolve-grid-submission-category";

/**
 * Client-side submission category for display and filtering.
 * Calibrations reuse CLEAR forms but persist CALIBRATION_INSPECTION on the stub.
 */
export function clientSubmissionCategory(input: {
  templateSnapshot: unknown;
  formCategory?: string | null;
  categoryOverride?: "CALIBRATION_INSPECTION" | null;
}): InspectionCategory {
  if (input.categoryOverride === "CALIBRATION_INSPECTION") {
    return "CALIBRATION_INSPECTION";
  }
  const stubCategory = categoryFromSubmissionSnapshot(input.templateSnapshot);
  if (stubCategory === "CALIBRATION_INSPECTION") {
    return "CALIBRATION_INSPECTION";
  }
  const resolved = resolveGridSubmissionCategory(
    input.templateSnapshot,
    input.formCategory,
  );
  if (resolved) {
    return resolved as InspectionCategory;
  }
  return (stubCategory ?? input.formCategory ?? "OTHER") as InspectionCategory;
}
