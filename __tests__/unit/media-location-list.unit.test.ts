import { describe, it, expect } from "vitest";
import { EMPTY_ISSUE_META, type UnitCard } from "@/components/projects/UnitCards";
import {
  buildMediaLocationGroups,
  buildingStripeForKey,
  customSiteLocationToMediaCard,
  customSiteLocationsForBuilding,
  customSiteLocationsForLevel,
  filterCustomSiteLocationsForSearch,
  groupMediaRowsIntoUnitCards,
  scopeLabelsForUnitCard,
  standaloneCustomSiteLocations,
} from "@/lib/media/media-location-list";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";

const baseCard: UnitCard = {
  key: "B|2|203",
  building: "Phase 1",
  level: "2",
  unit: "203",
  area: "",
  buildPhase: "",
  unitType: "Studio",
  scopes: [
    {
      id: "row-1",
      scopeType: { id: "st1", code: "CAB", name: "Cabinetry", canonicalScopeType: null },
      description: "Cabinetry",
      qty: null,
      uom: null,
      percentComplete: null,
      installer: null,
      unifierSubId: null,
      shipPhase: "",
      buildPhase: "",
      area: "",
      scopeStage: "INSTALL",
      scopeStatus: "NOT_STARTED",
      inspectionStatus: null,
      subScopeInstances: [],
      clearInspection: null,
    },
    {
      id: "row-2",
      scopeType: { id: "st2", code: "TIL", name: "Tile", canonicalScopeType: null },
      description: "Tile",
      qty: null,
      uom: null,
      percentComplete: null,
      installer: null,
      unifierSubId: null,
      shipPhase: "",
      buildPhase: "",
      area: "",
      scopeStage: "INSTALL",
      scopeStatus: "NOT_STARTED",
      inspectionStatus: null,
      subScopeInstances: [],
      clearInspection: null,
    },
  ],
  issueMeta: EMPTY_ISSUE_META,
  locationType: null,
};

describe("scopeLabelsForUnitCard()", () => {
  it("returns unique scope type codes sorted", () => {
    expect(scopeLabelsForUnitCard(baseCard)).toEqual(["CAB", "TIL"]);
  });
});

describe("buildMediaLocationGroups()", () => {
  it("groups units under building and level", () => {
    const groups = buildMediaLocationGroups([
      baseCard,
      { ...baseCard, key: "B|2|204", unit: "204" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].levels).toHaveLength(1);
    expect(groups[0].levels[0].units).toHaveLength(2);
  });
});

describe("buildingStripeForKey()", () => {
  it("returns palette color for known building names", () => {
    expect(buildingStripeForKey("North", ["North"])).toBe("var(--building-north)");
  });

  it("cycles palette for unknown building names", () => {
    expect(buildingStripeForKey("Tower 9", ["Tower 9", "Tower 10"])).not.toBe(
      buildingStripeForKey("Tower 10", ["Tower 9", "Tower 10"]),
    );
  });
});

describe("groupMediaRowsIntoUnitCards()", () => {
  it("merges scope rows into one unit card", () => {
    const cards = groupMediaRowsIntoUnitCards([
      {
        id: "r1",
        building: "Phase 1",
        level: "2",
        unit: "203",
        area: "",
        unitType: "Studio",
        description: "Cabinetry",
        scopeType: { id: "st1", code: "CAB", name: "Cabinetry", canonicalScopeType: null },
      },
      {
        id: "r2",
        building: "Phase 1",
        level: "2",
        unit: "203",
        area: "",
        unitType: "Studio",
        description: "Tile",
        scopeType: { id: "st2", code: "TIL", name: "Tile", canonicalScopeType: null },
      },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].scopes).toHaveLength(2);
  });
});

const customLoc = (overrides: Partial<CustomSiteLocation> = {}): CustomSiteLocation => ({
  id: "csl-1",
  projectId: "proj-1",
  name: "Parking Lot",
  building: "",
  level: "",
  placement: "standalone",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: { id: "u1", name: "Tester" },
  unitRef: "@custom|csl-1|Parking Lot",
  observationCount: 0,
  issueCount: 0,
  ...overrides,
});

describe("custom site media helpers", () => {
  it("filters standalone custom locations for the project-wide section", () => {
    const rows = standaloneCustomSiteLocations([
      customLoc(),
      customLoc({
        id: "csl-2",
        name: "Dock",
        placement: "building_level",
        building: "North",
        level: "1",
        unitRef: "@custom|csl-2|Dock",
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Parking Lot");
  });

  it("maps custom locations into media cards keyed by unitRef", () => {
    const card = customSiteLocationToMediaCard(
      customLoc({
        placement: "building_level",
        building: "North",
        level: "2",
      }),
    );
    expect(card.key).toBe("@custom|csl-1|Parking Lot");
    expect(card.unit).toBe("Parking Lot");
    expect(card.building).toBe("North");
    expect(card.level).toBe("2");
  });

  it("filters custom locations by search query", () => {
    const rows = filterCustomSiteLocationsForSearch(
      [customLoc(), customLoc({ id: "csl-2", name: "Loading Dock", unitRef: "@custom|csl-2|Loading Dock" })],
      "dock",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Loading Dock");
  });

  it("groups building-level and level-scoped custom locations", () => {
    const buildingRows = customSiteLocationsForBuilding(
      [
        customLoc({ placement: "building", building: "North", unitRef: "@custom|b|North Dock" }),
        customLoc({ placement: "standalone" }),
      ],
      "North",
    );
    expect(buildingRows).toHaveLength(1);

    const levelRows = customSiteLocationsForLevel(
      [
        customLoc({
          placement: "building_level",
          building: "North",
          level: "2",
          unitRef: "@custom|l|Level Dock",
        }),
      ],
      "North",
      "2",
    );
    expect(levelRows).toHaveLength(1);
  });
});
