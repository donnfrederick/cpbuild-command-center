import { describe, it, expect } from "vitest";
import {
  INSPECTION_CATEGORIES,
  USER_STARTABLE_INSPECTION_CATEGORIES,
} from "@/components/forms/formTypes";

describe("USER_STARTABLE_INSPECTION_CATEGORIES", () => {
  it("excludes calibration — calibrations reuse a prior inspection form", () => {
    expect(USER_STARTABLE_INSPECTION_CATEGORIES).not.toContain("CALIBRATION_INSPECTION");
  });

  it("includes every other inspection category", () => {
    const expected = INSPECTION_CATEGORIES.filter((c) => c !== "CALIBRATION_INSPECTION");
    expect(USER_STARTABLE_INSPECTION_CATEGORIES).toEqual(expected);
  });
});
