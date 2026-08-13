import { describe, it, expect } from "vitest";
import {
  categoryToInspectionTypeCode,
  isInspectionHistoryCategory,
} from "@/lib/inspections/inspection-type-codes";
import {
  isCalibrationSubmission,
  deriveLatestCalibrationOutcome,
  latestNonCalibrationSubmission,
  latestScopeInspectionStatusSubmission,
  scopeInstallLockedByClearInspection,
  scopeStatusHubInstallOptionsLocked,
  scopeStatusHubTriggerDisabled,
  latestSubmissionByCategory,
  inspectionHistoryRowModifiers,
  inspectionTypeChipModifier,
  inspectionVisualType,
  submissionOutcomeIsFail,
  submissionOutcomeIsPass,
  attemptNumberForSubmission,
  scopeInspectionHubRetryEligible,
  scopeShowProcoreBackfillMenu,
  existingProcoreBackfillSubmission,
} from "@/lib/inspections/scope-inspection-display";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

describe("categoryToInspectionTypeCode()", () => {
  it("maps form categories 1:1 to inspection_types.code", () => {
    expect(categoryToInspectionTypeCode("FIELD_VERIFICATION")).toBe("FIELD_VERIFICATION");
    expect(categoryToInspectionTypeCode("TWO_AREA_CLEAR")).toBe("TWO_AREA_CLEAR");
    expect(categoryToInspectionTypeCode("CALIBRATION_INSPECTION")).toBe("CALIBRATION_INSPECTION");
  });

  it("falls back to CLEAR_INSPECTION for unknown categories", () => {
    expect(categoryToInspectionTypeCode("PRE_INSTALL")).toBe("CLEAR_INSPECTION");
  });
});

describe("isInspectionHistoryCategory()", () => {
  it("accepts all seeded inspection type codes", () => {
    expect(isInspectionHistoryCategory("OTHER")).toBe(true);
    expect(isInspectionHistoryCategory("GYPCRETE_MOISTURE_TEST")).toBe(true);
    expect(isInspectionHistoryCategory("NOT_A_TYPE")).toBe(false);
  });
});

function stubSubmission(
  partial: Partial<InspectionSubmission> & Pick<InspectionSubmission, "categorySnapshot">,
): InspectionSubmission {
  return {
    id: partial.id ?? "sub-1",
    formId: "form-1",
    formNameSnapshot: "Form",
    level: "scope",
    projectId: "proj-1",
    unitId: "unit-1",
    submittedAt: partial.submittedAt ?? new Date().toISOString(),
    submittedBy: "user-1",
    outcome: partial.outcome ?? "PASS",
    deficiencyCount: 0,
    payload: {},
    source: partial.source ?? "FORM",
    ...partial,
  };
}

describe("scopeInstallLockedByClearInspection()", () => {
  it("locks install options for clear inspection pass, fail, or backfill — not field verification", () => {
    expect(
      scopeInstallLockedByClearInspection([
        stubSubmission({ categorySnapshot: "FIELD_VERIFICATION", outcome: "PASS" }),
      ]),
    ).toBe(false);
    expect(
      scopeInstallLockedByClearInspection([
        stubSubmission({ categorySnapshot: "CLEAR_INSPECTION", outcome: "PASS" }),
      ]),
    ).toBe(true);
    expect(
      scopeInstallLockedByClearInspection([
        stubSubmission({ categorySnapshot: "CLEAR_INSPECTION", outcome: "FAIL" }),
      ]),
    ).toBe(true);
    expect(
      scopeInstallLockedByClearInspection([
        stubSubmission({ categorySnapshot: "CLEAR_INSPECTION", source: "BACKFILL" }),
      ]),
    ).toBe(true);
  });
});

describe("scopeStatusHubTriggerDisabled()", () => {
  it("does not disable the hub when clear inspection exists but user can manage status", () => {
    expect(scopeStatusHubTriggerDisabled(false, true)).toBe(false);
    expect(scopeStatusHubTriggerDisabled(true, true)).toBe(true);
    expect(scopeStatusHubTriggerDisabled(false, false)).toBe(true);
  });
});

describe("scopeStatusHubInstallOptionsLocked()", () => {
  it("matches scopeInstallLockedByClearInspection", () => {
    const subs = [stubSubmission({ categorySnapshot: "CLEAR_INSPECTION", outcome: "FAIL" })];
    expect(scopeStatusHubInstallOptionsLocked(subs)).toBe(true);
    expect(scopeStatusHubTriggerDisabled(false, true)).toBe(false);
  });
});

