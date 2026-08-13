import { describe, expect, it } from "vitest";
import {
  areAllMediaLocationsExpanded,
  computeMediaExpandAllTargets,
  levelSectionKeysWithMedia,
  unitKeysWithMedia,
  type MediaBuildingGroup,
} from "@/lib/media/media-expand-all";
import type { UnitCard } from "@/components/projects/UnitCards";

function card(key: string): UnitCard {
  return {
    key,
    building: "1",
    level: "2",
    unit: key,
    unitType: null,
    rows: [],
  } as UnitCard;
}

describe("media-expand-all", () => {
  it("filters unit keys to those with album coverage", () => {
    const withMedia = new Set(["unit-a", "custom-1"]);
    expect(unitKeysWithMedia(["unit-a", "unit-b", "custom-1"], withMedia)).toEqual([
      "unit-a",
      "custom-1",
    ]);
  });

  it("returns only level section keys where the level has media", () => {
    const building: MediaBuildingGroup = {
      buildingKey: "1",
      levels: [
        { levelKey: "2", units: [card("u-201"), card("u-202")] },
        { levelKey: "3", units: [card("u-301")] },
        { levelKey: "4", units: [card("u-401")] },
      ],
    };
    const withMedia = new Set(["u-201"]);
    const levelHasMedia = (units: UnitCard[]) =>
      units.some((unit) => withMedia.has(unit.key));

    const keys = levelSectionKeysWithMedia(
      building,
      () => [],
      (units, customLocs) =>
        levelHasMedia(units) || customLocs.some((loc) => withMedia.has(loc.unitRef)),
      (buildingKey, levelKey) => `${buildingKey}::${levelKey}`,
    );

    expect(keys).toEqual(["1::2"]);
  });

  it("computes global expand targets for standalone custom and building levels with media", () => {
    const withMedia = new Set(["custom-standalone", "u-201", "building-custom"]);
    const building: MediaBuildingGroup = {
      buildingKey: "North",
      levels: [
        { levelKey: "2", units: [card("u-201"), card("u-202")] },
        { levelKey: "3", units: [card("u-301")] },
      ],
    };
    const customLocsForLevel = () => [];
    const customLocsForBuilding = () =>
      [{ unitRef: "building-custom", name: "Lobby", id: "c1" }] as never[];
    const levelHasMedia = (units: UnitCard[], customLocs: { unitRef: string }[]) =>
      units.some((unit) => withMedia.has(unit.key))
      || customLocs.some((loc) => withMedia.has(loc.unitRef));

    const targets = computeMediaExpandAllTargets(
      {
        locationGroups: [building],
        standaloneCustomUnitRefs: ["custom-standalone", "custom-empty"],
        customLocsForLevel,
        customLocsForBuilding,
        levelHasMedia,
        levelSectionKey: (b, l) => `${b}::${l}`,
        customBuildingSectionKey: (b) => `custom-building::${b}`,
      },
      withMedia,
    );

    expect(targets.expandStandaloneCustom).toBe(true);
    expect(targets.unitKeys).toEqual(
      expect.arrayContaining(["custom-standalone", "u-201", "building-custom"]),
    );
    expect(targets.levelKeys).toEqual(["North::2"]);
    expect(targets.customBuildingSectionKeys).toEqual(["custom-building::North"]);
  });

  it("detects when all media locations are expanded", () => {
    const targets = {
      levelKeys: ["North::2"],
      unitKeys: ["u-201"],
      customBuildingSectionKeys: [],
      expandStandaloneCustom: false,
    };
    expect(
      areAllMediaLocationsExpanded(targets, {
        expandedLevels: new Set(["North::2"]),
        expandedUnits: new Set(["u-201"]),
        expandedCustomBuildingSections: new Set(),
        expandedStandaloneCustom: false,
      }),
    ).toBe(true);
    expect(
      areAllMediaLocationsExpanded(targets, {
        expandedLevels: new Set(),
        expandedUnits: new Set(["u-201"]),
        expandedCustomBuildingSections: new Set(),
        expandedStandaloneCustom: false,
      }),
    ).toBe(false);
  });
});
