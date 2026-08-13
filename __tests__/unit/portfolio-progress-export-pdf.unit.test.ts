import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPortfolioProgressExportHtml } from "@/lib/pdf/portfolio-progress-export-pdf";
import { buildPortfolioProgressExportPayload } from "@/lib/reports/portfolio-progress-export";
import { defaultComparePeriod } from "@/lib/reports/portfolio-progress-period";
import { PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS } from "@/lib/reports/portfolio-progress-wireframe-data";
import type { PortfolioProjectSnapshot } from "@/lib/reports/portfolio-progress-types";

const EXPORT_LABELS = {
  documentTitle: "Progress Detail Report",
  periodHeading: "Period",
  compareWindowLabel: "Change vs prior {period}",
  scopeSummaryHeading: "Scope summary",
  colScope: "Scope",
  colVerified: "Verified",
  colVerifiedChange: "Verified change",
  colUnverified: "Unverified",
  colUnverifiedChange: "Unverified change",
  overallVerifiedLabel: "Overall verified",
  levelDetailHeading: "Building and level detail",
  colBuilding: "Building",
  colLevel: "Level",
  colOverall: "Overall",
  colAllLevels: "All",
  colBuildingTotal: "Total",
  colPct: "%",
  colChange: "Change",
  colStart: "Start",
  colLastUpdated: "Updated",
  colEnd: "End",
  unitDetailHeading: "Location detail",
  colUnit: "Unit",
  colSubcontractor: "Subcontractor",
  noChange: "—",
  confidentialFooter: "Confidential",
};

const MULTI_BUILDING_PROJECT: PortfolioProjectSnapshot = {
  id: "UNI-MULTI",
  name: "348 South Temple Apts",
  projectManagerName: "PM",
  installManagerName: null,
  hasChangesInPeriod: true,
  scopeSummaries: [
    { scopeName: "Cabinets", verifiedPct: 5, verifiedDelta: 0, subPct: 0, subDelta: null },
    { scopeName: "Tile", verifiedPct: 19, verifiedDelta: 0, subPct: 0, subDelta: null },
  ],
  buildings: [
    {
      buildingName: "South",
      levels: [
        {
          levelLabel: "Level 1",
          cells: [
            { scopeName: "Cabinets", verifiedPct: 10, verifiedDelta: 0, subPct: 0, subDelta: null, totalUnits: 10 },
            { scopeName: "Tile", verifiedPct: 20, verifiedDelta: 0, subPct: 0, subDelta: null, totalUnits: 10 },
          ],
        },
      ],
    },
    {
      buildingName: "North",
      levels: [
        {
          levelLabel: "Level 0",
          cells: [
            { scopeName: "Cabinets", verifiedPct: 22, verifiedDelta: 3, subPct: 0, subDelta: null, totalUnits: 9 },
            { scopeName: "Tile", verifiedPct: 0, verifiedDelta: 0, subPct: 0, subDelta: null, totalUnits: 8 },
          ],
        },
      ],
    },
  ],
};

function buildHtmlForProject(project: PortfolioProjectSnapshot): string {
  const payload = buildPortfolioProgressExportPayload({
    baseProject: project,
    comparePeriod: defaultComparePeriod(),
    locale: "en",
    labels: EXPORT_LABELS,
    periodPresetLabel: "1 week",
    formatWeekOf: (range) => `week of ${range}`,
    shortAll: "all",
    shortCustom: "range",
  });
  expect(payload).not.toBeNull();
  return buildPortfolioProgressExportHtml(payload!);
}

function scopeBlockHtml(html: string, scopeName: string): string {
  const marker = `<div class="scope-heading">${scopeName}</div>`;
  const start = html.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const nextScope = html.indexOf('<div class="scope-heading">', start + marker.length);
  const nextBuilding = html.indexOf('<div class="building-page-header">', start + marker.length);
  const endCandidates = [nextScope, nextBuilding].filter((i) => i > start);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : html.length;
  return html.slice(start, end);
}