describe("latestSubmissionByCategory()", () => {
  it("returns newest per category from newest-first list", () => {
    const map = latestSubmissionByCategory([
      stubSubmission({ id: "fv-2", categorySnapshot: "FIELD_VERIFICATION", submittedAt: "2026-01-02T00:00:00Z" }),
      stubSubmission({ id: "fv-1", categorySnapshot: "FIELD_VERIFICATION", submittedAt: "2026-01-01T00:00:00Z" }),
      stubSubmission({ id: "clear-1", categorySnapshot: "CLEAR_INSPECTION", submittedAt: "2026-01-03T00:00:00Z" }),
    ]);
    expect(map.get("FIELD_VERIFICATION")?.id).toBe("fv-2");
    expect(map.get("CLEAR_INSPECTION")?.id).toBe("clear-1");
  });
});

describe("latestScopeInspectionStatusSubmission()", () => {
  it("ignores legacy PRE_INSTALL for status sync", () => {
    const latest = latestScopeInspectionStatusSubmission([
      stubSubmission({ id: "pre", categorySnapshot: "PRE_INSTALL" as InspectionSubmission["categorySnapshot"] }),
    ]);
    expect(latest).toBeNull();
  });

  it("prefers newest authoritative submission", () => {
    const latest = latestScopeInspectionStatusSubmission([
      stubSubmission({ id: "fv", categorySnapshot: "FIELD_VERIFICATION" }),
      stubSubmission({ id: "clear", categorySnapshot: "CLEAR_INSPECTION" }),
    ]);
    expect(latest?.id).toBe("fv");
  });
});

describe("latestNonCalibrationSubmission()", () => {
  it("skips calibration submissions", () => {
    const latest = latestNonCalibrationSubmission([
      stubSubmission({ id: "cal", categorySnapshot: "CALIBRATION_INSPECTION" }),
      stubSubmission({ id: "fv", categorySnapshot: "FIELD_VERIFICATION" }),
    ]);
    expect(latest?.id).toBe("fv");
  });
});

describe("isCalibrationSubmission()", () => {
  it("detects calibration from stub when categorySnapshot was misclassified as CLEAR", () => {
    expect(
      isCalibrationSubmission(
        stubSubmission({
          id: "cal",
          categorySnapshot: "CLEAR_INSPECTION",
          templateSnapshot: { category: "CALIBRATION_INSPECTION" },
        }),
      ),
    ).toBe(true);
  });
});

describe("deriveLatestCalibrationOutcome()", () => {
  it("returns newest calibration outcome", () => {
    expect(
      deriveLatestCalibrationOutcome([
        stubSubmission({
          id: "cal-fail",
          categorySnapshot: "CALIBRATION_INSPECTION",
          outcome: "FAIL",
          submittedAt: "2026-06-02T12:00:00Z",
        }),
        stubSubmission({
          id: "cal-pass",
          categorySnapshot: "CALIBRATION_INSPECTION",
          outcome: "PASS",
          submittedAt: "2026-06-01T12:00:00Z",
        }),
      ]),
    ).toBe("FAIL");
  });

  it("returns null when no calibrations exist", () => {
    expect(
      deriveLatestCalibrationOutcome([
        stubSubmission({ id: "clear", categorySnapshot: "CLEAR_INSPECTION" }),
      ]),
    ).toBeNull();
  });
});

describe("inspectionVisualType()", () => {
  it("maps categories to distinct visual types", () => {
    expect(inspectionVisualType(stubSubmission({ categorySnapshot: "FIELD_VERIFICATION" }))).toBe("fv");
    expect(inspectionVisualType(stubSubmission({ categorySnapshot: "TWO_AREA_CLEAR" }))).toBe("2ac");
    expect(inspectionVisualType(stubSubmission({ categorySnapshot: "CLEAR_INSPECTION" }))).toBe("clear");
  });
});

describe("inspectionHistoryRowModifiers()", () => {
  it("adds type and pass/fail accent classes for latest attempts", () => {
    const mods = inspectionHistoryRowModifiers(
      stubSubmission({ categorySnapshot: "FIELD_VERIFICATION", outcome: "PASS" }),
      { accent: true },
    );
    expect(mods).toContain("inspection-history-row--type-fv");
    expect(mods).toContain("inspection-history-row--pass");
  });

  it("omits pass/fail accent when accent is false", () => {
    const mods = inspectionHistoryRowModifiers(
      stubSubmission({ categorySnapshot: "TWO_AREA_CLEAR", outcome: "FAIL" }),
      { accent: false },
    );
    expect(mods).toBe("inspection-history-row--type-2ac");
  });
});

