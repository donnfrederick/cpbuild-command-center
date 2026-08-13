import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { PortfolioProgressWireframe } from "@/components/reports/PortfolioProgressWireframe";
import { PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS } from "@/lib/reports/portfolio-progress-wireframe-data";

const messages = {
  levelScopeReport: {
    level: "Level",
    buildingPrefix: "Building",
    overall: "Overall",
    allLevels: "All",
    colPct: "% verified",
    colChange: "Δ",
    deltaCompareWeekOf: "week of",
    colStart: "Start",
    colLastUpdated: "Last Updated",
    colEnd: "End",
    noChange: "—",
    deltaChange: "Verified install % change vs compare period",
    deltaUnitCount: "{count, plural, one {# location verified this period} other {# locations verified this period}}",
    deltaUnitsInline: "({count, plural, one {# unit} other {# units}})",
    unitCount: "{installed} of {total} locations verified complete",
    dateStarted: "First status update",
    dateLastUpdated: "Last status update",
    dateCompleted: "Verified complete",
    defaultPeriodShort: "1 wk",
    periodWeekOf: "week of {range}",
    periodShortAll: "all",
    periodShortCustom: "range",
    deltaChangeWithPeriod: "Verified install % change vs prior {period}",
    period2w: "2 weeks",
    period30d: "30 days",
    periodAll: "All time",
    periodCustom: "Custom",
    expandLevel: "Expand level unit detail",
    collapseLevel: "Collapse level unit detail",
    levelUnitExpandRowLabel: "Unit numbers for expanded level",
    noSubcontractor: "Unassigned",
  },
  globalReports: {
    portfolioProgress: {
      title: "Global Progress Report",
      subtitle: "Install % by scope per project.",
      wireframeNotice: "Wireframe — sample data only.",
      filterLabel: "Filter projects",
      filterAll: "All projects",
      filterChanged: "With changes",
      filterUnchanged: "No changes",
      projectCount: "{count, plural, one {# project} other {# projects}}",
      emptyFilter: "No projects match this filter.",
      emptyPeopleFilter: "No projects match the selected managers.",
      filterPeopleTitle: "Filter by people",
      filterPeopleSubtitle: "Show projects for selected project managers or install managers.",
      filterPeopleButton: "PM / IM",
      filterPeopleAria: "Filter by project manager or install manager",
      filterPeopleClear: "Clear managers",
      filterUnassigned: "Unassigned",
      searchPlaceholder: "Search by project name…",
      searchAriaLabel: "Search projects",
      clearSearch: "Clear search",
      emptySearch: "No projects match your search.",
      listLoading: "Loading projects…",
      loadError: "Could not load progress report.",
      detailLoading: "Loading level detail…",
      colScope: "Scope",
      verifiedInstalls: "Verified installs",
      unverifiedInstalls: "Unverified installs",
      verifiedShort: "Verified",
      unverifiedShort: "Unverified",
      overallVerifiedLabel: "Overall verified",
      periodCardLabel: "Period",
      showingProgressWeekOf: "Showing progress for week of {range}",
      showingProgressRange: "Showing progress for {range}",
      showingProgressAll: "Showing all-time progress",
      projectMeta: "{count, plural, one {# scope} other {# scopes}} · {status}",
      statusInProgress: "in progress",
      statusComplete: "complete",
      expandFooter: "Expand for building + level detail",
      collapseFooter: "Collapse building + level detail",
      openLevelBreakdown: "Open level breakdown",
      openLevelBreakdownAria: "Open level breakdown for {project}",
      noChange: "—",
      noChangeThisPeriod: "No change this period",
      zeroDeltaThisPeriod: "0% this period",
      deltaThisPeriod: "+{delta}% this period",
      expandProject: "Expand project detail",
      collapseProject: "Collapse project detail",
      levelReportTitle: "Install complete by level",
      levelReportError: "Could not load level table",
      levelReportHint: "Same grid as the project Level Progress Report — each scope has %, start, and end columns.",
      compareHint: "Summary rows show change vs the prior period.",
      deltaUnitsInline: "({count, plural, one {# unit} other {# units}})",
      periodLabel: "Compare changes over",
      period1w: "1 week",
      period2w: "2 weeks",
      period30d: "30 days",
      periodAll: "All time",
      periodCustom: "Custom",
      periodShort1w: "1 wk",
      deltaVsPeriod: "Change vs prior {period}",
      periodShort2w: "2 wk",
      periodShort30d: "30 d",
      periodShortAll: "all",
      periodShortCustom: "range",
      periodWeekOf: "week of {range}",
      customFrom: "From",
      customTo: "To",
      customRangeError: "End date must be on or after start date.",
      periodRangeSummary: "Window: {from} through {to}",
      projectRollupTitle: "{pct}% verified complete across scopes · {delta} vs prior {period}",
      projectPeriodLabel: "Compare period",
      openLocations: "Open locations",
      openLocationsAriaLabel: "Open locations for {project} in a new tab",
      openProjectLocationsPage: "Open project in locations page",
      openProjectLocationsPageAria: "Open {project} in locations page in a new tab",
      exportPdf: "Export building and level detail PDF",
      exportFailed: "Export failed.",
      exportInvalidPeriod: "Choose a valid compare period before exporting.",
      exportDocumentTitle: "Progress Detail Report",
      exportScopeSummaryHeading: "Scope summary",
      exportVerifiedChange: "Verified change",
      exportUnverifiedChange: "Unverified change",
      exportLevelDetailHeading: "Building and level detail",
      exportColBuilding: "Building",
      exportColLevel: "Level",
      exportColOverall: "Overall",
      exportColChange: "Change",
      exportColStart: "Start",
      exportColEnd: "End",
      exportUnitDetailHeading: "Location detail",
      exportColUnit: "Unit",
      exportColSubcontractor: "Subcontractor",
      exportConfidentialFooter: "Confidential",
    },
  },
  projects: {
    installManager: "Install Manager",
    projectManager: "Project Manager",
  },
  common: {
    close: "Close",
    apply: "Apply",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

async function openLevelBreakdown(name: string) {
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`Open level breakdown for ${name}`) }),
  );
  await waitFor(() => {
    expect(screen.getByRole("dialog")).toBeDefined();
  });
  await waitFor(() => {
    expect(within(screen.getByRole("dialog")).getByText("Install complete by level")).toBeDefined();
  });
  await waitFor(() => {
    expect(screen.queryByText("Loading level detail…")).toBeNull();
  });
}

