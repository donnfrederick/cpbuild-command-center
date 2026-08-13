import { describe, it, expect } from "vitest";
import { resolveGridSubmissionCategory } from "@/lib/inspections/resolve-grid-submission-category";

describe("resolveGridSubmissionCategory()", () => {
  it("prefers form category when stub stores legacy PRE_INSTALL", () => {
    expect(
      resolveGridSubmissionCategory({ category: "PRE_INSTALL" }, "TWO_AREA_CLEAR"),
    ).toBe("TWO_AREA_CLEAR");
  });

  it("keeps authoritative stub category when present", () => {
    expect(
      resolveGridSubmissionCategory({ category: "TWO_AREA_CLEAR" }, "CLEAR_INSPECTION"),
    ).toBe("TWO_AREA_CLEAR");
  });

  it("falls back to form category for empty stub", () => {
    expect(resolveGridSubmissionCategory({}, "FIELD_VERIFICATION")).toBe("FIELD_VERIFICATION");
  });

  it("prefers form category when legacy full template stores PRE_INSTALL", () => {
    expect(
      resolveGridSubmissionCategory(
        { category: "PRE_INSTALL", name: "Legacy", sections: [{ id: "s1", title: "S", questions: [] }] },
        "TWO_AREA_CLEAR",
      ),
    ).toBe("TWO_AREA_CLEAR");
  });

  it("returns CALIBRATION_INSPECTION from stub even when linked form is CLEAR_INSPECTION", () => {
    expect(
      resolveGridSubmissionCategory({ category: "CALIBRATION_INSPECTION" }, "CLEAR_INSPECTION"),
    ).toBe("CALIBRATION_INSPECTION");
  });

  it("returns CALIBRATION_INSPECTION from hydrated template even when linked form is CLEAR_INSPECTION", () => {
    expect(
      resolveGridSubmissionCategory(
        {
          category: "CALIBRATION_INSPECTION",
          name: "Clear Inspection",
          sections: [{ id: "s1", title: "Checks", questions: [] }],
        },
        "CLEAR_INSPECTION",
      ),
    ).toBe("CALIBRATION_INSPECTION");
  });
});
