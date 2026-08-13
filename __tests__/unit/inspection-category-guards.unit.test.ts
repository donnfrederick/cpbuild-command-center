import { describe, it, expect } from "vitest";
import {
  isScopePickerInspectionCategory,
  isUnitLevelInspectionCategory,
} from "@/components/forms/formTypes";

describe("inspection category guards", () => {
  it("treats Gypcrete as unit-level for submission binding", () => {
    expect(isUnitLevelInspectionCategory("GYPCRETE_MOISTURE_TEST")).toBe(true);
  });

  it("allows scope-level categories in the scope picker", () => {
    expect(isScopePickerInspectionCategory("CLEAR_INSPECTION")).toBe(true);
    expect(isScopePickerInspectionCategory("TWO_AREA_CLEAR")).toBe(true);
    expect(isUnitLevelInspectionCategory("CLEAR_INSPECTION")).toBe(false);
  });
});