describe("buildPortfolioProgressExportHtml", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders compare period, scope summary, and building rows matching the on-screen grid", () => {
    const html = buildHtmlForProject(PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS[0]);

    expect(html).toContain('class="cover-project">Marina Bay Condos</div>');
    expect(html).toContain('class="cover-report-type">Progress Detail Report</div>');
    expect(html).toContain("Progress Detail Report");
    expect(html).toContain("Marina Bay Condos");
    expect(html).toContain("5/27–6/3");
    expect(html).toContain("1 week");
    expect(html).toContain("Scope summary");
    expect(html).toContain("Cabinets");
    expect(html).toContain("Building and level detail");
    expect(html).toContain("Building: Building A");
    expect(html).toContain('class="building-page-header">Building: Building A</div>');
    expect(html).not.toContain('class="building-thead-banner"');
    expect(html).toContain('class="scope-heading">Cabinets</div>');
    expect(html).not.toContain('class="scope-thead-banner"');
    expect(html).toContain("Level: Level 3");
    expect(html).not.toContain('level-heading">Level 3</div>');
    expect(html).not.toContain('class="building-heading"');
    expect(html).toContain('class="scope-stack-table"');
    expect(html).not.toContain("scope-group-th");
    expect(html).not.toContain('class="rollup-heading rollup-heading--project"');
    expect(html).not.toContain(">All<");
    expect(html).toContain(">Total<");
    expect(html).toContain("13/18");
    expect(html).toContain("(6 units)");
    expect(html).not.toContain("Location detail");
    expect(html).not.toContain("Premier Cabinets LLC");
  });

  it("places the project name above the report type on the cover", () => {
    const html = buildHtmlForProject(PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS[0]);
    const projectIdx = html.indexOf('class="cover-project">Marina Bay Condos</div>');
    const reportIdx = html.indexOf('class="cover-report-type">Progress Detail Report</div>');
    expect(projectIdx).toBeGreaterThan(-1);
    expect(reportIdx).toBeGreaterThan(projectIdx);
  });

  it("groups levels under each scope with a total row instead of level-first tables", () => {
    const html = buildHtmlForProject(PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS[0]);
    const cabinetsBlock = scopeBlockHtml(html, "Cabinets");

    expect(cabinetsBlock).toContain("Level: Level 2");
    expect(cabinetsBlock).toContain("Level: Level 3");
    expect(cabinetsBlock).toContain('class="scope-name">Total</td>');
    expect(cabinetsBlock).not.toContain('class="scope-name">Countertops</td>');
    expect(html).not.toContain('level-heading">Level 3</div>');
  });

  it("labels level rows with the localized Level prefix for PDF readability", () => {
    const html = buildHtmlForProject(PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS[0]);
    expect(html).toContain("Level: Level 3");
    expect(html).not.toContain('>Level 3</td>');
  });

  it("renders one obvious building page header per building and starts each on a new page", () => {
    const html = buildHtmlForProject(MULTI_BUILDING_PROJECT);

    expect(html.match(/class="building-page-header"/g)?.length).toBe(2);
    expect(html).toContain('class="building-page-header">Building: North</div>');
    expect(html).toContain('class="building-page-header">Building: South</div>');
    expect(html).toContain("page-break-before: always");
    expect(html.indexOf('class="building-page-header">Building: North</div>')).toBeLessThan(
      html.indexOf('class="building-page-header">Building: South</div>'),
    );
  });

  it("repeats scope sections per building without a redundant building rollup table", () => {
    const html = buildHtmlForProject(MULTI_BUILDING_PROJECT);
    const northIdx = html.indexOf('class="building-page-header">Building: North</div>');
    const southIdx = html.indexOf('class="building-page-header">Building: South</div>');
    const northSection = html.slice(northIdx, southIdx);

    expect(northSection).toContain('class="scope-heading">Cabinets</div>');
    expect(northSection).toContain('class="scope-heading">Tile</div>');
    expect(northSection).toContain('class="scope-name">Total</td>');
    expect(northSection).not.toContain('class="scope-name">Cabinets</td>');
    expect(html).not.toContain('rollup-heading">Total</div>');
    expect(html).not.toContain(">All<");
  });

  it("keeps only the top scope summary table for project-wide rollups", () => {
    const html = buildHtmlForProject(MULTI_BUILDING_PROJECT);
    const summaryStart = html.indexOf('class="summary-table"');
    const detailStart = html.indexOf("Building and level detail");
    const summarySection = html.slice(summaryStart, detailStart);

    expect(summarySection).toContain("Cabinets");
    expect(summarySection).toContain("Tile");
    expect(html.slice(detailStart)).not.toContain('class="summary-table"');
  });
});
