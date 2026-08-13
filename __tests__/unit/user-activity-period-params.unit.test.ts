import { describe, expect, it, vi } from "vitest";
import {
  parseUserActivityPeriodFromSearchParams,
  userActivityPeriodQueryString,
} from "@/lib/reports/user-activity-period-params";

describe("parseUserActivityPeriodFromSearchParams()", () => {
  it("defaults to 1 week when params are missing", () => {
    const period = parseUserActivityPeriodFromSearchParams({});
    expect(period.preset).toBe("1w");
  });

  it("parses custom range from search params", () => {
    const period = parseUserActivityPeriodFromSearchParams({
      preset: "custom",
      from: "2026-05-01",
      to: "2026-05-15",
    });
    expect(period.preset).toBe("custom");
    expect(period.customFrom).toBe("2026-05-01");
    expect(period.customTo).toBe("2026-05-15");
  });

  it("ignores invalid preset values", () => {
    const period = parseUserActivityPeriodFromSearchParams({ preset: "bad" });
    expect(period.preset).toBe("1w");
  });

  it("falls back to default period when custom from/to are malformed", () => {
    const period = parseUserActivityPeriodFromSearchParams({
      preset: "custom",
      from: "2026-13-40",
      to: "2026-05-15",
    });
    expect(period.preset).toBe("1w");
  });

  it("falls back to default period when custom range is inverted", () => {
    const period = parseUserActivityPeriodFromSearchParams({
      preset: "custom",
      from: "2026-05-20",
      to: "2026-05-01",
    });
    expect(period.preset).toBe("1w");
  });

  it("syncs customFrom/customTo when a non-custom preset is selected", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00.000Z"));

    const period = parseUserActivityPeriodFromSearchParams({ preset: "2w" });
    expect(period.preset).toBe("2w");
    expect(period.customFrom).toBe("2026-05-29");
    expect(period.customTo).toBe("2026-06-12");

    vi.useRealTimers();
  });
});

describe("userActivityPeriodQueryString()", () => {
  it("serializes custom preset with from/to", () => {
    const qs = userActivityPeriodQueryString({
      preset: "custom",
      customFrom: "2026-05-01",
      customTo: "2026-05-15",
    });
    expect(qs).toBe("preset=custom&from=2026-05-01&to=2026-05-15");
  });
});
