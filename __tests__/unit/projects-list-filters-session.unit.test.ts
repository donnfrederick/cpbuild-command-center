import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PROJECTS_LIST_FILTERS_SESSION_KEY,
  clearProjectsListFiltersSession,
  readProjectsListFiltersSession,
  writeProjectsListFiltersSession,
} from "@/lib/projects-list-filters-session";

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

describe("projects-list-filters-session", () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    vi.stubGlobal("sessionStorage", sessionStorageMock);
  });

  it("returns null when nothing is stored", () => {
    expect(readProjectsListFiltersSession()).toBeNull();
  });

  it("round-trips filter state through sessionStorage", () => {
    writeProjectsListFiltersSession({
      searchQuery: "Alpha",
      statusFilter: ["Construction"],
      imFilter: ["Bob"],
      pmFilter: ["Alice", "Carol"],
    });

    expect(readProjectsListFiltersSession()).toEqual({
      searchQuery: "Alpha",
      statusFilter: ["Construction"],
      imFilter: ["Bob"],
      pmFilter: ["Alice", "Carol"],
    });
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      PROJECTS_LIST_FILTERS_SESSION_KEY,
      expect.any(String)
    );
  });

  it("returns null for malformed JSON", () => {
    sessionStorageStore[PROJECTS_LIST_FILTERS_SESSION_KEY] = "{not-json";
    expect(readProjectsListFiltersSession()).toBeNull();
  });

  it("returns null when filter arrays are not string arrays", () => {
    sessionStorageStore[PROJECTS_LIST_FILTERS_SESSION_KEY] = JSON.stringify({
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
