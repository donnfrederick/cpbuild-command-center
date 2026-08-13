import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import {
  customSiteLocationsForBuilding,
  customSiteLocationsForLevel,
  type MediaLocationGroup,
} from "@/lib/media/media-location-list";
import type { MediaExportLocationEntry } from "@/lib/media/media-export-types";
import { standaloneCustomVisibleForMediaFilters } from "@/lib/media/media-filters";
import type { MediaActiveFilters } from "@/lib/media/media-filters";
import type { UnitCard } from "@/components/projects/UnitCards";
import { cardLocationBuilderFields } from "@/lib/location-builder-display";

export interface BuildMediaExportLocationsOptions {
  standaloneCustomLocs: CustomSiteLocation[];
  locationGroups: MediaLocationGroup[];
  displayCustomLocations: CustomSiteLocation[];
  filters: MediaActiveFilters;
  applyMediaVisibility: (unitRef: string) => boolean;
  buildingDisplayLabel: (buildingKey: string) => string;
  levelDisplayLabel: (levelKey: string) => string;
}

/** Ordered location list matching the on-screen media hierarchy (for PDF export). */
export function buildMediaExportLocations(
  opts: BuildMediaExportLocationsOptions,
): MediaExportLocationEntry[] {
  const {
    standaloneCustomLocs,
    locationGroups,
    displayCustomLocations,
    filters,
    applyMediaVisibility,
    buildingDisplayLabel,
    levelDisplayLabel,
  } = opts;

  const entries: MediaExportLocationEntry[] = [];

  if (standaloneCustomVisibleForMediaFilters(filters)) {
    for (const loc of standaloneCustomLocs) {
      if (!applyMediaVisibility(loc.unitRef)) continue;
      entries.push({
        unitRef: loc.unitRef,
        label: loc.name,
        kind: "standalone_custom",
      });
    }
  }

  for (const building of locationGroups) {
    const buildingLabel = buildingDisplayLabel(building.buildingKey);

    const buildingCustomLocs = customSiteLocationsForBuilding(
      displayCustomLocations,
      building.buildingKey,
    );
    for (const loc of buildingCustomLocs) {
      if (!applyMediaVisibility(loc.unitRef)) continue;
      entries.push({
        unitRef: loc.unitRef,
        label: loc.name,
        kind: "building_custom",
        buildingKey: building.buildingKey,
        buildingLabel,
      });
    }

    for (const level of building.levels) {
      const levelLabel = levelDisplayLabel(level.levelKey);

      const levelCustomLocs = customSiteLocationsForLevel(
        displayCustomLocations,
        building.buildingKey,
        level.levelKey,
      );
      for (const loc of levelCustomLocs) {
        if (!applyMediaVisibility(loc.unitRef)) continue;
        entries.push({
          unitRef: loc.unitRef,
          label: loc.name,
          kind: "building_custom",
          buildingKey: building.buildingKey,
          levelKey: level.levelKey,
          buildingLabel,
          levelLabel,
        });
      }

      for (const card of level.units) {
        if (!applyMediaVisibility(card.key)) continue;
        entries.push(locationEntryFromUnitCard(card, building.buildingKey, level.levelKey, buildingLabel, levelLabel));
      }
    }
  }

  return entries;
}

function locationEntryFromUnitCard(
  card: UnitCard,
  buildingKey: string,
  levelKey: string,
  buildingLabel: string,
  levelLabel: string,
): MediaExportLocationEntry {
  const { area, buildPhase } = cardLocationBuilderFields(card);
  return {
    unitRef: card.key,
    label: card.unit,
    kind: "unit",
    buildingKey,
    levelKey,
    buildingLabel,
    levelLabel,
    area: area || null,
    buildPhase: buildPhase || null,
  };
}
