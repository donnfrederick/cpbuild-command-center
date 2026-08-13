import { describe, expect, it } from "vitest";
import { isProjectLevelUnitRef } from "@/lib/field-notes-scope";

describe("isProjectLevelUnitRef", () => {
  it("matches sentinel project-level refs", () => {
    expect(isProjectLevelUnitRef(null)).toBe(true);
    expect(isProjectLevelUnitRef("")).toBe(true);
    expect(isProjectLevelUnitRef("||")).toBe(true);
    expect(isProjectLevelUnitRef("A|1|101")).toBe(false);
  });
});
