import { describe, expect, it } from "vitest";
import type { GlobalInspectionSubmissionRow } from "@/lib/inspections/fetch-global-inspections-report";
import {
  rollupInspectionDeficienciesByGroup,
  rollupInspectionDeficienciesBySection,
} from "@/lib/reports/inspection-deficiency-section-rollups";

function submission(
  partial: Partial<GlobalInspectionSubmissionRow> & Pick<GlobalInspectionSubmissionRow, "submissionId">
): GlobalInspectionSubmissionRow {
  return {
    seqNumber: 1,
    scopeTypeCode: "CABIU",
    scopeTypeName: "Cabinets",
    projectId: "p1",
    projectName: "Project One",
    unit: "101",
    building: "",
    level: "",
    area: "",
    shipPhase: "",
    buildPhase: "",
    imName: null,
    pmName: null,
    inspectionTypeCode: "CLEAR_INSPECTION",
    inspectionTypeName: "Clear Inspection",
    submittedByName: "Inspector",
    installTeamName: null,
    submittedAt: "2026-05-01T12:00:00.000Z",
    outcome: "FAIL",
    totalDeficiencies: 0,
    isCalibration: false,
    attemptNumber: 1,
    sections: [],
    ...partial,
  };
}

describe("rollupInspectionDeficienciesBySection", () => {
  it("sums deficiency occurrences by section title, highest first", () => {
    const rows = rollupInspectionDeficienciesBySection([
      submission({
        submissionId: "1",
        sections: [
          {
            sectionTitle: "LAYOUT",
            passed: false,
            totalOccurrences: 5,
            failingQuestions: [],
          },
          {
            sectionTitle: "DOORS AND DRAWERS",
            passed: false,
            totalOccurrences: 2,
            failingQuestions: [],
          },
        ],
      }),
      submission({
        submissionId: "2",
        sections: [
          {
            sectionTitle: "LAYOUT",
            passed: false,
            totalOccurrences: 3,
            failingQuestions: [],
          },
        ],
      }),
    ]);

    expect(rows[0]).toMatchObject({
      sectionTitle: "LAYOUT",
      occurrenceCount: 8,
      inspectionCount: 2,
    });
    expect(rows[1]).toMatchObject({
      sectionTitle: "DOORS AND DRAWERS",
      occurrenceCount: 2,
      inspectionCount: 1,
    });
  });

  it("includes zero-count sections when present on submissions", () => {
    const rows = rollupInspectionDeficienciesBySection([
      submission({
        submissionId: "1",
        sections: [
          {
            sectionTitle: "LAYOUT",
            passed: true,
            totalOccurrences: 0,
            failingQuestions: [],
          },
          {
            sectionTitle: "OTHER",
            passed: false,
            totalOccurrences: 1,
            failingQuestions: [],
          },
        ],
      }),
    ]);

    const layout = rows.find((row) => row.sectionTitle === "LAYOUT");
    expect(layout?.occurrenceCount).toBe(0);
  });
});

describe("rollupInspectionDeficienciesByGroup", () => {
  it("groups section breakdowns by scope type", () => {
    const groups = rollupInspectionDeficienciesByGroup(
      [
        submission({
          submissionId: "1",
          scopeTypeCode: "CABIU",
          scopeTypeName: "Cabinets",
          sections: [
            {
              sectionTitle: "LAYOUT",
              passed: false,
              totalOccurrences: 4,
              failingQuestions: [],
            },
          ],
        }),
        submission({
          submissionId: "2",
          scopeTypeCode: "COUNT",
          scopeTypeName: "Countertops",
          sections: [
            {
              sectionTitle: "FINISH",
              passed: false,
              totalOccurrences: 2,
              failingQuestions: [],
            },
          ],
        }),
      ],
      "scope",
      "Unassigned"
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      name: "Cabinets",
      totalOccurrences: 4,
      sections: [{ sectionTitle: "LAYOUT", occurrenceCount: 4 }],
    });
    expect(groups[1]).toMatchObject({
      name: "Countertops",
      totalOccurrences: 2,
    });
  });

  it("includes zero-count sections within a group", () => {
    const groups = rollupInspectionDeficienciesByGroup(
      [
        submission({
          submissionId: "1",
          imName: "Jane",
          sections: [
            {
              sectionTitle: "LAYOUT",
              passed: true,
              totalOccurrences: 0,
              failingQuestions: [],
            },
            {
              sectionTitle: "MEP",
              passed: false,
              totalOccurrences: 2,
              failingQuestions: [],
            },
          ],
        }),
      ],
      "im",
      "Unassigned"
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.sections).toHaveLength(2);
    expect(groups[0]?.sections.find((row) => row.sectionTitle === "LAYOUT")?.occurrenceCount).toBe(
      0
    );
  });

  it("includes groups when all section counts are zero", () => {
    const groups = rollupInspectionDeficienciesByGroup(
      [
        submission({
          submissionId: "1",
          imName: "Jane",
          sections: [
            {
              sectionTitle: "LAYOUT",
              passed: true,
              totalOccurrences: 0,
              failingQuestions: [],
            },
          ],
        }),
      ],
      "im",
      "Unassigned"
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.totalOccurrences).toBe(0);
  });

  it("sorts OTHER after named sections when deficiency counts tie", () => {
    const rows = rollupInspectionDeficienciesBySection([
      submission({
        submissionId: "1",
        sections: [
          {
            sectionTitle: "TRIM",
            passed: true,
            totalOccurrences: 0,
            failingQuestions: [],
          },
          {
            sectionTitle: "OTHER:",
            passed: true,
            totalOccurrences: 0,
            failingQuestions: [],
          },
          {
            sectionTitle: "LAYOUT",
            passed: false,
            totalOccurrences: 3,
            failingQuestions: [],
          },
        ],
      }),
    ]);

    expect(rows.map((row) => row.sectionTitle)).toEqual([
      "LAYOUT",
      "TRIM",
      "OTHER:",
    ]);
  });
});
