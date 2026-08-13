import { describe, expect, it } from "vitest";
import {
  filterSubmissionsForFailedOnlyExport,
  INSPECTION_PDF_NO_FAILED_ITEMS_HTML,
  isEmptyFailedOnlyExportBody,
  submissionHasFailedExportItems,
} from "@/lib/inspections/inspection-failed-items-export";

describe("inspection-failed-items-export", () => {
  it("detects submissions with failed export items", () => {
    expect(
      submissionHasFailedExportItems({
        sections: [{ sectionTitle: "A", passed: false, totalOccurrences: 1, questions: [], failingQuestions: [] }],
      }),
    ).toBe(false);
    expect(
      submissionHasFailedExportItems({
        sections: [
          {
            sectionTitle: "A",
            passed: false,
            totalOccurrences: 1,
            questions: [
              {
                questionTitle: "Q1",
                passed: false,
                totalOccurrences: 1,
                deficiencies: [],
              },
            ],
            failingQuestions: [
              {
                questionTitle: "Q1",
                passed: false,
                totalOccurrences: 1,
                deficiencies: [],
              },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("filters submissions when failed-only export is enabled", () => {
    const pass = { submissionId: "pass", sections: [] as never[] };
    const fail = {
      submissionId: "fail",
      sections: [
        {
          sectionTitle: "Tile",
          passed: false,
          totalOccurrences: 1,
          questions: [
            {
              questionTitle: "Grout",
              passed: false,
              totalOccurrences: 1,
              deficiencies: [{ description: "Crack", count: 1 }],
            },
          ],
          failingQuestions: [
            {
              questionTitle: "Grout",
              passed: false,
              totalOccurrences: 1,
              deficiencies: [{ description: "Crack", count: 1 }],
            },
          ],
        },
      ],
    };

    expect(filterSubmissionsForFailedOnlyExport([pass, fail], false)).toHaveLength(2);
    expect(filterSubmissionsForFailedOnlyExport([pass, fail], true)).toEqual([fail]);
  });

  it("recognizes the empty failed-only PDF body sentinel", () => {
    expect(isEmptyFailedOnlyExportBody(INSPECTION_PDF_NO_FAILED_ITEMS_HTML)).toBe(true);
    expect(isEmptyFailedOnlyExportBody('<div class="q">Fail</div>')).toBe(false);
  });
});
