import { describe, expect, it } from "vitest";
import type { GlobalInspectionSubmissionRow } from "@/lib/inspections/fetch-global-inspections-report";
import {
  isScoredInspectionSubmission,
  rollupInspectionPassFailRates,
} from "@/lib/reports/inspection-pass-fail-rollups";

function row(
  partial: Partial<GlobalInspectionSubmissionRow> & Pick<GlobalInspectionSubmissionRow, "submissionId">
): GlobalInspectionSubmissionRow {
  return {
    seqNumber: 1,
    scopeTypeCode: "CABIU",
    scopeTypeName: "CABIU",
    projectId: "p1",
    projectName: "Project One",
    unit: "101",
    building: "",
    level: "",
    area: "",
    shipPhase: "",
    buildPhase: "",
    imName: "Alice IM",
    pmName: "Bob PM",
    inspectionTypeCode: "CLEAR_INSPECTION",
    inspectionTypeName: "Clear Inspection",
    submittedByName: "Inspector",
    installTeamName: "Sub A",
    submittedAt: "2026-05-01T12:00:00.000Z",
    outcome: "PASS",
    totalDeficiencies: 0,
    isCalibration: false,
    attemptNumber: 1,
    sections: [],
    ...partial,
  };
}

describe("inspection-pass-fail-rollups", () => {
  it("isScoredInspectionSubmission excludes calibrations and non pass/fail outcomes", () => {
    expect(isScoredInspectionSubmission(row({ submissionId: "1", outcome: "PASS" }))).toBe(true);
    expect(isScoredInspectionSubmission(row({ submissionId: "2", outcome: "FAIL" }))).toBe(true);
    expect(
      isScoredInspectionSubmission(row({ submissionId: "3", isCalibration: true, outcome: "PASS" }))
    ).toBe(false);
    expect(isScoredInspectionSubmission(row({ submissionId: "4", outcome: "COMPLETE" }))).toBe(false);
  });

  it("rollupInspectionPassFailRates groups by IM with pass rate", () => {
    const submissions = [
      row({ submissionId: "1", imName: "Alice IM", outcome: "PASS" }),
      row({ submissionId: "2", imName: "Alice IM", outcome: "FAIL" }),
      row({ submissionId: "3", imName: "Zara IM", outcome: "PASS" }),
      row({ submissionId: "4", imName: "", outcome: "FAIL" }),
    ];

    const rolled = rollupInspectionPassFailRates(submissions, "im", "Unassigned");

    expect(rolled).toHaveLength(3);
    const alice = rolled.find((r) => r.name === "Alice IM");
    expect(alice).toMatchObject({ passed: 1, failed: 1, total: 2, passRate: 50 });

    const unassigned = rolled.find((r) => r.name === "Unassigned");
    expect(unassigned).toMatchObject({ passed: 0, failed: 1, total: 1, passRate: 0 });
  });

  it("rollupInspectionPassFailRates groups by project", () => {
    const submissions = [
      row({ submissionId: "1", projectId: "p1", projectName: "Alpha", outcome: "PASS" }),
      row({
        submissionId: "2",
        projectId: "p2",
        projectName: "Beta",
        outcome: "FAIL",
      }),
    ];

    const rolled = rollupInspectionPassFailRates(submissions, "project", "Unassigned");
    expect(rolled.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });
});
