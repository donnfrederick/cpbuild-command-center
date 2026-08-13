import { describe, expect, it } from "vitest";
import { periodToCreatedAtBounds } from "@/lib/reports/activity-period-bounds";

describe("periodToCreatedAtBounds()", () => {
  it("returns UTC start/end for a custom range", () => {
    const bounds = periodToCreatedAtBounds({
      preset: "custom",
      customFrom: "2026-05-01",
      customTo: "2026-05-15",
    });

    expect(bounds.gte?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(bounds.lte?.toISOString()).toBe("2026-05-15T23:59:59.999Z");
  });

  it("returns empty bounds for all-time preset", () => {
    expect(periodToCreatedAtBounds({
      preset: "all",
      customFrom: "",
      customTo: "",
    })).toEqual({});
  });

  it("returns empty bounds when custom dates are invalid", () => {
    expect(periodToCreatedAtBounds({
      preset: "custom",
      customFrom: "not-a-date",
      customTo: "2026-05-15",
    })).toEqual({});
  });
});
