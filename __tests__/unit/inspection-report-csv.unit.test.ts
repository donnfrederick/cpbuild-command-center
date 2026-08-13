import { describe, expect, it } from "vitest";
import { buildInspectionReportCsv } from "@/lib/inspections/inspection-report-csv";
import type { SubmissionRow } from "@/app/api/projects/[id]/inspections-report/route";

function submission(
  partial: Partial<SubmissionRow> & Pick<SubmissionRow, "submissionId" | "outcome">,
): SubmissionRow {
  return {
    seqNumber: 1,
    scopeTypeCode: "TIL",
    scopeTypeName: "Tile",
    unit: "101",
    building: "A",
    level: "1",
    area: "",
    shipPhase: "",
    buildPhase: "",
    imName: "IM",
    submittedByName: "Inspector",
    installTeamName: "Sub Co",
    submittedAt: "2026-06-01T12:00:00.000Z",
    totalDeficiencies: partial.outcome === "PASS" ? 0 : 1,
    isCalibration: false,
    attemptNumber: 1,
    sections: [],
    ...partial,
  };
}

describe("buildInspectionReportCsv()", () => {
  it("includes a summary row for fully passing inspections by default", () => {
    const csv = buildInspectionReportCsv([
      submission({
        submissionId: "sub-pass",
        outcome: "PASS",
        sections: [],
      }),
    ]);

    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"PASS"');
  });

  it("includes passed and failed questions when shareOnlyFailedItems is disabled", () => {
    const csv = buildInspectionReportCsv([
      submission({
        submissionId: "sub-mixed",
        outcome: "FAIL",
        totalDeficiencies: 1,
        sections: [
          {
            sectionTitle: "Section 1",
            passed: false,
            totalOccurrences: 1,
            questions: [
              {
                questionTitle: "Section 1 status",
                passed: true,
                totalOccurrences: 0,
                deficiencies: [],
              },
              {
                questionTitle: "Section 2 status",
                passed: false,
                totalOccurrences: 1,
                deficiencies: [{ description: "Crack", count: 1, severity: "Minor" }],
              },
            ],
            failingQuestions: [
              {
                questionTitle: "Section 2 status",
                passed: false,
                totalOccurrences: 1,
                deficiencies: [{ description: "Crack", count: 1, severity: "Minor" }],
              },
            ],
          },
        ],
      }),
    ]);

    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Section 1 status");
    expect(lines[2]).toContain("Section 2 status");
    expect(lines[2]).toContain("Crack");
  });

  it("omits fully passing inspections when shareOnlyFailedItems is enabled", () => {
    const csv = buildInspectionReportCsv(
      [
        submission({
          submissionId: "sub-pass",
          outcome: "PASS",
          sections: [],
        }),
        submission({
          submissionId: "sub-fail",
          outcome: "FAIL",
          sections: [
            {
              sectionTitle: "Tile",
              passed: false,
              totalOccurrences: 1,
              questions: [
                {
                  questionTitle: "Grout lines",
                  passed: false,
                  totalOccurrences: 1,
                  deficiencies: [{ description: "Cracked grout", count: 1, severity: "Minor" }],
                },
              ],
              failingQuestions: [
                {
                  questionTitle: "Grout lines",
                  passed: false,
                  totalOccurrences: 1,
                  deficiencies: [{ description: "Cracked grout", count: 1, severity: "Minor" }],
                },
              ],
            },
          ],
        }),
      ],
      { shareOnlyFailedItems: true },
    );

    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Grout lines");
    expect(lines[1]).not.toContain('"PASS"');
  });
});
