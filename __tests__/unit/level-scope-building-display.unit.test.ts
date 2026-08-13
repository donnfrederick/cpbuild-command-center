import { describe, expect, it } from "vitest";
import {
  formatLevelScopeBuildingHeaderLabel,
  formatLevelScopeBuildingLabel,
  levelScopeBuildingStripeCssVar,
} from "@/lib/reports/level-scope-building-display";

describe("formatLevelScopeBuildingLabel", () => {
  it("prefixes Building when the raw name omits it", () => {
    expect(formatLevelScopeBuildingLabel("1", "Building")).toBe("Building 1");
    expect(formatLevelScopeBuildingLabel("Main", "Building")).toBe("Building Main");
  });

  it("keeps names that already include Building", () => {
    expect(formatLevelScopeBuildingLabel("Building A", "Building")).toBe("Building A");
    expect(formatLevelScopeBuildingLabel("building north", "Building")).toBe("building north");
  });
});

describe("formatLevelScopeBuildingHeaderLabel", () => {
  it("strips a leading Building word for compact header badges", () => {
    expect(formatLevelScopeBuildingHeaderLabel("Building A")).toBe("A");
    expect(formatLevelScopeBuildingHeaderLabel("Building North")).toBe("North");
    expect(formatLevelScopeBuildingHeaderLabel("building south")).toBe("south");
  });

  it("keeps raw names that do not start with Building", () => {
    expect(formatLevelScopeBuildingHeaderLabel("1")).toBe("1");
    expect(formatLevelScopeBuildingHeaderLabel("NORTH")).toBe("NORTH");
  });
});

describe("levelScopeBuildingStripeCssVar", () => {
  it("sets the stripe custom property for themed header chrome", () => {
    expect(levelScopeBuildingStripeCssVar("var(--building-north)")).toEqual({
      "--level-scope-building-stripe": "var(--building-north)",
    });
  });
});
