import { isInspectionTemplateSnapshotStub } from "@/lib/inspections/inspection-submission-stubs";
import {
  categoryFromSubmissionSnapshot,
  isScopeInspectionStatusCategory,
  resolvedSubmissionCategory,
} from "@/lib/inspections/inspection-type-codes";

/**
 * Category for grid tile enrichment — matches hydrated submission views.
 * Legacy stubs may store PRE_INSTALL while the linked form is TWO_AREA_CLEAR;
 * prefer the form when the stub category is not scope-inspection-authoritative.
 */
export function resolveGridSubmissionCategory(
  templateSnapshot: unknown,
  formCategory: string | null | undefined,
): string | undefined {
  if (isInspectionTemplateSnapshotStub(templateSnapshot)) {
    const fromStub = categoryFromSubmissionSnapshot(templateSnapshot);
    if (fromStub === "CALIBRATION_INSPECTION") {
      return fromStub;
    }
    if (fromStub && isScopeInspectionStatusCategory(fromStub)) {
      return fromStub;
    }
    return formCategory ?? fromStub ?? undefined;
  }
  const category = resolvedSubmissionCategory(templateSnapshot, formCategory);
  if (category === "CALIBRATION_INSPECTION") {
    return category;
  }
  if (category && isScopeInspectionStatusCategory(category)) {
    return category;
  }
  return formCategory ?? category;
}
