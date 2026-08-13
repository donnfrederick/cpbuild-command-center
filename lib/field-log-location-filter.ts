import {
  buildUnitsBuildingLevelFilterOptions,
  UNITS_MISSING_LOCATION_LABEL,
  unitsBuildingKey,
  unitsLevelFilterKey,
} from "@/lib/units-location-filter-options";

export function fieldLogLocationFieldsFromUnitRef(
  unitRef: string | null | undefined,
): { building: string | null; level: string | null } {
  if (!unitRef || unitRef === "||") {
    return { building: null, level: null };
  }
  const parts = unitRef.split("|");
  const building = (parts[0] ?? "").trim() || null;
  const level = (parts[1] ?? "").trim() || null;
  return { building, level };
}

export function matchesFieldLogLocationFilter(
  unitRef: string | null | undefined,
  selectedBuildings: readonly string[],
  selectedLevels: readonly string[],
): boolean {
  if (selectedBuildings.length === 0 && selectedLevels.length === 0) return true;
  const { building, level } = fieldLogLocationFieldsFromUnitRef(unitRef);
  const buildingKey = unitsBuildingKey(building);
  const levelKey = unitsLevelFilterKey(building, level);
  return selectedBuildings.includes(buildingKey) || selectedLevels.includes(levelKey);
}

export function buildFieldLogLocationFilterOptions(
  items: readonly { unitRef?: string | null }[],
) {
  return buildUnitsBuildingLevelFilterOptions(
    items.map((item) => fieldLogLocationFieldsFromUnitRef(item.unitRef)),
  );
}

export function fieldLogLocationFilterActiveCount(
  selectedBuildings: readonly string[],
  selectedLevels: readonly string[],
): number {
  return selectedBuildings.length + selectedLevels.length;
}

export function fieldLogLocationFilterSummary(
  selectedBuildings: readonly string[],
  selectedLevels: readonly string[],
): string | null {
  if (selectedBuildings.length === 0 && selectedLevels.length === 0) return null;
  const parts: string[] = [];
  if (selectedBuildings.length > 0) {
    parts.push(`${selectedBuildings.length} building${selectedBuildings.length === 1 ? "" : "s"}`);
  }
  if (selectedLevels.length > 0) {
    parts.push(`${selectedLevels.length} level${selectedLevels.length === 1 ? "" : "s"}`);
  }
  return `Location: ${parts.join(", ")}`;
}

type UnitRefFilterClause =
  | { unitRef: string | null }
  | { unitRef: { startsWith: string } }
  | { OR: Array<{ unitRef: string | null }> };

export type FieldLogLocationUnitRefWhere = {
  OR: UnitRefFilterClause[];
};

function buildingUnitRefOrClauses(buildingKey: string): UnitRefFilterClause[] {
  if (buildingKey === UNITS_MISSING_LOCATION_LABEL || buildingKey === "project") {
    return [{ OR: [{ unitRef: null }, { unitRef: "" }, { unitRef: "||" }] }];
  }
  return [{ unitRef: { startsWith: `${buildingKey}|` } }, { unitRef: buildingKey }];
}

function levelUnitRefOrClauses(
  buildingKey: string,
  levelPart: string,
): UnitRefFilterClause[] {
  if (buildingKey === UNITS_MISSING_LOCATION_LABEL) {
    return [
      { unitRef: { startsWith: `|${levelPart}|` } },
      { unitRef: `|${levelPart}` },
      { unitRef: `|${levelPart}|` },
    ];
  }
  const prefix = `${buildingKey}|${levelPart}`;
  return [
    { unitRef: prefix },
    { unitRef: `${prefix}|` },
    { unitRef: { startsWith: `${prefix}|` } },
  ];
}

/** Prisma unitRef filter for issues/observations PDF export — mirrors client-side hierarchy matching. */
export function buildFieldLogLocationUnitRefWhere(
  buildings: readonly string[] = [],
  levels: readonly string[] = [],
): FieldLogLocationUnitRefWhere | undefined {
  if (buildings.length === 0 && levels.length === 0) return undefined;

  const orClauses: UnitRefFilterClause[] = [];

  for (const buildingKey of buildings) {
    orClauses.push(...buildingUnitRefOrClauses(buildingKey));
  }

  for (const levelKey of levels) {
    const sep = levelKey.indexOf("::");
    if (sep === -1) continue;
    const buildingKey = levelKey.slice(0, sep);
    const levelPart = levelKey.slice(sep + 2);
    orClauses.push(...levelUnitRefOrClauses(buildingKey, levelPart));
  }

  return { OR: orClauses };
}
