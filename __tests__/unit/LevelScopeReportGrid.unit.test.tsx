import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LevelScopeReportGrid } from "@/components/projects/LevelScopeReportGrid";
import type { LevelScopeReportData } from "@/lib/level-scope-report";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const messages = {
  levelScopeReport: {
    level: "Level",
    buildingPrefix: "Building",
    overall: "Overall",
    allLevels: "All",
    buildingTotal: "Total",
    colPct: "% verified",
    colChange: "Δ",
    deltaCompareWeekOf: "week of",
    period2w: "2 weeks",
    period30d: "30 days",
    periodAll: "All time",
    periodCustom: "Custom",
    colStart: "Start",
    colLastUpdated: "Last Updated",
    colEnd: "End",
    noChange: "—",
    periodWeekOf: "week of {range}",
    periodShortAll: "all",
    periodShortCustom: "range",
    deltaChangeWithPeriod: "Verified install % change vs prior {period}",
    unitCount: "{installed} of {total} locations verified complete",
    deltaChange: "Verified install % change vs compare period",
    deltaUnitCount: "{count, plural, one {# location verified this period} other {# locations verified this period}}",
    deltaUnitsInline: "({count, plural, one {# unit} other {# units}})",
    dateStarted: "First status update",
    dateLastUpdated: "Last status update",
    dateCompleted: "Verified complete",
    expandLevel: "Expand level unit detail",
    collapseLevel: "Collapse level unit detail",
    levelUnitExpandRowLabel: "Unit numbers for expanded level",
    noSubcontractor: "Unassigned",
  },
};

const reportWithDates: LevelScopeReportData = {
  levels: ["Level 2"],
  scopes: ["Cabinets", "Tile"],
  data: {
    "Level 2": {
      Cabinets: {
        pct: 70,
        subPct: 0,
        installedQty: 14,
        totalQty: 20,
        notStartedQty: 0,
        stagingQty: 0,
        assemblyQty: 0,
        installInProgressQty: 0,
        installCompleteSubQty: 0,
        startedOn: "2025-01-06",
        completedOn: null,
        verifiedDelta: 5,
        verifiedUnitDelta: 1,
      },
      Tile: {
        pct: 100,
        subPct: 0,
        installedQty: 100,
        totalQty: 100,
        notStartedQty: 0,
        stagingQty: 0,
        assemblyQty: 0,
        installInProgressQty: 0,
        installCompleteSubQty: 0,
        startedOn: "2025-02-03",
        completedOn: "2025-04-12",
        verifiedDelta: null,
      },
    },
  },
  overallByLevel: { "Level 2": 85 },
  overallByScope: { Cabinets: 70, Tile: 100 },
  grandTotalPct: 85,
  levelOverallUnits: { "Level 2": { installedQty: 17, totalQty: 20 } },
  buildings: ["Building A"],
  levelToBuilding: { "Level 2": "Building A" },
  overallDeltaByScope: { Cabinets: 5, Tile: null },
  overallUnitDeltaByScope: { Cabinets: 1, Tile: null },
};

const reportNoDates: LevelScopeReportData = {
  ...reportWithDates,
  data: {
    "Level 2": {
      Cabinets: {
        pct: 70,
        subPct: 0,
        installedQty: 0,
        totalQty: 100,
        notStartedQty: 0,
        stagingQty: 0,
        assemblyQty: 0,
        installInProgressQty: 0,
        installCompleteSubQty: 0,
      },
      Tile: {
        pct: 100,
        subPct: 0,
        installedQty: 100,
        totalQty: 100,
        notStartedQty: 0,
        stagingQty: 0,
        assemblyQty: 0,
        installInProgressQty: 0,
        installCompleteSubQty: 0,
      },
    },
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}


function mockFittingDimensions() {
  const scrollDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
  const clientDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");

  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.classList?.contains("level-scope-units")) return 30;
    return scrollDesc?.get?.call(this) ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.classList?.contains("level-scope-units")) return 40;
    return clientDesc?.get?.call(this) ?? 0;
  });
}

