import { describe, expect, it } from "vitest";
import {
  filterUserActivityRows,
  maxActivityCount,
  sortUserActivityRows,
  uniqueRoleCodes,
} from "@/lib/reports/user-activity-filters";
import type { UserActivityRow } from "@/lib/reports/user-activity-types";

const ROWS: UserActivityRow[] = [
  { id: "1", name: "Alice Adams", role: "INSTALL_MANAGER", count: 42 },
  { id: "2", name: "Bob Baker", role: "PROJECT_MANAGER", count: 0 },
  { id: "3", name: "Carol Chen", role: "INSTALL_MANAGER", count: 100 },
];

describe("filterUserActivityRows()", () => {
  it("returns all rows when search and role filters are empty", () => {
    expect(filterUserActivityRows(ROWS, { search: "", roleCodes: [] })).toHaveLength(3);
  });

  it("filters by name search", () => {
    const result = filterUserActivityRows(ROWS, { search: "bob", roleCodes: [] });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Bob Baker");
  });

  it("filters by role codes", () => {
    const result = filterUserActivityRows(ROWS, {
      search: "",
      roleCodes: ["PROJECT_MANAGER"],
    });
    expect(result.map((r) => r.id)).toEqual(["2"]);
  });
});

describe("sortUserActivityRows()", () => {
  it("sorts most active first, then name", () => {
    const sorted = sortUserActivityRows(ROWS, "most");
    expect(sorted.map((r) => r.id)).toEqual(["3", "1", "2"]);
  });

  it("sorts least active first", () => {
    const sorted = sortUserActivityRows(ROWS, "least");
    expect(sorted.map((r) => r.id)).toEqual(["2", "1", "3"]);
  });
});

describe("maxActivityCount()", () => {
  it("returns 0 for empty list", () => {
    expect(maxActivityCount([])).toBe(0);
  });

  it("returns highest count", () => {
    expect(maxActivityCount(ROWS)).toBe(100);
  });
});

describe("uniqueRoleCodes()", () => {
  it("returns sorted unique roles", () => {
    expect(uniqueRoleCodes(ROWS)).toEqual(["INSTALL_MANAGER", "PROJECT_MANAGER"]);
  });
});
