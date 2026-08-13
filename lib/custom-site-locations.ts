/** User-defined site areas for observations/issues only (no UPM install rows). */

import type { CustomSitePlacement } from "@prisma/client";

export type { CustomSitePlacement };

/** Mirrors Prisma `CustomSitePlacement` — use for Zod/API validation without `@prisma/client` runtime enum. */
export const CUSTOM_SITE_PLACEMENT_VALUES = [
  "standalone",
  "building",
  "building_level",
] as const satisfies readonly CustomSitePlacement[];

export type CustomSitePlacementValue = (typeof CUSTOM_SITE_PLACEMENT_VALUES)[number];

export interface CustomSiteLocation {
  id: string;
  projectId: string;
  name: string;
  building: string;
  level: string;
  placement: CustomSitePlacement;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string | null };
  unitRef: string;
  observationCount: number;
  issueCount: number;
}

export const CUSTOM_SITE_UNIT_REF_PREFIX = "@custom|";

export function customSiteUnitRef(location: Pick<CustomSiteLocation, "id" | "name">): string {
  return `${CUSTOM_SITE_UNIT_REF_PREFIX}${location.id}|${location.name}`;
}

/** Scope fields used for duplicate-name checks (same placement + building + level). */
export interface CustomSiteLocationNameScope {
  placement: CustomSitePlacement;
  building: string;
  level: string;
}

/**
 * Canonical key for duplicate-name checks — full name only (trim, collapse whitespace,
 * Unicode NFKC, lowercase). Similar prefixes like "Building B Level One" vs "Two" stay distinct.
 */
export function customSiteLocationNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").normalize("NFKC").toLowerCase();
}

/** True when two locations share the same placement, building, and level bucket. */
export function customSiteLocationsShareScope(
  a: CustomSiteLocationNameScope,
  b: CustomSiteLocationNameScope,
): boolean {
  const normA = normalizeCustomSiteLocationFields(a.placement, a.building, a.level);
  const normB = normalizeCustomSiteLocationFields(b.placement, b.building, b.level);
  return (
    a.placement === b.placement &&
    normA.building === normB.building &&
    normA.level === normB.level
  );
}

export function isCustomSiteUnitRef(unitRef: string | null | undefined): boolean {
  return typeof unitRef === "string" && unitRef.startsWith(CUSTOM_SITE_UNIT_REF_PREFIX);
}

export function parseCustomSiteUnitRef(unitRef: string): { id: string; name: string } | null {
  if (!isCustomSiteUnitRef(unitRef)) return null;
  const rest = unitRef.slice(CUSTOM_SITE_UNIT_REF_PREFIX.length);
  const pipeIdx = rest.indexOf("|");
  if (pipeIdx < 0) return null;
  return { id: rest.slice(0, pipeIdx), name: rest.slice(pipeIdx + 1) };
}

export function customSiteUnitContext(location: CustomSiteLocation) {
  const { building, level } = normalizeCustomSiteLocationFields(
    location.placement,
    location.building,
    location.level,
  );
  return {
    unitKey: location.name,
    building,
    level,
    unit: location.name,
    unitRef: location.unitRef,
  };
}

/** Normalize building/level fields from placement (client + display). */
export function normalizeCustomSiteLocationFields(
  placement: CustomSitePlacement,
  building: string,
  level: string,
): { building: string; level: string } {
  if (placement === "standalone") {
    return { building: "", level: "" };
  }
  if (placement === "building") {
    return { building: building.trim(), level: "" };
  }
  return { building: building.trim(), level: level.trim() };
}

export type CustomSiteDetailHeaderSegment = {
  key: string;
  icon: "building" | "layers";
  label: string;
};

/** Location chips for the custom-site detail header — standalone never shows building/level. */
export function customSiteDetailHeaderSegments(
  location: Pick<CustomSiteLocation, "placement" | "building" | "level">,
): CustomSiteDetailHeaderSegment[] {
  if (location.placement === "standalone") {
    return [];
  }
  const segments: CustomSiteDetailHeaderSegment[] = [];
  if (location.placement === "building" || location.placement === "building_level") {
    const building = location.building.trim();
    if (building) {
      segments.push({ key: "building", icon: "building", label: building });
    }
  }
  if (location.placement === "building_level") {
    const level = location.level.trim();
    if (level) {
      segments.push({ key: "level", icon: "layers", label: level });
    }
  }
  return segments;
}

export function formatCustomSitePlacementLabel(
  location: Pick<CustomSiteLocation, "placement" | "building" | "level">,
  labels: {
    standalone: string;
    buildingOnly: (building: string) => string;
    buildingLevel: (building: string, level: string) => string;
  },
): string {
  if (location.placement === "standalone") return labels.standalone;
  if (location.placement === "building") return labels.buildingOnly(location.building);
  return labels.buildingLevel(location.building, location.level);
}

/** True when a custom location belongs under a specific building + level row. */
export function customSiteMatchesLevelSection(
  location: Pick<CustomSiteLocation, "placement" | "building" | "level">,
  buildingKey: string,
  levelKey: string,
): boolean {
  return (
    location.placement === "building_level" &&
    location.building === buildingKey &&
    location.level === levelKey
  );
}

/** True when a custom location is scoped to a building but not a specific level. */
export function customSiteMatchesBuildingSection(
  location: Pick<CustomSiteLocation, "placement" | "building">,
  buildingKey: string,
): boolean {
  return location.placement === "building" && location.building === buildingKey;
}
