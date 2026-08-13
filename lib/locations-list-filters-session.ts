import type { ActiveFilters } from "@/components/projects/UnitCards";
import {
  LOCATION_KIND_FILTERS,
  type LocationKindFilter,
} from "@/lib/location-kind-filter";

export const LOCATIONS_LIST_FILTERS_SESSION_KEY_PREFIX = "locationsListFilters";

export interface LocationsListFiltersSession {
  searchQuery: string;
  filters: ActiveFilters;
}

export function locationsListFiltersSessionKey(projectId: string): string {
  return `${LOCATIONS_LIST_FILTERS_SESSION_KEY_PREFIX}:${projectId}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseIssueBlocking(value: unknown): boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  return undefined;
}

function parseSubcontractorAssigned(value: unknown): "yes" | "no" | null | undefined {
  if (value === null) return null;
  if (value === "yes" || value === "no") return value;
  return undefined;
}

function parseLocationKinds(value: unknown): LocationKindFilter[] | null | undefined {
  if (value === undefined) return undefined;
  if (!isStringArray(value)) return null;
  if (!value.every((item) => (LOCATION_KIND_FILTERS as readonly string[]).includes(item))) {
    return null;
  }
  return value as LocationKindFilter[];
}

function parseOptionalStringArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!isStringArray(value)) return null;
  return value;
}

function parseActiveFilters(value: unknown): ActiveFilters | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (!isStringArray(record.stages)) return null;
  if (!isStringArray(record.scopeTypeNames)) return null;
  if (!isStringArray(record.scopeSubNames)) return null;
  if (!isStringArray(record.unitTypes)) return null;

  const locationKinds = parseLocationKinds(record.locationKinds);
  if (locationKinds === null) return null;

  if (!isStringArray(record.buildings)) return null;
  if (!isStringArray(record.levels)) return null;

  const buildPhases = parseOptionalStringArray(record.buildPhases);
  if (buildPhases === null) return null;
  const areas = parseOptionalStringArray(record.areas);
  if (areas === null) return null;

  if (!isStringArray(record.issueTypes)) return null;
  if (!isStringArray(record.responsibleParties)) return null;
  if (!isStringArray(record.issueStatuses)) return null;
  if (!isStringArray(record.issueScopeTypeNames)) return null;
  if (!isStringArray(record.issueSubScopeNames)) return null;
  if (!isStringArray(record.inspectionStatuses)) return null;
  if (!isStringArray(record.subcontractorIds)) return null;

  const calibrationStatuses = isStringArray(record.calibrationStatuses)
    ? record.calibrationStatuses
    : [];

  const issueBlocking = parseIssueBlocking(record.issueBlocking);
  if (issueBlocking === undefined) return null;

  const subcontractorAssigned = parseSubcontractorAssigned(record.subcontractorAssigned);
  if (subcontractorAssigned === undefined) return null;

  if (typeof record.unitsWithIssuesOnly !== "boolean") return null;

  return {
    stages: record.stages,
    scopeTypeNames: record.scopeTypeNames,
    scopeSubNames: record.scopeSubNames,
    unitTypes: record.unitTypes,
    locationKinds: locationKinds ?? [],
    buildings: record.buildings,
    levels: record.levels,
    buildPhases,
    areas,
    issueTypes: record.issueTypes,
    responsibleParties: record.responsibleParties,
    issueStatuses: record.issueStatuses,
    issueBlocking,
    issueScopeTypeNames: record.issueScopeTypeNames,
    issueSubScopeNames: record.issueSubScopeNames,
    inspectionStatuses: record.inspectionStatuses,
    calibrationStatuses,
    subcontractorAssigned,
    subcontractorIds: record.subcontractorIds,
    unitsWithIssuesOnly: record.unitsWithIssuesOnly,
  };
}

function parseStoredFilters(raw: string): LocationsListFiltersSession | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  const searchQuery = typeof record.searchQuery === "string" ? record.searchQuery : "";
  const filters = parseActiveFilters(record.filters);
  if (!filters) return null;

  return {
    searchQuery,
    filters,
  };
}

export function readLocationsListFiltersSession(
  projectId: string
): LocationsListFiltersSession | null {
  if (!projectId || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(locationsListFiltersSessionKey(projectId));
    if (!raw) return null;
    return parseStoredFilters(raw);
  } catch {
    return null;
  }
}

export function writeLocationsListFiltersSession(
  projectId: string,
  state: LocationsListFiltersSession
): void {
  if (!projectId || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      locationsListFiltersSessionKey(projectId),
      JSON.stringify(state)
    );
  } catch {
    // sessionStorage may be blocked in privacy modes — fail silently
  }
}

export function clearLocationsListFiltersSession(projectId: string): void {
  if (!projectId || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(locationsListFiltersSessionKey(projectId));
  } catch {
    // ignore
  }
}
