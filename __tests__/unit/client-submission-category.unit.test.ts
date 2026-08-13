import { describe, it, expect } from "vitest";
import { clientSubmissionCategory } from "@/lib/inspections/client-submission-category";

describe("clientSubmissionCategory()", () => {
  it("honors categoryOverride for pending calibration queue records", () => {
    expect(
      clientSubmissionCategory({
        templateSnapshot: { category: "CLEAR_INSPECTION", name: "Clear", sections: [] },
        formCategory: "CLEAR_INSPECTION",
        categoryOverride: "CALIBRATION_INSPECTION",
      }),
    ).toBe("CALIBRATION_INSPECTION");
  });

  it("returns CALIBRATION_INSPECTION from stub when linked form is CLEAR_INSPECTION", () => {
    expect(
      clientSubmissionCategory({
        templateSnapshot: { category: "CALIBRATION_INSPECTION" },
        formCategory: "CLEAR_INSPECTION",
      }),
    ).toBe("CALIBRATION_INSPECTION");
  });

  it("returns CALIBRATION_INSPECTION when hydrated template wrongly stores CLEAR but stub is calibration", () => {
    expect(
      clientSubmissionCategory({
        templateSnapshot: {
          category: "CLEAR_INSPECTION",
          name: "Clear",
          sections: [{ id: "s1", title: "S", questions: [] }],
        },
        formCategory: "CLEAR_INSPECTION",
      }),
    ).toBe("CLEAR_INSPECTION");
  });

  it("detects calibration from stub even when full template category is CLEAR", () => {
    expect(
      clientSubmissionCategory({
        templateSnapshot: { category: "CALIBRATION_INSPECTION", latestVersionId: "fv-1" },
        formCategory: "CLEAR_INSPECTION",
      }),
    ).toBe("CALIBRATION_INSPECTION");
  });
});
