import { describe, expect, it } from "vitest";
import {
  buildUnitsBuildingLevelFilterOptions,
  sortUnitsLocationLabels,
  unitsLevelFilterKey,
} from "@/lib/units-location-filter-options";

describe("units-location-filter-options", () => {
  it("sorts level labels numerically", () => {
    expect(["10", "2", "19", "3"].sort(sortUnitsLocationLabels)).toEqual([
      "2",
      "3",
      "10",
      "19",
    ]);
  });

  it("groups levels under each building for the filter", () => {
    const { buildings, buildingLevels } = buildUnitsBuildingLevelFilterOptions([
      { building: "North", level: "2" },
      { building: "North", level: "10" },
      { building: "South", level: "1" },
      { building: "", level: "3" },
    ]);

    expect(buildings).toEqual(["North", "South", "—"]);
    expect(buildingLevels.North).toEqual(["2", "10"]);
    expect(buildingLevels.South).toEqual(["1"]);
    expect(buildingLevels["—"]).toEqual(["3"]);
  });

  it("builds stable level filter keys", () => {
    expect(unitsLevelFilterKey("North", "2")).toBe("North::2");
    expect(unitsLevelFilterKey("", "3")).toBe("—::3");
  });
});
