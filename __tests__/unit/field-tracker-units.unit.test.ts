import { describe, it, expect } from "vitest";
import {
  FIELD_TRACKER_SEARCH_DEBOUNCE_MS,
  FIELD_TRACKER_UNITS_PAGE_LIMIT,
} from "@/lib/field-tracker-units";

describe("field-tracker-units constants", () => {
  it("exports a positive page limit", () => {
    expect(FIELD_TRACKER_UNITS_PAGE_LIMIT).toBeGreaterThan(0);
  });

  it("exports a reasonable search debounce (ms)", () => {
    expect(FIELD_TRACKER_SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    expect(FIELD_TRACKER_SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(2000);
  });
});
