import { describe, it, expect } from "vitest";
import {
  customSiteUnitRef,
  customSiteUnitContext,
  customSiteDetailHeaderSegments,
  customSiteMatchesBuildingSection,
  customSiteMatchesLevelSection,
  customSiteLocationNameKey,
  customSiteLocationsShareScope,
  normalizeCustomSiteLocationFields,
  formatCustomSitePlacementLabel,
  isCustomSiteUnitRef,
  parseCustomSiteUnitRef,
  type CustomSiteLocation,
} from "@/lib/custom-site-locations";

const BASE: CustomSiteLocation = {
  id: "loc-1",
  projectId: "proj-1",
  name: "Parking lot",
  building: "North",
  level: "1",
  placement: "building_level",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: { id: "user-1", name: "Hannah" },
  unitRef: "@custom|loc-1|Parking lot",
  observationCount: 0,
  issueCount: 0,
};

describe("custom-site-locations", () => {
  it("customSiteLocationsShareScope distinguishes standalone from building scope", () => {
    expect(
      customSiteLocationsShareScope(
        { placement: "standalone", building: "", level: "" },
        { placement: "building", building: "5A", level: "" },
      ),
    ).toBe(false);
    expect(
      customSiteLocationsShareScope(
        { placement: "building", building: "5A", level: "" },
        { placement: "building", building: "5A", level: "" },
      ),
    ).toBe(true);
  });

  it("customSiteLocationNameKey treats similar prefixes as distinct full names", () => {
    const one = customSiteLocationNameKey("Building B Level One");
    const two = customSiteLocationNameKey("Building B Level Two");
    expect(one).not.toBe(two);
    expect(customSiteLocationNameKey("  BUILDING B   LEVEL ONE  ")).toBe(one);
  });

  it("builds and parses @custom unitRef", () => {
    const ref = customSiteUnitRef({ id: "abc", name: "Dock A" });
    expect(ref).toBe("@custom|abc|Dock A");
    expect(isCustomSiteUnitRef(ref)).toBe(true);
    expect(parseCustomSiteUnitRef(ref)).toEqual({ id: "abc", name: "Dock A" });
  });

  it("rejects non-custom refs", () => {
    expect(isCustomSiteUnitRef("North|2|U101")).toBe(false);
    expect(parseCustomSiteUnitRef("North|2|U101")).toBeNull();
  });

  it("customSiteUnitContext uses location name and unitRef", () => {
    expect(customSiteUnitContext(BASE)).toMatchObject({
      unitKey: "Parking lot",
      unit: "Parking lot",
      building: "North",
      level: "1",
      unitRef: "@custom|loc-1|Parking lot",
    });
  });

  it("customSiteUnitContext clears building and level for standalone", () => {
    expect(
      customSiteUnitContext({
        ...BASE,
        placement: "standalone",
        building: "1",
        level: "2",
      }),
    ).toMatchObject({ building: "", level: "" });
  });

  it("normalizeCustomSiteLocationFields strips building/level for standalone", () => {
    expect(normalizeCustomSiteLocationFields("standalone", "1", "2")).toEqual({
      building: "",
      level: "",
    });
  });

  it("customSiteDetailHeaderSegments returns nothing for standalone", () => {
    expect(
      customSiteDetailHeaderSegments({
        placement: "standalone",
        building: "1",
        level: "2",
      }),
    ).toEqual([]);
  });

  it("formatCustomSitePlacementLabel covers all placements", () => {
    const labels = {
      standalone: "Standalone",
      buildingOnly: (b: string) => `Under ${b}`,
      buildingLevel: (b: string, l: string) => `${b}, ${l}`,
    };
    expect(
      formatCustomSitePlacementLabel(
        { placement: "standalone", building: "", level: "" },
        labels,
      ),
    ).toBe("Standalone");
    expect(
      formatCustomSitePlacementLabel(
        { placement: "building", building: "North", level: "" },
        labels,
      ),
    ).toBe("Under North");
    expect(
      formatCustomSitePlacementLabel(
        { placement: "building_level", building: "North", level: "2" },
        labels,
      ),
    ).toBe("North, 2");
  });

  it("customSiteMatchesLevelSection only matches building_level rows", () => {
    expect(customSiteMatchesLevelSection(BASE, "North", "1")).toBe(true);
    expect(customSiteMatchesLevelSection(BASE, "North", "2")).toBe(false);
    expect(
      customSiteMatchesLevelSection(
        { placement: "building", building: "North", level: "" },
        "North",
        "1",
      ),
    ).toBe(false);
    expect(
      customSiteMatchesLevelSection(
        { placement: "standalone", building: "", level: "" },
        "North",
        "1",
      ),
    ).toBe(false);
  });

  it("customSiteMatchesBuildingSection only matches building placement rows", () => {
    expect(
      customSiteMatchesBuildingSection(
        { placement: "building", building: "1" },
        "1",
      ),
    ).toBe(true);
    expect(
      customSiteMatchesBuildingSection(
        { placement: "building_level", building: "1" },
        "1",
      ),
    ).toBe(false);
    expect(
      customSiteMatchesBuildingSection(
        { placement: "building", building: "2" },
        "1",
      ),
    ).toBe(false);
  });
});
