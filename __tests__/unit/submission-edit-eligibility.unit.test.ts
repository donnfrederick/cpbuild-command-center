import { describe, it, expect } from "vitest";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import {
  canAuthorEditFieldVerificationSubmission,
  canAuthorEditInspectionSubmission,
  isMostRecentFormAttempt,
} from "@/lib/inspections/submission-edit-eligibility";

function formSubmission(
  overrides: Partial<InspectionSubmission> = {},
): InspectionSubmission {
  return {
    id: "sub-1",
    formId: "form-1",
    formNameSnapshot: "Ceramic Tile Clear",
    categorySnapshot: "CLEAR_INSPECTION",
    level: "scope",
    projectId: "proj-1",
    unitId: "unit-1",
    scopeRowId: "row-1",
    submittedAt: "2026-06-18T12:00:00.000Z",
    submittedBy: "Phil Salter",
    submittedById: "user-phil",
    outcome: "PASS",
    deficiencyCount: 0,
    payload: {},
    source: "FORM",
    ...overrides,
  };
}

describe("canAuthorEditInspectionSubmission()", () => {
  it("allows the original submitter on the most recent clear inspection", () => {
    expect(
      canAuthorEditInspectionSubmission({
        submission: formSubmission(),
        currentUserId: "user-phil",
        isMostRecentAttempt: true,
      }),
    ).toBe(true);
  });

  it("allows the original submitter on the most recent calibration", () => {
    expect(
      canAuthorEditInspectionSubmission({
        submission: formSubmission({
          id: "sub-cal",
          categorySnapshot: "CALIBRATION_INSPECTION",
        }),
        currentUserId: "user-phil",
        isMostRecentAttempt: true,
      }),
    ).toBe(true);
  });

  it("allows the original submitter on the most recent field verification", () => {
    expect(
      canAuthorEditInspectionSubmission({
        submission: formSubmission({
          categorySnapshot: "FIELD_VERIFICATION",
          formNameSnapshot: "Cabinet Field Verification",
        }),
        currentUserId: "user-phil",
        isMostRecentAttempt: true,
      }),
    ).toBe(true);
  });

  it("denies when the user is not the submitter", () => {
    expect(
      canAuthorEditInspectionSubmission({
        submission: formSubmission(),
        currentUserId: "user-other",
        isMostRecentAttempt: true,
      }),
    ).toBe(false);
  });

  it("denies when a newer attempt exists for the same form", () => {
    expect(
      canAuthorEditInspectionSubmission({
        submission: formSubmission(),
        currentUserId: "user-phil",
        isMostRecentAttempt: false,
      }),
    ).toBe(false);
  });

  it("denies backfill submissions", () => {
    expect(
      canAuthorEditInspectionSubmission({
        submission: formSubmission({ source: "BACKFILL", submittedById: "user-phil" }),
        currentUserId: "user-phil",
        isMostRecentAttempt: true,
      }),
    ).toBe(false);
  });

  it("allows pending-sync submissions on this device without submittedById", () => {
    expect(
      canAuthorEditInspectionSubmission({
        submission: formSubmission({ _pendingSync: true, submittedById: undefined }),
        currentUserId: undefined,
        isMostRecentAttempt: true,
      }),
    ).toBe(true);
  });
});

describe("canAuthorEditFieldVerificationSubmission()", () => {
  it("delegates to canAuthorEditInspectionSubmission", () => {
    expect(
      canAuthorEditFieldVerificationSubmission({
        submission: formSubmission({ categorySnapshot: "FIELD_VERIFICATION" }),
        currentUserId: "user-phil",
        isMostRecentAttempt: true,
      }),
    ).toBe(true);
  });
});

describe("isMostRecentFormAttempt()", () => {
  it("returns true only for the newest FORM row with the same formId", () => {
    const older = formSubmission({ id: "sub-old", submittedAt: "2026-06-17T12:00:00.000Z" });
    const newer = formSubmission({
      id: "sub-new",
      submittedAt: "2026-06-18T12:00:00.000Z",
      categorySnapshot: "CALIBRATION_INSPECTION",
    });
    expect(isMostRecentFormAttempt([older, newer], newer)).toBe(true);
    expect(isMostRecentFormAttempt([older, newer], older)).toBe(false);
  });
});
