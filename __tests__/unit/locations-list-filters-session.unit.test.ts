import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ActiveFilters } from "@/components/projects/UnitCards";
import {
  clearLocationsListFiltersSession,
  locationsListFiltersSessionKey,
  readLocationsListFiltersSession,
  writeLocationsListFiltersSession,
} from "@/lib/locations-list-filters-session";

const sessionStorageStore: Record<string, string> = {};
const sessionStorageMock = {
  getItem: vi.fn((key: string) => sessionStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete sessionStorageStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(sessionStorageStore).forEach((key) => delete sessionStorageStore[key]);
  }),
};

const SAMPLE_FILTERS: ActiveFilters = {
  stages: ["STAGING"],
  scopeTypeNames: ["Cabinetry"],
  scopeSubNames: ["Upper"],
  unitTypes: ["Patient Room"],
  locationKinds: [],
  buildings: ["Building A"],
  levels: ["Building A::Level 1"],
  buildPhases: ["2"],
  areas: ["850 SF"],
  issueTypes: ["SUBSTRATE_CONDITION"],
  responsibleParties: ["CP_BUILD"],
  issueStatuses: ["OPEN"],
  issueBlocking: true,
  issueScopeTypeNames: ["Cabinetry"],
  issueSubScopeNames: ["Upper"],
  inspectionStatuses: ["PASSED"],
  calibrationStatuses: ["FAILED"],
  subcontractorAssigned: "yes",
  subcontractorIds: ["sub-1"],
  unitsWithIssuesOnly: true,
};

describe("locations-list-filters-session", () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    vi.stubGlobal("sessionStorage", sessionStorageMock);
  });

  it("returns null when nothing is stored", () => {
    expect(readLocationsListFiltersSession("proj-a")).toBeNull();
  });

  it("returns null for empty projectId", () => {
    writeLocationsListFiltersSession("proj-a", { searchQuery: "x", filters: SAMPLE_FILTERS });
    expect(readLocationsListFiltersSession("")).toBeNull();
  });

  it("round-trips filter state through sessionStorage", () => {
    writeLocationsListFiltersSession("proj-a", {
      searchQuery: "Alpha",
      filters: SAMPLE_FILTERS,
    });

    expect(readLocationsListFiltersSession("proj-a")).toEqual({
      searchQuery: "Alpha",
      filters: SAMPLE_FILTERS,
    });
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      locationsListFiltersSessionKey("proj-a"),
      expect.any(String)
    );
  });

  it("isolates filter state per project", () => {
    writeLocationsListFiltersSession("proj-a", {
      searchQuery: "Alpha",
      filters: { ...SAMPLE_FILTERS, stages: ["STAGING"] },
    });
    writeLocationsListFiltersSession("proj-b", {
      searchQuery: "Beta",
      filters: { ...SAMPLE_FILTERS, stages: ["ASSEMBLY"] },
    });

    expect(readLocationsListFiltersSession("proj-a")?.searchQuery).toBe("Alpha");
    expect(readLocationsListFiltersSession("proj-a")?.filters.stages).toEqual(["STAGING"]);
    expect(readLocationsListFiltersSession("proj-b")?.searchQuery).toBe("Beta");
    expect(readLocationsListFiltersSession("proj-b")?.filters.stages).toEqual(["ASSEMBLY"]);
  });

  it("defaults buildPhases and areas to [] when omitted from stored filters (backward compat)", () => {
    const { buildPhases: _bp, areas: _a, ...legacy } = SAMPLE_FILTERS;
    sessionStorageStore[locationsListFiltersSessionKey("proj-a")] = JSON.stringify({
      searchQuery: "Legacy",
      filters: legacy,
    });

    expect(readLocationsListFiltersSession("proj-a")).toEqual({
      searchQuery: "Legacy",
      filters: { ...SAMPLE_FILTERS, buildPhases: [], areas: [] },
    });
  });

  it("defaults locationKinds to [] when omitted from stored filters (backward compat)", () => {
    const { locationKinds: _omit, ...filtersWithoutKinds } = SAMPLE_FILTERS;
    sessionStorageStore[locationsListFiltersSessionKey("proj-a")] = JSON.stringify({
      searchQuery: "Legacy",
      filters: filtersWithoutKinds,
    });

    expect(readLocationsListFiltersSession("proj-a")).toEqual({
      searchQuery: "Legacy",
      filters: { ...SAMPLE_FILTERS, locationKinds: [] },
    });
  });

  it("returns null for malformed JSON", () => {
    sessionStorageStore[locationsListFiltersSessionKey("proj-a")] = "{not-json";
    expect(readLocationsListFiltersSession("proj-a")).toBeNull();
  });

  it("returns null when filter arrays are not string arrays", () => {
    sessionStorageStore[locationsListFiltersSessionKey("proj-a")] = JSON.stringify({
      searchQuery: "x",
      filters: {
        ...SAMPLE_FILTERS,
        stages: [1],
      },
    });
    expect(readLocationsListFiltersSession("proj-a")).toBeNull();
  });

  it("returns null when issueBlocking is invalid", () => {
    sessionStorageStore[locationsListFiltersSessionKey("proj-a")] = JSON.stringify({
      searchQuery: "",
      filters: {
        ...SAMPLE_FILTERS,
        issueBlocking: "yes",
      },
    });
    expect(readLocationsListFiltersSession("proj-a")).toBeNull();
  });

  it("returns null when subcontractorAssigned is invalid", () => {
    sessionStorageStore[locationsListFiltersSessionKey("proj-a")] = JSON.stringify({
      searchQuery: "",
      filters: {
        ...SAMPLE_FILTERS,
        subcontractorAssigned: "maybe",
      },
    });
    expect(readLocationsListFiltersSession("proj-a")).toBeNull();
  });

  it("clears stored filters for a project", () => {
    writeLocationsListFiltersSession("proj-a", {
      searchQuery: "",
      filters: SAMPLE_FILTERS,
    });
    clearLocationsListFiltersSession("proj-a");
    expect(readLocationsListFiltersSession("proj-a")).toBeNull();
  });
});
