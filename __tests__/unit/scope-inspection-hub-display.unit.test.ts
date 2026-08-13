import { describe, it, expect } from "vitest";
import { resolveScopeInspectionHubDisplay } from "@/lib/inspections/scope-inspection-display";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

const clearPass: InspectionSubmission = {
  id: "sub-clear",
  formId: "form-clear",
  formNameSnapshot: "Clear",
  categorySnapshot: "CLEAR_INSPECTION",
  level: "scope",
  projectId: "proj-1",
  unitId: "unit-1",
  scopeRowId: "row-cab",
  submittedAt: "2026-06-01T12:00:00Z",
  submittedBy: "Alice",
  outcome: "PASS",
  deficiencyCount: 0,
  payload: {},
  source: "FORM",
};

describe("resolveScopeInspectionHubDisplay()", () => {
  it("prefers live submissions over grid fallback fields", () => {
    const display = resolveScopeInspectionHubDisplay({
      gridInspectionStatus: "FAILED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
      submissions: [clearPass],
    });
    expect(display?.categoryLabel).toBe("Clear Inspection");
    expect(display?.failed).toBe(false);
  });

  it("uses grid fields when submissions are not loaded yet", () => {
    const display = resolveScopeInspectionHubDisplay({
      gridInspectionStatus: "PASSED",
      latestInspectionCategory: "CLEAR_INSPECTION",
      submissions: [],
    });
    expect(display).toEqual({
      failed: false,
      categoryLabel: "Clear Inspection",
      inspectionStatus: "PASSED",
      latestInspectionCategory: "CLEAR_INSPECTION",
    });
  });

  it("shows pass clear when a newer fail calibration exists (calibration is not authoritative)", () => {
    const calFail: InspectionSubmission = {
      ...clearPass,
      id: "sub-cal",
      categorySnapshot: "CALIBRATION_INSPECTION",
      templateSnapshot: { category: "CALIBRATION_INSPECTION" },
      submittedAt: "2026-06-02T12:00:00Z",
      outcome: "FAIL",
    };
    const display = resolveScopeInspectionHubDisplay({
      gridInspectionStatus: "FAILED",
      latestInspectionCategory: "CLEAR_INSPECTION",
      submissions: [calFail, clearPass],
    });
    expect(display?.categoryLabel).toBe("Clear Inspection");
    expect(display?.failed).toBe(false);
    expect(display?.inspectionStatus).toBe("PASSED");
  });
});
