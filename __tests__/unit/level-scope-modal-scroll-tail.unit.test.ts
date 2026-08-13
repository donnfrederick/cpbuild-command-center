import { describe, expect, it } from "vitest";
import { computeLevelScopeModalScrollTailPadding } from "@/lib/reports/level-scope-modal-scroll-tail";

describe("computeLevelScopeModalScrollTailPadding()", () => {
  it("returns 0 when the last building section already fills the viewport", () => {
    expect(computeLevelScopeModalScrollTailPadding(600, 80, 520, 48)).toBe(0);
    expect(computeLevelScopeModalScrollTailPadding(600, 80, 600, 0)).toBe(0);
  });

  it("adds tail padding when the last section is shorter than the viewport", () => {
    expect(computeLevelScopeModalScrollTailPadding(600, 80, 280, 48)).toBe(192);
  });

  it("returns 0 for non-positive viewport height", () => {
    expect(computeLevelScopeModalScrollTailPadding(0, 80, 280, 48)).toBe(0);
  });
});