function mockTruncatedDimensions() {
  const scrollDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
  const clientDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");

  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.classList?.contains("level-scope-units")) return 120;
    return scrollDesc?.get?.call(this) ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    if (this.classList?.contains("level-scope-units")) return 40;
    return clientDesc?.get?.call(this) ?? 0;
  });
}

function mockMatchMedia(mobile: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: query.includes("max-width: 767px") ? mobile : !mobile,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList);
}

const reportWithLongUnitCounts: LevelScopeReportData = {
  levels: ["Level 2"],
  scopes: ["Carpet Tile"],
  data: {
    "Level 2": {
      "Carpet Tile": {
        pct: 0,
        subPct: 0,
        installedQty: 12345,
        totalQty: 12,
        notStartedQty: 0,
        stagingQty: 0,
        assemblyQty: 0,
        installInProgressQty: 0,
        installCompleteSubQty: 0,
      },
    },
  },
  overallByLevel: { "Level 2": 0 },
  overallByScope: { "Carpet Tile": 0 },
  grandTotalPct: 0,
  levelOverallUnits: { "Level 2": { installedQty: 12345, totalQty: 12 } },
  buildings: ["Building A"],
  levelToBuilding: { "Level 2": "Building A" },
};

describe("LevelScopeReportGrid", () => {
  it("wraps each building badge and column headers in a sticky head for vertical scroll", () => {
    render(<LevelScopeReportGrid report={reportWithDates} showScopeDates />, { wrapper: Wrapper });
    expect(document.querySelector(".level-scope-building-sticky-head")).toBeDefined();
    expect(document.querySelector(".level-scope-building-badge")).toBeDefined();
    expect(document.querySelector(".level-scope-building-header-anchor")).toBeDefined();
    expect(document.querySelector(".level-scope-head--building")).toBeDefined();
    expect(document.querySelector(".level-scope-building-head-bar")).toBeNull();
    expect(document.querySelectorAll(".level-scope-cell--left").length).toBeGreaterThan(0);
  });

  it("labels buildings with icon + short name and locations-page stripe colors", () => {
    const report = {
      ...reportWithDates,
      buildings: ["1"],
      levelToBuilding: { "Level 2": "1" },
    };
    render(<LevelScopeReportGrid report={report} showScopeDates />, { wrapper: Wrapper });
    expect(screen.getByText("1")).toBeDefined();
    const badge = document.querySelector(".level-scope-building-badge") as HTMLElement | null;
    expect(badge).not.toBeNull();
    expect(badge?.style.backgroundColor).toBeTruthy();
    expect(badge?.querySelector("svg")).not.toBeNull();
  });

  it("pins overall percent in a sticky rail on the right", () => {
    render(<LevelScopeReportGrid report={reportWithDates} showScopeDates showGrandTotal />, {
      wrapper: Wrapper,
    });
    expect(document.querySelector(".level-scope-grid-sticky-overall-rail")).toBeDefined();
    expect(document.querySelector(".level-scope-overall-badge")?.textContent).toMatch(/%/);
  });

  it("renders a sticky building badge column for horizontal scroll", () => {
    render(<LevelScopeReportGrid report={reportWithDates} showScopeDates />, { wrapper: Wrapper });
    expect(document.querySelector(".level-scope-head--building")).toBeDefined();
    expect(document.querySelectorAll(".level-scope-cell--left").length).toBeGreaterThan(0);
  });

  it("renders per-scope % Start End columns when dates are present", () => {
    render(<LevelScopeReportGrid report={reportWithDates} />, { wrapper: Wrapper });
    expect(screen.getAllByText("Start").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("End").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/1\/6\/25/)).toBeDefined();
    expect(screen.getByText(/4\/12\/25/)).toBeDefined();
  });

  it("renders installed/total unit count beside % when totalQty > 0", () => {
    render(<LevelScopeReportGrid report={reportWithDates} showScopeDates />, { wrapper: Wrapper });
    expect(screen.getAllByText("14/20").length).toBeGreaterThan(0);
  });

  it("renders Δ column when verifiedDelta is present", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    render(<LevelScopeReportGrid report={reportWithDates} showScopeDates showScopeDeltas />, {
      wrapper: Wrapper,
    });
    expect(screen.getAllByText("week of").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5/27–6/3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+5%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("(1 unit)").length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("uses comparePeriod for two-line delta header labels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    render(
      <LevelScopeReportGrid
        report={reportWithDates}
        showScopeDates
        showScopeDeltas
        comparePeriod={{ preset: "2w", customFrom: "", customTo: "" }}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getAllByText("2 weeks").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5/20–6/3").length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("expands level to show unit detail when levelUnitDetails exist", () => {
    const report = {
      ...reportWithDates,
      levelUnitDetails: {
        "Level 2": [
          {
            unitLabel: "201",
            scopeName: "Cabinets",
            verifiedPct: 100,
            updatedThisPeriod: true,
            subcontractor: "Premier Cabinets LLC",
            verifiedOn: "2025-05-20",
          },
        ],
      },
    };
    render(<LevelScopeReportGrid report={report} showScopeDates showScopeDeltas enableLevelUnitExpand />, {
      wrapper: Wrapper,
    });
    fireEvent.click(screen.getByRole("button", { name: /Expand level unit detail: Level 2/ }));
    expect(screen.getByText("Premier Cabinets LLC")).toBeDefined();
    expect(screen.getAllByText("201").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Unit numbers for expanded level")).toBeTruthy();
  });

  it("allows expanding any level when report supports unit drill-down, even without per-level rows", () => {
    const report = {
      ...reportWithDates,
      levelUnitDetails: {},
    };
    render(<LevelScopeReportGrid report={report} showScopeDates showScopeDeltas enableLevelUnitExpand />, {
      wrapper: Wrapper,
    });
    fireEvent.click(screen.getByRole("button", { name: /Expand level unit detail: Level 2/ }));
    expect(screen.getByLabelText("Unit numbers for expanded level")).toBeDefined();
  });

  it("does not make levels expandable when enableLevelUnitExpand is false", () => {
    const report = {
      ...reportWithDates,
      levelUnitDetails: {
        "Level 2": [
          {
            unitLabel: "201",
            scopeName: "Cabinets",
            verifiedPct: 100,
            updatedThisPeriod: true,
            subcontractor: "Premier Cabinets LLC",
          },
        ],
      },
    };
    render(<LevelScopeReportGrid report={report} showScopeDates showScopeDeltas enableLevelUnitExpand={false} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByRole("button", { name: /Expand level unit detail: Level 2/ })).toBeNull();
  });

  it("does not make levels expandable when levelUnitDetails is omitted", () => {
    render(<LevelScopeReportGrid report={reportWithDates} showScopeDates showScopeDeltas />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByRole("button", { name: /Expand level unit detail: Level 2/ })).toBeNull();
  });

  it("does not render expand content in the Overall column", () => {
    const report = {
      ...reportWithDates,
      levelUnitDetails: {
        "Level 2": [
          {
            unitLabel: "201",
            scopeName: "Cabinets",
            verifiedPct: 100,
            updatedThisPeriod: true,
            subcontractor: "Premier Cabinets LLC",
          },
        ],
      },
    };
    render(<LevelScopeReportGrid report={report} showScopeDates showScopeDeltas enableLevelUnitExpand />, {
      wrapper: Wrapper,
    });
    fireEvent.click(screen.getByRole("button", { name: /Expand level unit detail: Level 2/ }));
    const expandPanel = screen.getByLabelText("Unit numbers for expanded level");
    expect(expandPanel.querySelector(".level-scope-unit-expand-divider")).toBeNull();
  });

  it("uses single column per scope when no dates", () => {
    render(<LevelScopeReportGrid report={reportNoDates} />, { wrapper: Wrapper });
    expect(screen.queryByText("Start")).toBeNull();
    expect(screen.queryByText(/1\/6\/25/)).toBeNull();
  });

  it("omits building total rows when the project has only one building", () => {
    render(<LevelScopeReportGrid report={reportWithDates} showScopeDates />, { wrapper: Wrapper });
    expect(screen.queryByText("Total")).toBeNull();
    expect(screen.getByText("All")).toBeDefined();
    expect(document.querySelector(".level-scope-grid-row--building-total")).toBeNull();
  });

  it("renders a building total row inside each building section and a project All footer", () => {
    const report: LevelScopeReportData = {
      ...reportWithDates,
      levels: ["Building A › Level 1", "Building A › Level 2", "Building B › Level 3"],
      buildings: ["Building A", "Building B"],
      levelToBuilding: {
        "Building A › Level 1": "Building A",
        "Building A › Level 2": "Building A",
        "Building B › Level 3": "Building B",
      },
      data: {
        "Building A › Level 1": reportWithDates.data["Level 2"]!,
        "Building A › Level 2": reportWithDates.data["Level 2"]!,
        "Building B › Level 3": reportWithDates.data["Level 2"]!,
      },
      overallByLevel: {
        "Building A › Level 1": 85,
        "Building A › Level 2": 85,
        "Building B › Level 3": 85,
      },
      levelOverallUnits: {
        "Building A › Level 1": { installedQty: 17, totalQty: 20 },
        "Building A › Level 2": { installedQty: 17, totalQty: 20 },
        "Building B › Level 3": { installedQty: 17, totalQty: 20 },
      },
    };
    render(<LevelScopeReportGrid report={report} showScopeDates />, { wrapper: Wrapper });
    expect(screen.getAllByText("Total")).toHaveLength(2);
    expect(screen.getByText("All")).toBeDefined();
    expect(document.querySelectorAll(".level-scope-grid-row--building-total")).toHaveLength(2);
  });

  it("aggregates building total scope counts across levels in that building", () => {
    const report: LevelScopeReportData = {
      ...reportWithDates,
      levels: ["Building A › Level 1", "Building A › Level 2", "Building B › Level 3"],
      buildings: ["Building A", "Building B"],
      levelToBuilding: {
        "Building A › Level 1": "Building A",
        "Building A › Level 2": "Building A",
        "Building B › Level 3": "Building B",
      },
      data: {
        "Building A › Level 1": {
          Cabinets: {
            pct: 50,
            subPct: 0,
            installedQty: 5,
            totalQty: 10,
            notStartedQty: 0,
            stagingQty: 0,
            assemblyQty: 0,
            installInProgressQty: 0,
            installCompleteSubQty: 0,
          },
        },
        "Building A › Level 2": {
          Cabinets: {
            pct: 100,
            subPct: 0,
            installedQty: 10,
            totalQty: 10,
            notStartedQty: 0,
            stagingQty: 0,
            assemblyQty: 0,
            installInProgressQty: 0,
            installCompleteSubQty: 0,
          },
        },
        "Building B › Level 3": reportWithDates.data["Level 2"]!,
      },
      overallByLevel: {
        "Building A › Level 1": 50,
        "Building A › Level 2": 100,
        "Building B › Level 3": 85,
      },
      levelOverallUnits: {
        "Building A › Level 1": { installedQty: 5, totalQty: 10 },
        "Building A › Level 2": { installedQty: 10, totalQty: 10 },
        "Building B › Level 3": { installedQty: 17, totalQty: 20 },
      },
    };
    render(<LevelScopeReportGrid report={report} />, { wrapper: Wrapper });
    const buildingTotalRows = document.querySelectorAll(".level-scope-grid-row--building-total");
    expect(buildingTotalRows).toHaveLength(2);
    expect(buildingTotalRows[0]?.textContent).toContain("15/20");
    expect(buildingTotalRows[0]?.textContent).toContain("75%");
  });

  describe("truncated unit counts", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("wraps unit count text for ellipsis truncation", () => {
      mockTruncatedDimensions();
      render(<LevelScopeReportGrid report={reportWithLongUnitCounts} />, { wrapper: Wrapper });
      const unitCount = screen.getAllByText("12345/12")[0];
      expect(unitCount.className).toContain("level-scope-units");
      expect(unitCount.parentElement?.className).toContain("level-scope-units-wrap");
    });

    it("shows custom tooltip on desktop hover", async () => {
      mockMatchMedia(false);
      mockTruncatedDimensions();
      render(<LevelScopeReportGrid report={reportWithLongUnitCounts} />, { wrapper: Wrapper });
      const unitCount = screen.getAllByText("12345/12")[0];
      expect(unitCount).not.toHaveAttribute("title");
      expect(screen.queryByRole("tooltip")).toBeNull();

      fireEvent.mouseEnter(unitCount);
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "12345 of 12 locations verified complete",
      );

      fireEvent.mouseLeave(unitCount);
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("shows custom tooltip on desktop hover when unit count fits", async () => {
      mockMatchMedia(false);
      mockFittingDimensions();
      render(<LevelScopeReportGrid report={reportWithDates} showScopeDates />, { wrapper: Wrapper });
      const unitCount = screen.getAllByText("14/20")[0];
      expect(unitCount).not.toHaveAttribute("title");

      fireEvent.mouseEnter(unitCount);
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "14 of 20 locations verified complete",
      );

      fireEvent.mouseLeave(unitCount);
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("shows a click tooltip with the full value on mobile", async () => {
      mockMatchMedia(true);
      mockTruncatedDimensions();
      render(<LevelScopeReportGrid report={reportWithLongUnitCounts} />, { wrapper: Wrapper });
      const unitCount = screen.getAllByText("12345/12")[0];
      await waitFor(() => {
        expect(unitCount).toHaveAttribute("role", "button");
      });
      expect(unitCount).not.toHaveAttribute("title");
      expect(screen.queryByRole("tooltip")).toBeNull();

      fireEvent.click(unitCount);

      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent("12345 of 12 locations verified complete");
    });

    it("does not expose a mobile button when unit count fits", async () => {
      mockMatchMedia(true);
      mockFittingDimensions();
      render(<LevelScopeReportGrid report={reportWithLongUnitCounts} />, { wrapper: Wrapper });
      const unitCount = screen.getAllByText("12345/12")[0];
      expect(unitCount).not.toHaveAttribute("role", "button");
      expect(unitCount).not.toHaveAttribute("tabIndex");
    });

    it("sets aria-label to the translated unit count when truncated", () => {
      mockTruncatedDimensions();
      render(<LevelScopeReportGrid report={reportWithLongUnitCounts} />, { wrapper: Wrapper });
      const unitCount = screen.getAllByText("12345/12")[0];
      expect(unitCount).toHaveAttribute(
        "aria-label",
        "12345 of 12 locations verified complete",
      );
    });

    it("auto-dismisses the mobile click tooltip after 3 seconds", async () => {
      mockMatchMedia(true);
      mockTruncatedDimensions();
      render(<LevelScopeReportGrid report={reportWithLongUnitCounts} />, { wrapper: Wrapper });
      const unitCount = screen.getAllByText("12345/12")[0];
      await waitFor(() => {
        expect(unitCount).toHaveAttribute("role", "button");
      });

      vi.useFakeTimers();
      try {
        fireEvent.click(unitCount);
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          "12345 of 12 locations verified complete",
        );
        act(() => {
          vi.advanceTimersByTime(3000);
        });
      } finally {
        vi.useRealTimers();
      }
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });
});