function getLevelBreakdownDialog() {
  return screen.getByRole("dialog");
}

function closeLevelBreakdown() {
  fireEvent.click(within(getLevelBreakdownDialog()).getByRole("button", { name: "Close" }));
}

function mockGlobalProgressFetch() {
  const listProjects = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.map((p) => ({
    id: p.id,
    name: p.name,
    unifierPid: p.id,
    projectManagerName: p.projectManagerName,
    installManagerName: p.installManagerName,
    hasChangesInPeriod: p.hasChangesInPeriod,
    scopeSummaries: p.scopeSummaries,
  }));

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.startsWith("/api/reports/global-progress?")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              comparePeriod: { preset: "1w", from: "2025-05-25", to: "2025-06-01" },
              projects: listProjects,
            }),
        });
      }
      const detailMatch = url.match(/^\/api\/reports\/global-progress\/([^?]+)/);
      if (detailMatch) {
        const projectId = decodeURIComponent(detailMatch[1]!);
        const project = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.find((p) => p.id === projectId);
        return Promise.resolve({
          ok: Boolean(project),
          json: () =>
            Promise.resolve(
              project
                ? {
                    comparePeriod: { preset: "1w", from: "2025-05-25", to: "2025-06-01" },
                    project,
                  }
                : { error: "Not found" },
            ),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }),
  );
}

