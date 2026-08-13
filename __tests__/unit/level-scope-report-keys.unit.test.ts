import { describe, expect, it } from "vitest";
import { buildLevelKey } from "@/lib/level-scope-report-keys";

describe("buildLevelKey", () => {
  it("returns level only for single-building projects", () => {
    expect(buildLevelKey("Main", "Level 3", false)).toBe("Level 3");
    expect(buildLevelKey("", "Level 3", false)).toBe("Level 3");
  });

  it("prefixes building when multiple buildings exist", () => {
    expect(buildLevelKey("Building A", "Level 3", true)).toBe("Building A › Level 3");
  });

  it("uses No Level when level is blank", () => {
    expect(buildLevelKey("A", "", false)).toBe("No Level");
  });
});
