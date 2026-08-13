import { describe, expect, it, vi, afterEach } from "vitest";
import {
  comparePeriodCacheKey,
  globalProgressDetailUrl,
  globalProgressListUrl,
  portfolioProgressDetailCacheKey,
} from "@/lib/reports/portfolio-progress-client";
import type { ComparePeriodState } from "@/lib/reports/portfolio-progress-period";

describe("portfolio-progress-client URLs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds list URL with preset and resolved dates", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));
    const period: ComparePeriodState = { preset: "1w", customFrom: "", customTo: "" };
    const url = globalProgressListUrl(period);
    expect(url).toMatch(/^\/api\/reports\/global-progress\?/);
    expect(url).toContain("preset=1w");
    expect(url).toContain("from=");
    expect(url).toContain("to=");
  });

  it("builds detail URL with encoded project id", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T12:00:00Z"));
    const period: ComparePeriodState = { preset: "30d", customFrom: "", customTo: "" };
    const url = globalProgressDetailUrl("proj/with space", period);
    expect(url).toContain("/api/reports/global-progress/proj%2Fwith%20space?");
    expect(url).toContain("preset=30d");
  });

  it("uses stable cache keys for the same compare window", () => {
    const period: ComparePeriodState = {
      preset: "custom",
      customFrom: "2025-05-01",
      customTo: "2025-06-01",
    };
    const keyA = comparePeriodCacheKey(period);
    const keyB = comparePeriodCacheKey({ ...period });
    expect(keyA).toBe(keyB);
    expect(portfolioProgressDetailCacheKey("p1", period)).toBe(`p1|${keyA}`);
  });
});
