import { isCustomSiteUnitRef } from "@/lib/custom-site-locations";
import { isProjectLevelUnitRef } from "@/lib/field-notes-scope";

export type FieldNotesLocationLevel = "project" | "building" | "level" | "unit";

export interface ParsedFieldNotesLocation {
  level: FieldNotesLocationLevel;
  building: string;
  /** Middle segment of unitRef (building|level|unit). */
  floorLevel: string;
  unit: string;
  /** True when unitRef is a custom site location — not editable as UPM hierarchy. */
  isCustomSite: boolean;
}

/** Parse a field-notes `unitRef` into location level + segments. */
export function parseFieldNotesLocation(
  unitRef: string | null | undefined,
): ParsedFieldNotesLocation {
  if (isCustomSiteUnitRef(unitRef)) {
    return {
      level: "unit",
      building: "",
      floorLevel: "",
      unit: "",
      isCustomSite: true,
    };
  }

  if (isProjectLevelUnitRef(unitRef)) {
    return {
      level: "project",
      building: "",
      floorLevel: "",
      unit: "",
      isCustomSite: false,
    };
  }

  const parts = (unitRef ?? "").split("|");
  const building = parts[0] ?? "";
  const floorLevel = parts[1] ?? "";
  const unit = parts[2] ?? "";

  if (!building) {
    return { level: "project", building: "", floorLevel: "", unit: "", isCustomSite: false };
  }
  if (!floorLevel) {
    return { level: "building", building, floorLevel: "", unit: "", isCustomSite: false };
  }
  if (!unit) {
    return { level: "level", building, floorLevel, unit: "", isCustomSite: false };
  }
  return { level: "unit", building, floorLevel, unit, isCustomSite: false };
}

/** Build the persisted `unitRef` string from editor state. */
export function buildFieldNotesUnitRef(input: {
  level: FieldNotesLocationLevel;
  building?: string;
  floorLevel?: string;
  unit?: string;
}): string | null {
  switch (input.level) {
    case "project":
      return "||";
    case "building":
      return `${input.building?.trim() ?? ""}||`;
    case "level":
      return `${input.building?.trim() ?? ""}|${input.floorLevel?.trim() ?? ""}|`;
    case "unit":
      return `${input.building?.trim() ?? ""}|${input.floorLevel?.trim() ?? ""}|${input.unit?.trim() ?? ""}`;
    default:
      return "||";
  }
}

/** Normalize API/storage unitRef (empty → project sentinel). */
export function normalizeFieldNotesUnitRef(unitRef: string | null | undefined): string | null {
  if (unitRef == null || unitRef === "" || unitRef === "||") return null;
  return unitRef;
}

export interface FieldNotesLocationMatrix {
  buildings: string[];
  levelsByBuilding: Record<string, string[]>;
  unitsByBuildingLevel: Record<string, string[]>;
}

/** Build a compact location hierarchy from raw project row triples. */
export function buildFieldNotesLocationMatrix(
  rows: Array<{ building: string; level: string; unit: string }>,
): FieldNotesLocationMatrix {
  const buildingSet = new Set<string>();
  const levelsByBuilding = new Map<string, Set<string>>();
  const unitsByBuildingLevel = new Map<string, Set<string>>();

  for (const row of rows) {
    const building = row.building.trim();
    const level = row.level.trim();
    const unit = row.unit.trim();
    if (!building) continue;

    buildingSet.add(building);

    if (level) {
      const levelSet = levelsByBuilding.get(building) ?? new Set<string>();
      levelSet.add(level);
      levelsByBuilding.set(building, levelSet);
    }

    if (level && unit) {
      const key = `${building}|${level}`;
      const unitSet = unitsByBuildingLevel.get(key) ?? new Set<string>();
      unitSet.add(unit);
      unitsByBuildingLevel.set(key, unitSet);
    }
  }

  const sortAlpha = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

  return {
    buildings: [...buildingSet].sort(sortAlpha),
    levelsByBuilding: Object.fromEntries(
      [...levelsByBuilding.entries()].map(([b, levels]) => [b, [...levels].sort(sortAlpha)]),
    ),
    unitsByBuildingLevel: Object.fromEntries(
      [...unitsByBuildingLevel.entries()].map(([k, units]) => [k, [...units].sort(sortAlpha)]),
    ),
  };
}
