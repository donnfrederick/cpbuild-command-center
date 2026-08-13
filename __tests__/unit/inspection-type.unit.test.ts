import { describe, it, expect } from "vitest";
import {
  categoryFromSubmissionSnapshot,
  categoryToInspectionTypeCode,
  inspectionTypeCodeForSubmission,
  inspectionTypeConnect,
  resolvedSubmissionCategory,
} from "@/lib/inspections/inspection-type";

describe("categoryToInspectionTypeCode()", () => {
  it("maps CALIBRATION_INSPECTION", () => {
    expect(categoryToInspectionTypeCode("CALIBRATION_INSPECTION")).toBe("CALIBRATION_INSPECTION");
  });

  it("defaults to CLEAR_INSPECTION for null and unknown categories", () => {
    expect(categoryToInspectionTypeCode("CLEAR_INSPECTION")).toBe("CLEAR_INSPECTION");
    expect(categoryToInspectionTypeCode(null)).toBe("CLEAR_INSPECTION");
    expect(categoryToInspectionTypeCode("NOT_A_REAL_TYPE")).toBe("CLEAR_INSPECTION");
  });

  it("maps known inspection type codes 1:1", () => {
    expect(categoryToInspectionTypeCode("OTHER")).toBe("OTHER");
    expect(categoryToInspectionTypeCode("TWO_AREA_CLEAR")).toBe("TWO_AREA_CLEAR");
    expect(categoryToInspectionTypeCode("FIELD_VERIFICATION")).toBe("FIELD_VERIFICATION");
  });
});

describe("categoryFromSubmissionSnapshot()", () => {
  it("reads category from stub JSON", () => {
    expect(categoryFromSubmissionSnapshot({ category: "CLEAR_INSPECTION" })).toBe(
      "CLEAR_INSPECTION"
    );
  });

  it("returns undefined for non-object snapshots", () => {
    expect(categoryFromSubmissionSnapshot(null)).toBeUndefined();
    expect(categoryFromSubmissionSnapshot([])).toBeUndefined();
  });
});

describe("resolvedSubmissionCategory()", () => {
  it("prefers snapshot category over form.category", () => {
    expect(
      resolvedSubmissionCategory(
        { category: "CALIBRATION_INSPECTION" },
        "CLEAR_INSPECTION"
      )
    ).toBe("CALIBRATION_INSPECTION");
  });

  it("falls back to form.category when stub has no category", () => {
    expect(resolvedSubmissionCategory({}, "CLEAR_INSPECTION")).toBe("CLEAR_INSPECTION");
    expect(resolvedSubmissionCategory(null, "CALIBRATION_INSPECTION")).toBe(
      "CALIBRATION_INSPECTION"
    );
  });
});

describe("inspectionTypeCodeForSubmission()", () => {
  it("maps calibration stub even when form is a clear form", () => {
    expect(
      inspectionTypeCodeForSubmission(
        { category: "CALIBRATION_INSPECTION" },
        "CLEAR_INSPECTION"
      )
    ).toBe("CALIBRATION_INSPECTION");
  });

  it("defaults to CLEAR_INSPECTION when neither snapshot nor form has category", () => {
    expect(inspectionTypeCodeForSubmission(null, null)).toBe("CLEAR_INSPECTION");
  });
});

describe("inspectionTypeConnect()", () => {
  it("connects by inspection_types.code", () => {
    expect(inspectionTypeConnect("CALIBRATION_INSPECTION")).toEqual({
      connect: { code: "CALIBRATION_INSPECTION" },
    });
    expect(inspectionTypeConnect(null)).toEqual({
      connect: { code: "CLEAR_INSPECTION" },
    });
  });
});
