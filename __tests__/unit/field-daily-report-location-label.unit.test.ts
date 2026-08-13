import { describe, expect, it } from "vitest";
import {
  extractLocationParts,
  formatBulkStatusLocationSummary,
  formatFieldDailyLocationLabel,
  parseFieldDailyLocationLabel,
} from "@/lib/field-daily-report/location-label";
import { resolveUnitDetailTarget } from "@/lib/field-daily-report/unit-entry-target";

describe("formatFieldDailyLocationLabel", () => {
  it("uses unitRefs for bulk status metadata", () => {
    expect(
      formatFieldDailyLocationLabel({
        count: 9,
        unitRefs: [{ building: "1", level: "2", unit: "203" }],
      }),
    ).toBe("Bldg 1 · L2 · Unit 203");
  });

  it("formats building, level, unit, and scope", () => {
    expect(
      formatFieldDailyLocationLabel({
        building: "1",
        level: "5",
        unit: "503",
        scopeName: "TOPIU",
      }),
    ).toBe("Bldg 1 · L5 · Unit 503 · TOPIU");
  });

  it("parses unitRef when direct fields are missing", () => {
    expect(formatFieldDailyLocationLabel({ unitRef: "1|5|503" })).toBe("Bldg 1 · L5 · Unit 503");
  });

  it("parses issue unitRef with level only", () => {
    expect(formatFieldDailyLocationLabel({ unitRef: "1|3|" })).toBe("Bldg 1 · L3");
  });
});

describe("formatBulkStatusLocationSummary", () => {
  it("summarizes unit range for bulk updates", () => {
    expect(
      formatBulkStatusLocationSummary({
        unitRefs: [
          { building: "1", level: "2", unit: "203" },
          { building: "1", level: "2", unit: "209" },
        ],
      }),
    ).toBe("Bldg 1 · L2 · Units 203–209 (2)");
  });
});

describe("extractLocationParts", () => {
  it("reads building, level, and unit from metadata", () => {
    expect(extractLocationParts({ building: "1", level: "5", unit: "503" })).toEqual({
      building: "1",
      level: "5",
      unit: "503",
    });
  });
});

describe("parseFieldDailyLocationLabel", () => {
  it("parses a full location label with scope suffix", () => {
    expect(parseFieldDailyLocationLabel("Bldg 1 · L5 · Unit 503 · TOPIU")).toEqual({
      building: "1",
      level: "5",
      unit: "503",
    });
  });

  it("returns null when unit is missing", () => {
    expect(parseFieldDailyLocationLabel("Bldg 1 · L3")).toBeNull();
  });
});

describe("resolveUnitDetailTarget", () => {
  it("prefers stored coordinates on the entry", () => {
    expect(
      resolveUnitDetailTarget({
        locationLabel: "Bldg 1 · L2 · Unit 201",
        building: "1",
        level: "2",
        unit: "201",
        activityLogIds: ["a1"],
      }),
    ).toEqual({ building: "1", level: "2", unit: "201" });
  });

  it("falls back to parsing the location label", () => {
    expect(
      resolveUnitDetailTarget({
        locationLabel: "Bldg 1 · L2 · Unit 201",
        activityLogIds: ["a1"],
      }),
    ).toEqual({ building: "1", level: "2", unit: "201" });
  });
});