describe("inspectionTypeChipModifier()", () => {
  it("returns type-outcome suffix for chips", () => {
    expect(
      inspectionTypeChipModifier(
        stubSubmission({ categorySnapshot: "TWO_AREA_CLEAR", outcome: "PASS" }),
      ),
    ).toBe("2ac-pass");
    expect(
      inspectionTypeChipModifier(
        stubSubmission({ categorySnapshot: "FIELD_VERIFICATION", outcome: "FAIL" }),
      ),
    ).toBe("fv-fail");
  });
});

describe("attemptNumberForSubmission()", () => {
  it("returns 1-based attempt within category from newest-first list", () => {
    const submissions = [
      stubSubmission({ id: "clear-2", categorySnapshot: "CLEAR_INSPECTION", submittedAt: "2026-02-02T00:00:00Z" }),
      stubSubmission({ id: "clear-1", categorySnapshot: "CLEAR_INSPECTION", submittedAt: "2026-02-01T00:00:00Z" }),
    ];
    expect(attemptNumberForSubmission(submissions[0], submissions)).toBe(2);
    expect(attemptNumberForSubmission(submissions[1], submissions)).toBe(1);
  });
});

describe("scopeInspectionHubRetryEligible()", () => {
  it("allows retry for any failed scope-level inspection type when user can manage status", () => {
    expect(
      scopeInspectionHubRetryEligible(
        stubSubmission({ categorySnapshot: "TWO_AREA_CLEAR", outcome: "FAIL" }),
        true,
      ),
    ).toBe(true);
    expect(
      scopeInspectionHubRetryEligible(
        stubSubmission({ categorySnapshot: "FIELD_VERIFICATION", outcome: "FAIL" }),
        true,
      ),
    ).toBe(true);
    expect(
      scopeInspectionHubRetryEligible(
        stubSubmission({ categorySnapshot: "OTHER", outcome: "FAIL" }),
        true,
      ),
    ).toBe(true);
    expect(
      scopeInspectionHubRetryEligible(
        stubSubmission({ categorySnapshot: "TWO_AREA_CLEAR", outcome: "PASS" }),
        true,
      ),
    ).toBe(false);
    expect(
      scopeInspectionHubRetryEligible(
        stubSubmission({ categorySnapshot: "CALIBRATION_INSPECTION", outcome: "FAIL" }),
        true,
      ),
    ).toBe(false);
    expect(
      scopeInspectionHubRetryEligible(
        stubSubmission({ categorySnapshot: "CLEAR_INSPECTION", outcome: "FAIL", source: "BACKFILL" }),
        true,
      ),
    ).toBe(false);
  });
});

describe("scopeShowProcoreBackfillMenu()", () => {
  it("shows when no form submission exists yet", () => {
    expect(scopeShowProcoreBackfillMenu([], true)).toBe(true);
  });

  it("shows when a backfill record exists even if forms were submitted", () => {
    expect(
      scopeShowProcoreBackfillMenu(
        [
          stubSubmission({ id: "form", categorySnapshot: "CLEAR_INSPECTION", source: "FORM" }),
          stubSubmission({ id: "bf", categorySnapshot: "CLEAR_INSPECTION", source: "BACKFILL" }),
        ],
        true,
      ),
    ).toBe(true);
  });

  it("hides when a form submission exists and there is no backfill (unit scope picker eligibility)", () => {
    expect(
      scopeShowProcoreBackfillMenu(
        [stubSubmission({ categorySnapshot: "TWO_AREA_CLEAR", source: "FORM" })],
        true,
      ),
    ).toBe(false);
  });

  it("hides when the user cannot manage status", () => {
    expect(scopeShowProcoreBackfillMenu([], false)).toBe(false);
  });
});

describe("existingProcoreBackfillSubmission()", () => {
  it("returns the backfill submission when present", () => {
    const backfill = stubSubmission({ id: "bf", source: "BACKFILL" });
    expect(existingProcoreBackfillSubmission([backfill])?.id).toBe("bf");
  });
});

describe("submissionOutcomeIsPass/Fail()", () => {
  it("treats COMPLETE as pass-like (not a failure)", () => {
    const complete = stubSubmission({ categorySnapshot: "CLEAR_INSPECTION", outcome: "COMPLETE" });
    expect(submissionOutcomeIsPass(complete)).toBe(true);
    expect(submissionOutcomeIsFail(complete)).toBe(false);
    expect(inspectionTypeChipModifier(complete)).toContain("-pass");
  });
});