async function renderPortfolioReport() {
  render(<PortfolioProgressWireframe />, { wrapper: Wrapper });
  await waitFor(() => {
    expect(screen.getByText("Marina Bay Condos")).toBeDefined();
  });
}

function getGlobalPeriodTrigger(label = "1 week", options?: { hidden?: boolean }) {
  return screen.getByRole("button", {
    name: new RegExp(`Compare changes over, ${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    hidden: options?.hidden,
  });
}

function openGlobalPeriodMenu() {
  fireEvent.click(getGlobalPeriodTrigger());
}

function selectGlobalPeriodOption(label: string) {
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
}

function getModalPeriodTrigger(dialog: HTMLElement, label = "1 week") {
  return within(dialog).getByRole("button", {
    name: new RegExp(
      `Compare period, ${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  });
}

function openModalPeriodMenu(dialog: HTMLElement) {
  fireEvent.click(getModalPeriodTrigger(dialog));
}

function selectModalPeriodOption(dialog: HTMLElement, label: string) {
  fireEvent.click(within(dialog).getByRole("menuitemradio", { name: label }));
}

describe("PortfolioProgressWireframe", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockGlobalProgressFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders all mock projects by default", async () => {
    await renderPortfolioReport();
    expect(screen.getByText("Oak Grove Residences")).toBeDefined();
    expect(screen.getByText("Riverside Apartments Phase 2")).toBeDefined();
  });

  it("shows open project in locations page link on each card", async () => {
    await renderPortfolioReport();
    const links = screen.getAllByRole("link", {
      name: /Open .+ in locations page in a new tab/,
    });
    expect(links.length).toBe(3);
    expect(links[0]?.getAttribute("href")).toMatch(/^\/en\/projects\/.+\/units$/);
    expect(links[0]?.getAttribute("target")).toBe("_blank");
  });

  it("shows 0% instead of negative delta on scope rows", async () => {
    await renderPortfolioReport();
    const marinaCard = screen.getByText("Marina Bay Condos").closest(".portfolio-project-card");
    expect(marinaCard).not.toBeNull();
    const tileRow = within(marinaCard as HTMLElement)
      .getByText("Tile")
      .closest(".portfolio-scope-progress-row");
    expect(tileRow).not.toBeNull();
    expect(within(tileRow as HTMLElement).queryByText("-2%")).toBeNull();
    expect(within(tileRow as HTMLElement).getByText("0%")).toBeDefined();
  });

  it("filters to projects with changes only", async () => {
    await renderPortfolioReport();
    fireEvent.click(screen.getByRole("tab", { name: "With changes" }));
    expect(screen.getByText("Marina Bay Condos")).toBeDefined();
    expect(screen.getByText("Riverside Apartments Phase 2")).toBeDefined();
    expect(screen.queryByText("Oak Grove Residences")).toBeNull();
  });

  it("filters projects by search query on name", async () => {
    await renderPortfolioReport();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), {
      target: { value: "marina" },
    });
    expect(screen.getByText("Marina Bay Condos")).toBeDefined();
    expect(screen.queryByText("Oak Grove Residences")).toBeNull();
    expect(screen.queryByText("Riverside Apartments Phase 2")).toBeNull();
  });

  it("filters projects by project manager via people filter panel", async () => {
    await renderPortfolioReport();
    fireEvent.click(screen.getByRole("button", { name: "Filter by project manager or install manager" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Jon Hiller" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(screen.getByText("Marina Bay Condos")).toBeDefined();
    expect(screen.getByText("Riverside Apartments Phase 2")).toBeDefined();
    expect(screen.queryByText("Oak Grove Residences")).toBeNull();
  });

  it("filters projects by unassigned install manager", async () => {
    await renderPortfolioReport();
    fireEvent.click(screen.getByRole("button", { name: "Filter by project manager or install manager" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unassigned" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(screen.getByText("Oak Grove Residences")).toBeDefined();
    expect(screen.queryByText("Marina Bay Condos")).toBeNull();
  });

  it("shows empty search message when no project matches", async () => {
    await renderPortfolioReport();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), {
      target: { value: "zzzznotfound" },
    });
    expect(screen.getByText("No projects match your search.")).toBeDefined();
  });

  it("clears search with the clear button", async () => {
    await renderPortfolioReport();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), {
      target: { value: "marina" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("Oak Grove Residences")).toBeDefined();
  });

  it("shows full-size skeleton while level detail loads", async () => {
    let resolveDetail: (() => void) | undefined;
    const detailDeferred = new Promise<void>((resolve) => {
      resolveDetail = resolve;
    });

    const listProjects = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.map((p) => ({
      id: p.id,
      name: p.name,
      unifierPid: p.id,
      projectManagerName: p.projectManagerName,
      installManagerName: p.installManagerName,
      hasChangesInPeriod: p.hasChangesInPeriod,
      scopeSummaries: p.scopeSummaries,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.startsWith("/api/reports/global-progress?")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                comparePeriod: { preset: "1w", from: "2025-05-25", to: "2025-06-01" },
                projects: listProjects,
              }),
          });
        }
        const detailMatch = url.match(/^\/api\/reports\/global-progress\/([^?]+)/);
        if (detailMatch) {
          return detailDeferred.then(() => {
            const projectId = decodeURIComponent(detailMatch[1]!);
            const project = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS.find((p) => p.id === projectId);
            return {
              ok: Boolean(project),
              json: () =>
                Promise.resolve(
                  project
                    ? {
                        comparePeriod: { preset: "1w", from: "2025-05-25", to: "2025-06-01" },
                        project,
                      }
                    : { error: "Not found" },
                ),
            };
          });
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }),
    );

    await renderPortfolioReport();
    fireEvent.click(
      screen.getByRole("button", { name: /Open level breakdown for Marina Bay Condos/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });

    const dialog = getLevelBreakdownDialog();
    expect(
      within(dialog).getByRole("status", { name: "Loading level detail…" }),
    ).toBeDefined();
    expect(dialog.querySelector(".portfolio-progress-level-breakdown-skeleton")).not.toBeNull();
    expect(within(dialog).queryByText("Building A")).toBeNull();

    resolveDetail!();
    await waitFor(() => {
      expect(within(dialog).getByText("A")).toBeDefined();
    });
  });

  it("renders sticky building headers inside the modal scroll body", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");

    const dialog = getLevelBreakdownDialog();
    expect(dialog.className).toContain("translate-none");
    expect(dialog.className).not.toMatch(/translate-x/);
    expect(dialog.className).toContain("top-[4dvh]");
    expect(dialog.querySelector(".portfolio-progress-level-breakdown-modal-body")).not.toBeNull();
    expect(dialog.querySelector(".level-scope-building-sticky-head")).not.toBeNull();
    expect(dialog.querySelector(".level-scope-head--building")).not.toBeNull();
    expect(dialog.querySelector(".level-scope-building-head-bar")).toBeNull();
    expect(dialog.querySelector(".level-scope-grid-modal-rows-scroll")).not.toBeNull();
    expect(dialog.querySelector(".level-scope-grid-modal-footer")).not.toBeNull();
    expect(within(dialog).getByText("A")).toBeDefined();
    expect(within(dialog).getByText("All")).toBeDefined();
  });

  it("shows Level Progress Report grid when level breakdown modal is open", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");
    expect(within(getLevelBreakdownDialog()).getByText("Marina Bay Condos")).toBeDefined();
    expect(screen.getAllByText("Install complete by level").length).toBeGreaterThan(0);
    expect(screen.getByText("A")).toBeDefined();
    expect(screen.queryByRole("columnheader", { name: "Level" })).toBeNull();
    expect(screen.getAllByText("Overall").length).toBeGreaterThan(0);
  });

  it("lists all Marina Bay levels 2–12 in the level breakdown modal", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(screen.getAllByText(`Level ${n}`).length).toBeGreaterThan(0);
    }
  });

  it("shows per-scope Start and End columns in the level breakdown modal", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");
    expect(screen.getAllByText("Start").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("First status update").length).toBeGreaterThan(0);
  });

  it("shows per-scope Δ change column in the level breakdown modal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");
    expect(screen.getAllByText("week of").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5/27–6/3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+3%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("(6 units)").length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("shows unit count beside % delta in the level breakdown modal", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");
    expect(screen.getAllByText("(6 units)").length).toBeGreaterThan(0);
  });

  it("shows installed/total unit count beside % in the level breakdown modal", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");
    expect(screen.getAllByText("13/18").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Expand level unit detail:/ })).toBeNull();
  });

  it("shows Cabinets scope with verified percent and paired delta", async () => {
    await renderPortfolioReport();
    expect(screen.getAllByText(/Cabinets/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/62%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+4%/).length).toBeGreaterThan(0);
  });

  it("does not show period badge blocks on project cards", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    await renderPortfolioReport();
    expect(
      document.querySelectorAll(".portfolio-project-card .portfolio-project-card-period-block").length,
    ).toBe(0);
    vi.useRealTimers();
  });

  it("shows filter count on the period row and the report window dates", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    await renderPortfolioReport();
    expect(document.querySelector(".portfolio-progress-summary-metrics")).toBeNull();
    expect(document.querySelector(".portfolio-progress-filter-count")?.textContent).toBe(
      "3 projects",
    );
    expect(screen.getByText("Showing progress for week of 5/27–6/3")).toBeDefined();
    expect(screen.queryByText(/Over this period/)).toBeNull();
    expect(screen.queryByText(/Changes compare to prior/)).toBeNull();
    vi.useRealTimers();
  });

  it("updates filter count when filter narrows the list", async () => {
    await renderPortfolioReport();
    expect(document.querySelector(".portfolio-progress-filter-count")?.textContent).toBe(
      "3 projects",
    );
    fireEvent.click(screen.getByRole("tab", { name: "With changes" }));
    expect(document.querySelector(".portfolio-progress-filter-count")?.textContent).toBe(
      "2 projects",
    );
  });

  it("shows project meta with scope count and status", async () => {
    await renderPortfolioReport();
    expect(screen.getByText("3 scopes · in progress")).toBeDefined();
    expect(screen.getByText("2 scopes · complete")).toBeDefined();
  });

  it("uses Verified and Unverified column headers with progress bars", async () => {
    await renderPortfolioReport();
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unverified").length).toBeGreaterThan(0);
    expect(document.querySelector(".portfolio-scope-progress-bar-fill--verified")).toBeDefined();
    expect(document.querySelector(".portfolio-scope-progress-bar-fill--unverified")).toBeDefined();
  });

  it("shows overall verified rollup with this-period delta text on each project card", async () => {
    await renderPortfolioReport();
    expect(screen.getAllByText("Overall verified").length).toBeGreaterThan(0);
    expect(document.querySelector(".portfolio-project-card-rollup-delta-text--up")).toBeDefined();
    expect(screen.getAllByText(/this period/).length).toBeGreaterThan(0);
  });

  it("shows Open level breakdown button on each project card", async () => {
    await renderPortfolioReport();
    expect(screen.getAllByText("Open level breakdown").length).toBe(3);
    expect(document.querySelectorAll(".portfolio-project-card-detail-toggle").length).toBe(3);
  });

  it("shows project verified rollup title on the metrics block", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
    await renderPortfolioReport();
    expect(screen.getByTitle(/44% verified complete across scopes · \+2% this period vs prior week of 5\/27–6\/3/)).toBeDefined();
    expect(screen.getByTitle(/70% verified complete across scopes · \+18% this period vs prior week of 5\/27–6\/3/)).toBeDefined();
    expect(screen.getByTitle(/100% verified complete across scopes · No change this period vs prior week of 5\/27–6\/3/)).toBeDefined();
    vi.useRealTimers();
  });

  it("renders compare period dropdown with 1 week selected by default", async () => {
    await renderPortfolioReport();
    expect(getGlobalPeriodTrigger()).toBeDefined();
    expect(getGlobalPeriodTrigger().textContent).toContain("1 week");
  });

  it("shows custom date inputs when Custom period is selected", async () => {
    await renderPortfolioReport();
    openGlobalPeriodMenu();
    selectGlobalPeriodOption("Custom");
    expect(document.getElementById("portfolio-progress-from")).toBeDefined();
    expect(document.getElementById("portfolio-progress-to")).toBeDefined();
  });

  it("excludes 100% complete projects when All time and With changes filters apply", async () => {
    await renderPortfolioReport();
    openGlobalPeriodMenu();
    selectGlobalPeriodOption("All time");
    fireEvent.click(screen.getByRole("tab", { name: "With changes" }));
    expect(screen.getByText("Marina Bay Condos")).toBeDefined();
    expect(screen.queryByText("Oak Grove Residences")).toBeNull();
  });

  it("project compare period drives the level breakdown modal content", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");

    const dialog = getLevelBreakdownDialog();
    openModalPeriodMenu(dialog);
    selectModalPeriodOption(dialog, "2 weeks");

    expect(within(dialog).getByText("Install complete by level")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText("A")).toBeDefined();
    });

    expect(getModalPeriodTrigger(dialog, "2 weeks").textContent).toContain("2 weeks");
  });

  it("keeps global compare period independent of the modal compare period", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");
    const dialog = getLevelBreakdownDialog();
    openModalPeriodMenu(dialog);
    selectModalPeriodOption(dialog, "2 weeks");

    expect(getGlobalPeriodTrigger("1 week", { hidden: true })).toBeEnabled();
    expect(getGlobalPeriodTrigger("1 week", { hidden: true }).textContent).toContain("1 week");
  });

  it("keeps level breakdown content when the project list refetches", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Oak Grove Residences");
    const dialog = getLevelBreakdownDialog();
    expect(within(dialog).getByText("Level 4")).toBeDefined();

    fireEvent.click(getGlobalPeriodTrigger("1 week", { hidden: true }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "2 weeks", hidden: true }));
    await waitFor(() => {
      expect(getGlobalPeriodTrigger("2 weeks", { hidden: true })).toBeEnabled();
    });

    expect(within(getLevelBreakdownDialog()).getByText("Level 4")).toBeDefined();
    expect(within(getLevelBreakdownDialog()).queryByText("Loading level detail…")).toBeNull();
  });

  it("closes the level breakdown modal from the dialog close button", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");
    expect(screen.getByText("A")).toBeDefined();

    closeLevelBreakdown();

    await waitFor(() => {
      expect(screen.queryByText("Building A")).toBeNull();
    });
    expect(screen.getAllByText("Open level breakdown").length).toBe(3);
  });

  it("shows export PDF button in the level breakdown modal", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");
    expect(
      screen.getByRole("button", { name: "Export building and level detail PDF" }),
    ).toBeDefined();
  });

  it("does not show open locations in the level breakdown modal", async () => {
    await renderPortfolioReport();
    await openLevelBreakdown("Marina Bay Condos");

    const dialog = getLevelBreakdownDialog();
    expect(within(dialog).queryByRole("link", { name: /Open locations for/i })).toBeNull();

    const overall = dialog.querySelector(".portfolio-progress-level-breakdown-overall");
    expect(overall).not.toBeNull();
    expect(
      overall?.querySelector(".portfolio-progress-level-breakdown-overall-pct")?.textContent,
    ).toMatch(/%/);
    expect(dialog.querySelector(".level-scope-grid-sticky-overall-rail")).toBeNull();
  });
});
