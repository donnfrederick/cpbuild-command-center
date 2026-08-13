import { describe, it, expect } from "vitest";
import {
  formatInspectionBuildingLevelLabel,
  formatInspectionDateLabel,
  formatInspectionLocationLabel,
  formatInspectionUnitTitle,
} from "@/lib/inspections/inspectionHeaderUtils";

describe("formatInspectionBuildingLevelLabel()", () => {
  it("formats building and level without unit", () => {
    expect(
      formatInspectionBuildingLevelLabel({ building: "1", level: "3", unit: "303" }),
    ).toBe("Bldg 1 · Level 3");
  });
});

describe("formatInspectionUnitTitle()", () => {
  it("returns Unit label from parts", () => {
    expect(formatInspectionUnitTitle({ unit: "303" })).toBe("Unit 303");
  });

  it("falls back to title when unit is missing", () => {
    expect(formatInspectionUnitTitle({}, "Clear Inspection-CABINETS")).toBe(
      "Clear Inspection-CABINETS",
    );
  });
});

describe("formatInspectionLocationLabel()", () => {
  it("formats building, level, and unit", () => {
    expect(
      formatInspectionLocationLabel({ building: "1", level: "3", unit: "303" }),
    ).toBe("Bldg 1 · Level 3 · Unit 303");
  });

  it("returns undefined when all parts are empty", () => {
    expect(formatInspectionLocationLabel({ building: "", level: "", unit: "" })).toBeUndefined();
  });
});

describe("formatInspectionDateLabel()", () => {
  it("returns undefined for invalid iso", () => {
    expect(formatInspectionDateLabel("not-a-date")).toBeUndefined();
  });
});
