import type { UnitCard } from "@/components/projects/UnitCards";
import { EMPTY_ISSUE_META } from "@/components/projects/UnitCards";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import {
  customSiteMatchesBuildingSection,
  customSiteMatchesLevelSection,
  normalizeCustomSiteLocationFields,
} from "@/lib/custom-site-locations";

export const MISSING_LOCATION_LABEL = "—";

function sortLocationKeys(a: string, b: string): number {
  if (a === MISSING_LOCATION_LABEL && b !== MISSING_LOCATION_LABEL) return 1;
  if (b === MISSING_LOCATION_LABEL && a !== MISSING_LOCATION_LABEL) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export interface MediaUnitRow {
  id: string;
  building: string;
  level: string;
  unit: string;
  area: string;
  unitType: string;
  description: string;
  scopeType: UnitCard["scopes"][number]["scopeType"];
}

export interface MediaLocationGroup {
  buildingKey: string;
  levels: { levelKey: string; units: UnitCard[] }[];
}

/** Minimal row → unit cards (media list only — no issue/gypcrete merge). */
export function groupMediaRowsIntoUnitCards(rows: MediaUnitRow[]): UnitCard[] {
  const map = new Map<string, UnitCard>();
  for (const row of rows) {
    const key = `${row.building}|${row.level}|${row.unit}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        building: row.building,
        level: row.level,
        unit: row.unit,
        area: row.area,
        buildPhase: "",
        unitType: row.unitType,
        scopes: [],
        issueMeta: EMPTY_ISSUE_META,
        locationType: null,
      });
    }
    map.get(key)!.scopes.push({
      id: row.id,
      scopeType: row.scopeType,
      description: row.description,
      qty: null,
      uom: null,
      percentComplete: null,
      installer: null,
      unifierSubId: null,
      shipPhase: "",
      buildPhase: "",
      area: row.area,
      scopeStage: "INSTALL",
      scopeStatus: "NOT_STARTED",
      inspectionStatus: null,
      subScopeInstances: [],
      clearInspection: null,
    });
  }
  return Array.from(map.values());
}

export function buildMediaLocationGroups(cards: UnitCard[]): MediaLocationGroup[] {
  const buildings = Array.from(
    new Set(cards.map((c) => (c.building ?? "").trim() || MISSING_LOCATION_LABEL)),
  ).sort(sortLocationKeys);

  return buildings.map((buildingKey) => {
    const inBuilding = cards.filter(
      (c) => ((c.building ?? "").trim() || MISSING_LOCATION_LABEL) === buildingKey,
    );
    const levels = Array.from(
      new Set(inBuilding.map((c) => (c.level ?? "").trim() || MISSING_LOCATION_LABEL)),
    ).sort(sortLocationKeys);

    return {
      buildingKey,
      levels: levels.map((levelKey) => ({
        levelKey,
        units: inBuilding
          .filter((c) => ((c.level ?? "").trim() || MISSING_LOCATION_LABEL) === levelKey)
          .sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true, sensitivity: "base" })),
      })),
    };
  });
}

/** Unique scope type codes (fallback to name) for compact unit row subtitle. */
export function scopeLabelsForUnitCard(card: UnitCard): string[] {
  const labels = new Set<string>();
  for (const scope of card.scopes) {
    const code = scope.scopeType?.code?.trim();
    const name = scope.scopeType?.name?.trim();
    if (code) labels.add(code);
    else if (name) labels.add(name);
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}

export function formatLocationLabel(key: string): string {
  return key === MISSING_LOCATION_LABEL ? "—" : key;
}

const BUILDING_STRIPE_PALETTE = [
  "var(--building-north)",
  "var(--building-south)",
  "var(--building-east)",
  "var(--building-west)",
  "var(--building-a)",
  "var(--building-b)",
  "var(--building-c)",
  "var(--building-d)",
] as const;

const BUILDING_NAME_COLOR_MAP: Record<string, (typeof BUILDING_STRIPE_PALETTE)[number]> = {
  north: "var(--building-north)",
  south: "var(--building-south)",
  east: "var(--building-east)",
  west: "var(--building-west)",
  "bldg a": "var(--building-a)",
  "building a": "var(--building-a)",
  a: "var(--building-a)",
  "bldg b": "var(--building-b)",
  "building b": "var(--building-b)",
  b: "var(--building-b)",
  "bldg c": "var(--building-c)",
  "building c": "var(--building-c)",
  c: "var(--building-c)",
  "bldg d": "var(--building-d)",
  "building d": "var(--building-d)",
  d: "var(--building-d)",
};

function normalizeBuildingColorKey(buildingKey: string): string {
  return buildingKey.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Sorted unique building keys (same order as buildMediaLocationGroups). */
export function orderedBuildingKeysFromCards(cards: UnitCard[]): string[] {
  const keys = new Set<string>();
  for (const card of cards) {
    keys.add((card.building ?? "").trim() || MISSING_LOCATION_LABEL);
  }
  return Array.from(keys).sort(sortLocationKeys);
}

export function buildingStripeForKey(buildingKey: string, orderedBuildingKeys: string[]): string {
  const key = (buildingKey ?? "").trim() || MISSING_LOCATION_LABEL;
  if (key === MISSING_LOCATION_LABEL) return "var(--neutral-300)";
  const namedColor = BUILDING_NAME_COLOR_MAP[normalizeBuildingColorKey(key)];
  if (namedColor) return namedColor;
  const idx = orderedBuildingKeys.indexOf(key);
  return BUILDING_STRIPE_PALETTE[(idx >= 0 ? idx : 0) % BUILDING_STRIPE_PALETTE.length];
}

export function buildingLabelTextColor(stripe: string): string {
  return stripe === "var(--building-c)" ? "var(--color-text-primary)" : "var(--color-text-inverse)";
}

/** Custom site areas scoped to the project (not under a building/level row). */
export function standaloneCustomSiteLocations(
  locations: CustomSiteLocation[],
): CustomSiteLocation[] {
  return locations.filter((loc) => loc.placement === "standalone");
}

export function customSiteLocationsForBuilding(
  locations: CustomSiteLocation[],
  buildingKey: string,
): CustomSiteLocation[] {
  return locations.filter((loc) => customSiteMatchesBuildingSection(loc, buildingKey));
}

export function customSiteLocationsForLevel(
  locations: CustomSiteLocation[],
  buildingKey: string,
  levelKey: string,
): CustomSiteLocation[] {
  if (buildingKey === MISSING_LOCATION_LABEL) return [];
  return locations.filter((loc) => customSiteMatchesLevelSection(loc, buildingKey, levelKey));
}

export function filterCustomSiteLocationsForSearch(
  locations: CustomSiteLocation[],
  query: string,
): CustomSiteLocation[] {
  const q = query.trim().toLowerCase();
  if (!q) return locations;
  return locations.filter((loc) => {
    const haystack = [loc.name, loc.building, loc.level].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

/** Minimal unit card for custom-site rows on the media list. */
export function customSiteLocationToMediaCard(location: CustomSiteLocation): UnitCard {
  const { building, level } = normalizeCustomSiteLocationFields(
    location.placement,
    location.building,
    location.level,
  );
  return {
    key: location.unitRef,
    building,
    level,
    unit: location.name,
    area: "",
    buildPhase: "",
    unitType: "",
    scopes: [],
    issueMeta: EMPTY_ISSUE_META,
    locationType: null,
  };
}
