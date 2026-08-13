import { describe, it, expect } from "vitest";
import {
  shouldShowCustomSiteLocations,
  cardMatchesLocationKindFilters,
  type LocationKindFilter,
} from "@/lib/location-kind-filter";

describe("location-kind-filter", () => {
  it("shows custom locations when no kind filter is active", () => {
    expect(shouldShowCustomSiteLocations({ locationKinds: [] })).toBe(true);
  });

  it("hides custom locations when kind filter excludes them", () => {
    expect(shouldShowCustomSiteLocations({ locationKinds: ["units"] })).toBe(false);
    expect(shouldShowCustomSiteLocations({ locationKinds: ["custom_locations"] })).toBe(true);
  });
});

describe("cardMatchesLocationKindFilters", () => {
  it("matches common areas only when common_areas is selected", () => {
    const filters: { locationKinds: LocationKindFilter[] } = { locationKinds: ["common_areas"] };
    expect(cardMatchesLocationKindFilters(true, filters)).toBe(true);
    expect(cardMatchesLocationKindFilters(false, filters)).toBe(false);
  });
});
