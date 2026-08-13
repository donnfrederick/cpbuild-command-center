export const LOCATION_KIND_FILTERS = ["common_areas", "custom_locations", "units"] as const;
export type LocationKindFilter = (typeof LOCATION_KIND_FILTERS)[number];

export interface LocationKindFilterState {
  locationKinds?: LocationKindFilter[];
}

/** Custom site sections render when no kind filter is set, or custom locations is included. */
export function shouldShowCustomSiteLocations(filters: LocationKindFilterState): boolean {
  const kinds = filters.locationKinds ?? [];
  if (kinds.length === 0) return true;
  return kinds.includes("custom_locations");
}

export function cardMatchesLocationKindFilters(
  isCommonArea: boolean,
  filters: LocationKindFilterState,
): boolean {
  const kinds = filters.locationKinds ?? [];
  if (kinds.length === 0) return true;
  if (isCommonArea) return kinds.includes("common_areas");
  return kinds.includes("units");
}
