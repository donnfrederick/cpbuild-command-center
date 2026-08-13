import type { AlbumItem, AlbumSourceType } from "@/lib/media/album-types";
import type { LocationKindFilter } from "@/lib/location-kind-filter";
import type { MediaBuildingGroup } from "@/lib/media/media-expand-all";

export const MEDIA_SOURCE_FILTER_KEYS = [
  "observation",
  "issue",
  "inspection",
  "general",
  "status_update",
] as const;

export type MediaSourceFilterKey = (typeof MEDIA_SOURCE_FILTER_KEYS)[number];

/** Album strip source badges — finer-grained than media type groups. */
export const ALBUM_SOURCE_TAG_KEYS = [
  "observation",
  "observation_comment",
  "issue",
  "issue_comment",
  "inspection",
  "general",
  "status_update",
] as const satisfies readonly AlbumSourceType[];

export interface MediaLocationFilterOptions {
  buildings: string[];
  buildingLevels: Record<string, string[]>;
}

export interface MediaActiveFilters {
  buildings: string[];
  levels: string[];
  locationKinds: LocationKindFilter[];
  mediaSourceTypes: MediaSourceFilterKey[];
  albumSourceTags: AlbumSourceType[];
}

export const EMPTY_MEDIA_FILTERS: MediaActiveFilters = {
  buildings: [],
  levels: [],
  locationKinds: [],
  mediaSourceTypes: [],
  albumSourceTags: [],
};

export function activeMediaFilterCount(filters: MediaActiveFilters): number {
  return (
    filters.buildings.length +
    filters.levels.length +
    filters.locationKinds.length +
    filters.mediaSourceTypes.length +
    filters.albumSourceTags.length
  );
}

export function albumSourceToFilterKey(sourceType: AlbumSourceType): MediaSourceFilterKey {
  switch (sourceType) {
    case "observation":
    case "observation_comment":
      return "observation";
    case "issue":
    case "issue_comment":
      return "issue";
    case "inspection":
      return "inspection";
    case "status_update":
      return "status_update";
    default:
      return "general";
  }
}

export type MediaSourceFilterSelection = Pick<
  MediaActiveFilters,
  "mediaSourceTypes" | "albumSourceTags"
>;

export function albumSourceMatchesMediaFilters(
  sourceType: AlbumSourceType,
  filters: MediaSourceFilterSelection,
): boolean {
  const tagMatch =
    filters.albumSourceTags.length === 0 || filters.albumSourceTags.includes(sourceType);
  const groupMatch =
    filters.mediaSourceTypes.length === 0
    || filters.mediaSourceTypes.includes(albumSourceToFilterKey(sourceType));
  return tagMatch && groupMatch;
}

/** @deprecated Use albumSourceMatchesMediaFilters */
export function albumSourceMatchesMediaFilter(
  sourceType: AlbumSourceType,
  mediaSourceTypes: MediaSourceFilterKey[],
): boolean {
  return albumSourceMatchesMediaFilters(sourceType, {
    mediaSourceTypes,
    albumSourceTags: [],
  });
}

export function unitRefMatchesMediaFilters(
  unitRef: string,
  sourceTypesByUnitRef: Record<string, AlbumSourceType[]>,
  filters: MediaSourceFilterSelection,
): boolean {
  if (filters.albumSourceTags.length === 0 && filters.mediaSourceTypes.length === 0) {
    return true;
  }
  const types = sourceTypesByUnitRef[unitRef] ?? [];
  return types.some((type) => albumSourceMatchesMediaFilters(type, filters));
}

/** @deprecated Use unitRefMatchesMediaFilters */
export function unitRefMatchesMediaSourceFilters(
  unitRef: string,
  sourceTypesByUnitRef: Record<string, AlbumSourceType[]>,
  mediaSourceTypes: MediaSourceFilterKey[],
): boolean {
  return unitRefMatchesMediaFilters(unitRef, sourceTypesByUnitRef, {
    mediaSourceTypes,
    albumSourceTags: [],
  });
}

export function filterAlbumItemsByMediaFilters(
  items: AlbumItem[],
  filters: MediaSourceFilterSelection,
): AlbumItem[] {
  if (filters.albumSourceTags.length === 0 && filters.mediaSourceTypes.length === 0) {
    return items;
  }
  return items.filter((item) => albumSourceMatchesMediaFilters(item.source.type, filters));
}

/** @deprecated Use filterAlbumItemsByMediaFilters */
export function filterAlbumItemsByMediaSource(
  items: AlbumItem[],
  mediaSourceTypes: MediaSourceFilterKey[],
): AlbumItem[] {
  return filterAlbumItemsByMediaFilters(items, {
    mediaSourceTypes,
    albumSourceTags: [],
  });
}

export function filterLocationGroupsForMediaFilters(
  groups: MediaBuildingGroup[],
  filters: Pick<MediaActiveFilters, "buildings" | "levels">,
): MediaBuildingGroup[] {
  const { buildings, levels } = filters;
  if (buildings.length === 0 && levels.length === 0) return groups;

  return groups
    .map((group) => {
      if (buildings.includes(group.buildingKey)) return group;

      const selectedLevelsInBuilding = levels
        .filter((levelKey) => levelKey.startsWith(`${group.buildingKey}::`))
        .map((levelKey) => levelKey.split("::")[1] ?? "");

      if (selectedLevelsInBuilding.length > 0) {
        const filteredLevels = group.levels.filter((level) =>
          selectedLevelsInBuilding.includes(level.levelKey),
        );
        return filteredLevels.length > 0 ? { ...group, levels: filteredLevels } : null;
      }

      if (buildings.length > 0 || levels.length > 0) return null;
      return group;
    })
    .filter((group): group is MediaBuildingGroup => group != null);
}

export function standaloneCustomVisibleForMediaFilters(
  filters: Pick<MediaActiveFilters, "buildings" | "levels">,
): boolean {
  return filters.buildings.length === 0 && filters.levels.length === 0;
}
