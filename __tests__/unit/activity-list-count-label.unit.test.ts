import { describe, expect, it } from "vitest";
import {
  hasClientSideActivityFilter,
  shouldShowFilteredActivityCount,
} from "@/lib/activity-list-count-label";

describe("activity-list-count-label", () => {
  it("detects client-side search filter", () => {
    expect(
      hasClientSideActivityFilter({ search: "framing", loadedCount: 50, filteredCount: 50 }),
    ).toBe(true);
  });

  it("detects when filtered count is below loaded count", () => {
    expect(
      hasClientSideActivityFilter({ search: "", loadedCount: 50, filteredCount: 10 }),
    ).toBe(true);
  });

  it("shows filtered summary when search narrows below server total", () => {
    expect(
      shouldShowFilteredActivityCount({
        search: "framing",
        loadedCount: 50,
        filteredCount: 10,
        totalCount: 200,
      }),
    ).toBe(true);
  });

  it("shows total-only summary when all loaded rows match and no search", () => {
    expect(
      shouldShowFilteredActivityCount({
        search: "",
        loadedCount: 50,
        filteredCount: 50,
        totalCount: 200,
      }),
    ).toBe(false);
  });
});
