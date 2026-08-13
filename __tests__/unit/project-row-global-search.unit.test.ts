import { describe, it, expect } from "vitest";
import {
  buildProjectRowGlobalSearchWhere,
  normalizeUnitsSearchQuery,
  PROJECT_ROW_GLOBAL_SEARCH_MAX_LEN,
  tourDemoRowMatchesGlobalSearch,
} from "@/lib/project-row-global-search";

describe("normalizeUnitsSearchQuery()", () => {
  it("trims and returns empty for whitespace", () => {
    expect(normalizeUnitsSearchQuery("   ")).toBe("");
  });

  it("truncates overly long input", () => {
    const long = "a".repeat(PROJECT_ROW_GLOBAL_SEARCH_MAX_LEN + 50);
    expect(normalizeUnitsSearchQuery(long).length).toBe(PROJECT_ROW_GLOBAL_SEARCH_MAX_LEN);
  });
});

describe("buildProjectRowGlobalSearchWhere()", () => {
  it("returns empty object for empty query", () => {
    expect(buildProjectRowGlobalSearchWhere("")).toEqual({});
  });

  it("includes description contains for non-empty query", () => {
    const w = buildProjectRowGlobalSearchWhere("tile");
    expect(w).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            description: { contains: "tile", mode: "insensitive" },
          }),
        ]),
      })
    );
  });
});

describe("tourDemoRowMatchesGlobalSearch()", () => {
  it("matches description substring", () => {
    expect(
      tourDemoRowMatchesGlobalSearch("Bedroom", {
        building: "A",
        description: "1 Bedroom / 1 Bath",
      })
    ).toBe(true);
  });

  it("returns true when query empty", () => {
    expect(tourDemoRowMatchesGlobalSearch("", { description: "x" })).toBe(true);
  });
});
