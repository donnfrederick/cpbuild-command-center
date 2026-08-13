import { describe, it, expect } from "vitest";
import {
  PROJECT_STATUSES,
  SEARCH_DEBOUNCE_MS,
  type ProjectStatus,
  type ProjectSortField,
  type SortDirection,
} from "@/lib/projects";

describe("lib/projects", () => {
  it("exports PROJECT_STATUSES", () => {
    expect(PROJECT_STATUSES).toEqual(["Active", "Completed", "Planning", "On Hold"]);
  });

  it("exports SEARCH_DEBOUNCE_MS", () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
  });

  it("ProjectStatus type is usable", () => {
    const status: ProjectStatus = "Active";
    expect(status).toBe("Active");
  });

  it("ProjectSortField type is usable", () => {
    const field: ProjectSortField = "projectName";
    expect(field).toBe("projectName");
  });

  it("SortDirection type is usable", () => {
    const dir: SortDirection = "asc";
    expect(dir).toBe("asc");
  });
});
