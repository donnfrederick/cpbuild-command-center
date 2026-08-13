/** Shared building/level keys for locations filter — matches UnitCards grid grouping. */

export const UNITS_MISSING_LOCATION_LABEL = "—";

export function sortUnitsLocationLabels(a: string, b: string): number {
  if (a === UNITS_MISSING_LOCATION_LABEL && b !== UNITS_MISSING_LOCATION_LABEL) return 1;
  if (b === UNITS_MISSING_LOCATION_LABEL && a !== UNITS_MISSING_LOCATION_LABEL) return -1;
  return a.localeCompare(b, undefined, { numeric: true });
}

export function unitsBuildingKey(raw: string | null | undefined): string {
  return (raw ?? "").trim() || UNITS_MISSING_LOCATION_LABEL;
}

export function unitsLevelKey(raw: string | null | undefined): string {
  return (raw ?? "").trim() || UNITS_MISSING_LOCATION_LABEL;
}

export function unitsLevelFilterKey(
  building: string | null | undefined,
  level: string | null | undefined,
): string {
  return `${unitsBuildingKey(building)}::${unitsLevelKey(level)}`;
}

export function buildUnitsBuildingLevelFilterOptions(
  cards: Array<{ building?: string | null; level?: string | null }>,
): { buildings: string[]; buildingLevels: Record<string, string[]> } {
  const buildings = new Set<string>();
  const buildingLevels: Record<string, Set<string>> = {};

  for (const card of cards) {
    const bKey = unitsBuildingKey(card.building);
    const lKey = unitsLevelKey(card.level);
    buildings.add(bKey);
    if (!buildingLevels[bKey]) buildingLevels[bKey] = new Set();
    buildingLevels[bKey].add(lKey);
  }

  return {
    buildings: Array.from(buildings).sort(sortUnitsLocationLabels),
    buildingLevels: Object.fromEntries(
      Object.entries(buildingLevels).map(([b, ls]) => [
        b,
        Array.from(ls).sort(sortUnitsLocationLabels),
      ]),
    ),
  };
}
