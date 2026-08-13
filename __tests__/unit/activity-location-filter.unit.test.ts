import { describe, expect, it } from "vitest";
import { buildActivityLocationWhere } from "@/lib/activity-location-filter";

describe("buildActivityLocationWhere", () => {
  it("preserves empty level placeholders when matching unitRef", () => {
    const where = buildActivityLocationWhere({ building: "A", unit: "101" });

    expect(JSON.stringify(where)).toContain("A||101");
  });

  it("matches unitRef prefixes for building and level filters without unit", () => {
    const buildingWhere = buildActivityLocationWhere({ building: "A" });
    const levelWhere = buildActivityLocationWhere({ building: "A", level: "1" });

    expect(JSON.stringify(buildingWhere)).toContain("A|");
    expect(JSON.stringify(levelWhere)).toContain("A|1|");
  });
});
