import type { UnitCard } from "@/components/projects/UnitCards";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";

export interface MediaBuildingLevel {
  levelKey: string;
  units: UnitCard[];
}

export interface MediaBuildingGroup {
  buildingKey: string;
  levels: MediaBuildingLevel[];
}

export function unitKeysWithMedia(
  keys: readonly string[],
  unitRefsWithMedia: ReadonlySet<string>,
): string[] {
  return keys.filter((key) => unitRefsWithMedia.has(key));
}

export function levelSectionKeysWithMedia(
  building: MediaBuildingGroup,
  customLocsForLevel: (buildingKey: string, levelKey: string) => CustomSiteLocation[],
  levelHasMedia: (units: UnitCard[], customLocs: CustomSiteLocation[]) => boolean,
  toSectionKey: (buildingKey: string, levelKey: string) => string,
): string[] {
  return building.levels
    .filter((lvl) =>
      levelHasMedia(lvl.units, customLocsForLevel(building.buildingKey, lvl.levelKey)),
    )
    .map((lvl) => toSectionKey(building.buildingKey, lvl.levelKey));
}

export interface MediaExpandAllTargets {
  levelKeys: string[];
  unitKeys: string[];
  customBuildingSectionKeys: string[];
  expandStandaloneCustom: boolean;
}

export interface MediaExpandAllContext {
  locationGroups: MediaBuildingGroup[];
  standaloneCustomUnitRefs: readonly string[];
  customLocsForLevel: (buildingKey: string, levelKey: string) => CustomSiteLocation[];
  customLocsForBuilding: (buildingKey: string) => CustomSiteLocation[];
  levelHasMedia: (units: UnitCard[], customLocs: CustomSiteLocation[]) => boolean;
  levelSectionKey: (buildingKey: string, levelKey: string) => string;
  customBuildingSectionKey: (buildingKey: string) => string;
}

/** Keys to expand when opening all locations that have album media. */
export function computeMediaExpandAllTargets(
  ctx: MediaExpandAllContext,
  unitRefsWithMedia: ReadonlySet<string>,
): MediaExpandAllTargets {
  const levelKeys: string[] = [];
  const unitKeys: string[] = [];
  const customBuildingSectionKeys: string[] = [];
  let expandStandaloneCustom = false;

  for (const unitRef of ctx.standaloneCustomUnitRefs) {
    if (!unitRefsWithMedia.has(unitRef)) continue;
    expandStandaloneCustom = true;
    unitKeys.push(unitRef);
  }

  for (const building of ctx.locationGroups) {
    const buildingCustomRefs = ctx
      .customLocsForBuilding(building.buildingKey)
      .map((loc) => loc.unitRef);
    const mediaBuildingCustom = unitKeysWithMedia(buildingCustomRefs, unitRefsWithMedia);
    if (mediaBuildingCustom.length > 0) {
      customBuildingSectionKeys.push(ctx.customBuildingSectionKey(building.buildingKey));
      unitKeys.push(...mediaBuildingCustom);
    }

    levelKeys.push(
      ...levelSectionKeysWithMedia(
        building,
        ctx.customLocsForLevel,
        ctx.levelHasMedia,
        ctx.levelSectionKey,
      ),
    );

    for (const lvl of building.levels) {
      const levelCustomRefs = ctx
        .customLocsForLevel(building.buildingKey, lvl.levelKey)
        .map((loc) => loc.unitRef);
      unitKeys.push(
        ...unitKeysWithMedia(
          [...levelCustomRefs, ...lvl.units.map((unit) => unit.key)],
          unitRefsWithMedia,
        ),
      );
    }
  }

  return {
    levelKeys: [...new Set(levelKeys)],
    unitKeys: [...new Set(unitKeys)],
    customBuildingSectionKeys: [...new Set(customBuildingSectionKeys)],
    expandStandaloneCustom,
  };
}

export interface MediaExpandAllState {
  expandedLevels: ReadonlySet<string>;
  expandedUnits: ReadonlySet<string>;
  expandedCustomBuildingSections: ReadonlySet<string>;
  expandedStandaloneCustom: boolean;
}

/** True when every location with media is expanded. */
export function areAllMediaLocationsExpanded(
  targets: MediaExpandAllTargets,
  state: MediaExpandAllState,
): boolean {
  if (targets.levelKeys.length === 0 && targets.unitKeys.length === 0) {
    return false;
  }
  if (targets.expandStandaloneCustom && !state.expandedStandaloneCustom) {
    return false;
  }
  if (!targets.customBuildingSectionKeys.every((key) => state.expandedCustomBuildingSections.has(key))) {
    return false;
  }
  if (!targets.levelKeys.every((key) => state.expandedLevels.has(key))) {
    return false;
  }
  return targets.unitKeys.every((key) => state.expandedUnits.has(key));
}
