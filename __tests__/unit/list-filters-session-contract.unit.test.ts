/**
 * Shared behavioral contract for client-side list filter persistence.
 * Projects list uses a global sessionStorage key; Locations uses per-project keys.
 * Both libs must fail safely on bad data and round-trip valid payloads.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ActiveFilters } from "@/components/projects/UnitCards";
import {
  PROJECTS_LIST_FILTERS_SESSION_KEY,
  clearProjectsListFiltersSession,
  readProjectsListFiltersSession,
  writeProjectsListFiltersSession,
} from "@/lib/projects-list-filters-session";
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

const EMPTY_LOCATIONS_FILTERS: ActiveFilters = {
  stages: [],
  scopeTypeNames: [],
  scopeSubNames: [],
  unitTypes: [],
  locationKinds: [],
  buildings: [],
  levels: [],
  buildPhases: [],
  areas: [],
  issueTypes: [],
  responsibleParties: [],
  issueStatuses: [],
  issueBlocking: null,
  issueScopeTypeNames: [],
  issueSubScopeNames: [],
  inspectionStatuses: [],
  calibrationStatuses: [],
  subcontractorAssigned: null,
  subcontractorIds: [],
  unitsWithIssuesOnly: false,
};

describe("list-filters-session contract (Projects + Locations)", () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    vi.stubGlobal("sessionStorage", sessionStorageMock);
  });

  describe("projects-list-filters-session", () => {
    const storageKey = PROJECTS_LIST_FILTERS_SESSION_KEY;

    it("returns null when nothing is stored", () => {
      expect(readProjectsListFiltersSession()).toBeNull();
    });

    it("round-trips search and filter arrays", () => {
      writeProjectsListFiltersSession({
        searchQuery: "Alpha",
        statusFilter: ["Construction"],
        imFilter: ["Bob"],
        pmFilter: ["Alice"],
      });

      expect(readProjectsListFiltersSession()).toEqual({
        searchQuery: "Alpha",
        statusFilter: ["Construction"],
        imFilter: ["Bob"],
        pmFilter: ["Alice"],
      });
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(storageKey, expect.any(String));
    });

    it("returns null for malformed JSON", () => {
      sessionStorageStore[storageKey] = "{not-json";
      expect(readProjectsListFiltersSession()).toBeNull();
    });

    it("returns null when filter arrays are not string arrays", () => {
      sessionStorageStore[storageKey] = JSON.stringify({
        searchQuery: "x",
        statusFilter: ["ok"],
        imFilter: [1],
        pmFilter: [],
      });
      expect(readProjectsListFiltersSession()).toBeNull();
    });

    it("clears stored filters", () => {
      writeProjectsListFiltersSession({
        searchQuery: "",
        statusFilter: ["Active"],
        imFilter: [],
        pmFilter: [],
      });
      clearProjectsListFiltersSession();
      expect(readProjectsListFiltersSession()).toBeNull();
    });
  });

  describe("locations-list-filters-session", () => {
    const projectId = "proj-contract";
    const storageKey = locationsListFiltersSessionKey(projectId);

    it("returns null when nothing is stored", () => {
      expect(readLocationsListFiltersSession(projectId)).toBeNull();
    });

    it("round-trips search and full ActiveFilters payload", () => {
      const filters: ActiveFilters = {
        ...EMPTY_LOCATIONS_FILTERS,
        stages: ["STAGING"],
        inspectionStatuses: ["PASSED"],
        unitsWithIssuesOnly: true,
      };

      writeLocationsListFiltersSession(projectId, {
        searchQuery: "North wing",
        filters,
      });

      expect(readLocationsListFiltersSession(projectId)).toEqual({
        searchQuery: "North wing",
        filters,
      });
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(storageKey, expect.any(String));
    });

    it("returns null for malformed JSON", () => {
      sessionStorageStore[storageKey] = "{not-json";
      expect(readLocationsListFiltersSession(projectId)).toBeNull();
    });

    it("returns null when filter arrays are not string arrays", () => {
      sessionStorageStore[storageKey] = JSON.stringify({
        searchQuery: "x",
        filters: {
          ...EMPTY_LOCATIONS_FILTERS,
          stages: [1],
        },
      });
      expect(readLocationsListFiltersSession(projectId)).toBeNull();
    });

    it("clears stored filters for the project", () => {
      writeLocationsListFiltersSession(projectId, {
        searchQuery: "saved",
        filters: { ...EMPTY_LOCATIONS_FILTERS, stages: ["ASSEMBLY"] },
      });
      clearLocationsListFiltersSession(projectId);
      expect(readLocationsListFiltersSession(projectId)).toBeNull();
    });

    it("does not read another project's storage key", () => {
      writeLocationsListFiltersSession("proj-a", {
        searchQuery: "A",
        filters: EMPTY_LOCATIONS_FILTERS,
      });
      expect(readLocationsListFiltersSession("proj-b")).toBeNull();
    });
  });
});
