import { describe, it, expect, vi, afterEach } from "vitest";
import {
  applyComparePeriodToProject,
  comparePeriodShortLabel,
  comparePeriodStatesEqual,
  comparePeriodHeaderLines,
  copyComparePeriod,
  defaultComparePeriod,
  isCustomRangeInvalid,
  parseComparePeriodShortLabelForHeader,
  resolveComparePeriodRange,
  toDateInput,
} from "@/lib/reports/portfolio-progress-period";
import {
  PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS,
  wireframeProjectToLevelScopeReport,
} from "@/lib/reports/portfolio-progress-wireframe-data";

describe("portfolio-progress-period", () => {
  it("defaults to 1 week preset", () => {
    expect(defaultComparePeriod().preset).toBe("1w");
  });

  it("toDateInput uses local calendar date, not UTC slice", () => {
    const sample = new Date(2026, 4, 29, 23, 30, 0);
    expect(toDateInput(sample)).toBe("2026-05-29");
    expect(toDateInput(sample)).toBe(
      `${sample.getFullYear()}-${String(sample.getMonth() + 1).padStart(2, "0")}-${String(sample.getDate()).padStart(2, "0")}`,
    );
  });

  it("defaultComparePeriod customTo matches local today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 29, 23, 30, 0));
    const period = defaultComparePeriod();
    expect(period.customTo).toBe("2026-05-29");
    expect(period.customFrom).toBe("2026-05-22");
    vi.useRealTimers();
  });

  it("comparePeriodStatesEqual matches preset and custom dates", () => {
    const a = { preset: "1w" as const, customFrom: "2026-05-27", customTo: "2026-06-03" };
    expect(comparePeriodStatesEqual(a, { ...a })).toBe(true);
    expect(comparePeriodStatesEqual(a, { ...a, preset: "2w" })).toBe(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags invalid custom range", () => {
    expect(
      isCustomRangeInvalid({
        preset: "custom",
        customFrom: "2026-05-20",
        customTo: "2026-05-01",
      }),
    ).toBe(true);
  });

  it("flags empty custom dates as invalid", () => {
    expect(
      isCustomRangeInvalid({
        preset: "custom",
        customFrom: "",
        customTo: "2026-05-01",
      }),
    ).toBe(true);
    expect(
      isCustomRangeInvalid({
        preset: "custom",
        customFrom: "2026-05-01",
        customTo: "",
      }),
    ).toBe(true);
  });

  it("all-time leaves 100% complete projects without deltas", () => {
    const oakGrove = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.find((p) => p.id === "UNI-10189")!;
    const adjusted = applyComparePeriodToProject(oakGrove, { preset: "all", customFrom: "", customTo: "" });
    expect(adjusted.hasChangesInPeriod).toBe(false);
  });

  it("all-time preset does not use a rolling 365-day display window", () => {
    const range = resolveComparePeriodRange({ preset: "all", customFrom: "", customTo: "" });
    const days = Math.round(
      (new Date(`${range.to}T12:00:00`).getTime() - new Date(`${range.from}T12:00:00`).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    expect(days).toBe(365);
  });

  it("2-week period scales deltas upward vs 1 week", () => {
    const marinaBay = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.find((p) => p.id === "UNI-10145")!;
    const oneWeek = applyComparePeriodToProject(marinaBay, { preset: "1w", customFrom: "", customTo: "" });
    const twoWeeks = applyComparePeriodToProject(marinaBay, { preset: "2w", customFrom: "", customTo: "" });
    const cabinets1w = oneWeek.scopeSummaries.find((s) => s.scopeName === "Cabinets")!;
    const cabinets2w = twoWeeks.scopeSummaries.find((s) => s.scopeName === "Cabinets")!;
    expect(cabinets2w.verifiedDelta).toBeGreaterThan(cabinets1w.verifiedDelta ?? 0);
  });

  it("preserves scope dates through period adjustment and grid conversion", () => {
    const marina = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS[0]!;
    const adjusted = applyComparePeriodToProject(marina, { preset: "1w", customFrom: "", customTo: "" });
    const report = wireframeProjectToLevelScopeReport(adjusted);
    expect(report.levels).toHaveLength(11);
    expect(report.levels).toContain("Level 12");
    expect(report.data["Level 2"]?.Cabinets?.pct).toBe(0);
    expect(report.data["Level 2"]?.Cabinets?.startedOn).toBeNull();
    expect(report.data["Level 3"]?.Cabinets?.startedOn).toBe("2025-01-06");
    expect(report.data["Level 4"]?.Cabinets?.completedOn).toBe("2024-12-20");
    expect(report.data["Level 3"]?.Cabinets?.verifiedDelta).toBe(3);
    expect(report.data["Level 3"]?.Cabinets?.totalQty).toBe(18);
    expect(report.data["Level 3"]?.Cabinets?.installedQty).toBe(13);
    expect(report.overallDeltaByScope?.Cabinets).toBe(4);
  });

  it("comparePeriodShortLabel returns week-of range for 1w preset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    const labels = {
      formatWeekOf: (range: string) => `week of ${range}`,
      shortAll: "all",
      shortCustom: "range",
    };
    expect(comparePeriodShortLabel({ preset: "1w", customFrom: "", customTo: "" }, labels, "en-US")).toBe(
      "week of 5/27–6/3",
    );
    vi.useRealTimers();
  });

  it("comparePeriodShortLabel returns date range for 2w preset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    const labels = {
      formatWeekOf: (range: string) => `week of ${range}`,
      shortAll: "all",
      shortCustom: "range",
    };
    expect(comparePeriodShortLabel({ preset: "2w", customFrom: "", customTo: "" }, labels, "en-US")).toBe(
      "5/20–6/3",
    );
    vi.useRealTimers();
  });

  it("comparePeriodShortLabel formats custom range as month/day", () => {
    const labels = {
      formatWeekOf: (range: string) => `week of ${range}`,
      shortAll: "all",
      shortCustom: "range",
    };
    const label = comparePeriodShortLabel(
      { preset: "custom", customFrom: "2026-05-01", customTo: "2026-05-20" },
      labels,
      "en-US",
    );
    expect(label).toBe("5/1–5/20");
  });

  it("resolveComparePeriodRange returns 7-day window for 1w", () => {
    const range = resolveComparePeriodRange({ preset: "1w", customFrom: "", customTo: "" });
    const from = new Date(`${range.from}T12:00:00`);
    const to = new Date(`${range.to}T12:00:00`);
    const days = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    expect(days).toBe(7);
  });

  it("comparePeriodHeaderLines splits preset label and dates for each preset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    const labels = {
      weekOf: "week of",
      preset2w: "2 weeks",
      preset30d: "30 days",
      presetAll: "All time",
      presetCustom: "Custom",
      shortCustom: "range",
    };
    expect(comparePeriodHeaderLines({ preset: "1w", customFrom: "", customTo: "" }, labels, "en-US")).toEqual({
      timeframe: "week of",
      dates: "5/27–6/3",
    });
    expect(comparePeriodHeaderLines({ preset: "2w", customFrom: "", customTo: "" }, labels, "en-US")).toEqual({
      timeframe: "2 weeks",
      dates: "5/20–6/3",
    });
    expect(comparePeriodHeaderLines({ preset: "30d", customFrom: "", customTo: "" }, labels, "en-US")).toEqual({
      timeframe: "30 days",
      dates: "5/4–6/3",
    });
    expect(comparePeriodHeaderLines({ preset: "all", customFrom: "", customTo: "" }, labels, "en-US")).toEqual({
      timeframe: "All time",
      dates: null,
    });
    expect(
      comparePeriodHeaderLines(
        { preset: "custom", customFrom: "2026-05-01", customTo: "2026-05-20" },
        labels,
        "en-US",
      ),
    ).toEqual({
      timeframe: "Custom",
      dates: "5/1–5/20",
    });
    vi.useRealTimers();
  });

  it("parseComparePeriodShortLabelForHeader splits week-of labels into two lines", () => {
    expect(parseComparePeriodShortLabelForHeader("week of 5/27–6/3", "week of")).toEqual({
      timeframe: "week of",
      dates: "5/27–6/3",
    });
    expect(parseComparePeriodShortLabelForHeader("5/20–6/3", "week of")).toEqual({
      timeframe: "5/20–6/3",
      dates: null,
    });
  });
});
