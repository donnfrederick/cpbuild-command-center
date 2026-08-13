import { describe, expect, it } from "vitest";
import { getInspectionDeficiencyMetrics } from "@/lib/inspections/activity-metadata";

describe("getInspectionDeficiencyMetrics", () => {
  it("counts failed questions and total deficiency occurrences", () => {
    expect(
      getInspectionDeficiencyMetrics({
        q1: {
          choice: "fail",
          deficiencies: [
            { id: "d1", count: 2 },
            { id: "d2", count: 1 },
          ],
        },
        q2: {
          choice: "pass",
          deficiencies: [{ id: "ignored", count: 9 }],
        },
        q3: {
          choice: "no",
          deficiencies: [{ id: "d3", count: 3 }],
        },
      }),
    ).toEqual({ failedQuestionCount: 2, totalDeficiencyCount: 6 });
  });

  it("defaults deficiency count to one per failed deficiency", () => {
    expect(
      getInspectionDeficiencyMetrics({
        q1: {
          choice: "fail",
          deficiencies: [{ id: "d1" }, { id: "d2", count: 0 }],
        },
      }),
    ).toEqual({ failedQuestionCount: 1, totalDeficiencyCount: 2 });
  });
});
