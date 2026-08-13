import { describe, expect, it } from "vitest";
import {
  canReclassifyClearSubmissionToCalibration,
  findDefaultCalibratedAgainstSubmissionId,
} from "@/lib/inspections/reclassify-submission-calibration-eligibility";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

function makeSubmission(
  overrides: Partial<InspectionSubmission> & Pick<InspectionSubmission, "id">,
): InspectionSubmission {
  return {
    formId: "form-1",
    formNameSnapshot: "Clear",
    templateSnapshot: { category: "CLEAR_INSPECTION" },
    level: "scope",
    projectId: "project-1",
    unitId: "unit-1",
    scopeRowId: "scope-1",
    submittedAt: "2026-06-01T12:00:00.000Z",
    submittedBy: "Inspector",
    outcome: "PASS",
    deficiencyCount: 0,
    source: "FORM",
    payload: {},
    categorySnapshot: "CLEAR_INSPECTION",
    ...overrides,
  };
}

describe("reclassify-submission-calibration eligibility", () => {
  it("finds the newest other clear submission as default calibration target", () => {
    const submissions = [
      makeSubmission({ id: "clear-old", submittedAt: "2026-06-01T12:00:00.000Z" }),
      makeSubmission({ id: "clear-new", submittedAt: "2026-06-02T12:00:00.000Z" }),
      makeSubmission({ id: "wrong-clear", submittedAt: "2026-06-03T12:00:00.000Z" }),
    ];

    expect(findDefaultCalibratedAgainstSubmissionId("wrong-clear", submissions)).toBe("clear-new");
  });

  it("allows reclassify when another clear exists and scope has no calibration", () => {
    const submissions = [
      makeSubmission({ id: "clear-1" }),
      makeSubmission({ id: "wrong-1", submittedAt: "2026-06-02T12:00:00.000Z" }),
    ];

    expect(canReclassifyClearSubmissionToCalibration(submissions[1]!, submissions)).toBe(true);
  });

  it("blocks reclassify for pending sync rows", () => {
    const submissions = [
      makeSubmission({ id: "clear-1" }),
      makeSubmission({ id: "wrong-1", _pendingSync: true }),
    ];

    expect(canReclassifyClearSubmissionToCalibration(submissions[1]!, submissions)).toBe(false);
  });

  it("blocks reclassify when scope already has a calibration", () => {
    const submissions = [
      makeSubmission({ id: "clear-1" }),
      makeSubmission({
        id: "wrong-1",
        categorySnapshot: "CLEAR_INSPECTION",
      }),
      makeSubmission({
        id: "cal-1",
        categorySnapshot: "CALIBRATION_INSPECTION",
        submittedAt: "2026-06-03T12:00:00.000Z",
      }),
    ];

    expect(canReclassifyClearSubmissionToCalibration(submissions[1]!, submissions)).toBe(false);
  });

  it("blocks reclassify when only one clear exists on the scope", () => {
    const submissions = [makeSubmission({ id: "only-clear" })];

    expect(canReclassifyClearSubmissionToCalibration(submissions[0]!, submissions)).toBe(false);
  });

  it("allows reclassify for synced backfill when another clear exists", () => {
    const submissions = [
      makeSubmission({ id: "form-clear" }),
      makeSubmission({
        id: "backfill-clear",
        source: "BACKFILL",
        submittedAt: "2026-06-02T12:00:00.000Z",
      }),
    ];

    expect(canReclassifyClearSubmissionToCalibration(submissions[1]!, submissions)).toBe(true);
  });
});
