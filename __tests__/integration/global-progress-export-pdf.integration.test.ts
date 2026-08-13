import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/pdf/portfolio-progress-export-pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/portfolio-progress-export-pdf")>();
  return {
    ...actual,
    buildPortfolioProgressExportPdf: vi.fn(),
  };
});

import { POST } from "@/app/api/reports/global-progress/export-pdf/route";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import {
  buildPortfolioProgressExportHtml,
  buildPortfolioProgressExportPdf,
} from "@/lib/pdf/portfolio-progress-export-pdf";
import { buildPortfolioProgressExportPayload } from "@/lib/reports/portfolio-progress-export";
import { defaultComparePeriod } from "@/lib/reports/portfolio-progress-period";
import { PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS } from "@/lib/reports/portfolio-progress-wireframe-data";

const mockGetEffectiveSession = vi.mocked(getEffectiveSession);
const mockEnforceVisibility = vi.mocked(enforceProjectReadVisibility);
const mockBuildPdf = vi.mocked(buildPortfolioProgressExportPdf);

const SESSION = {
  user: {
    id: "user-1",
    email: "gc@example.com",
    role: "MEMBER",
    name: "GC User",
    specialPermissions: [],
  },
};

const EXPORT_LABELS = {
  documentTitle: "Progress Detail Report",
  periodHeading: "Period",
  compareWindowLabel: "Change vs prior week of 5/27–6/3",
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

function marinaPayload() {
  const project = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS[0];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-03T12:00:00"));
  const payload = buildPortfolioProgressExportPayload({
    baseProject: project,
    comparePeriod: defaultComparePeriod(),
    locale: "en",
    labels: EXPORT_LABELS,
    periodPresetLabel: "1 week",
    formatWeekOf: (range) => `week of ${range}`,
    shortAll: "all",
    shortCustom: "range",
    exportedAt: new Date("2026-06-03T12:00:00"),
  });
  vi.useRealTimers();
  if (!payload) throw new Error("expected payload");
  return payload;
}

describe("buildPortfolioProgressExportPayload", () => {
  it("includes period, scope summaries, and level detail for Marina Bay", () => {
    const payload = marinaPayload();
    expect(payload.projectName).toBe("Marina Bay Condos");
    expect(payload.period.presetLabel).toBe("1 week");
    expect(payload.period.rangeDisplay).toBe("5/27–6/3");
    expect(payload.scopeSummaries.length).toBe(3);
    expect(payload.levelReport.levels.length).toBeGreaterThan(0);
    expect(payload.levelReport.buildings).toContain("Building A");
    expect(payload.overallVerifiedPct).toBeGreaterThan(0);
    expect(payload.labels.colBuilding).toBe("Building");
  });

  it("returns null when custom compare range is invalid", () => {
    const project = PORTFOLIO_PROGRESS_WIREFRAME_PROJECTS[0];
    const payload = buildPortfolioProgressExportPayload({
      baseProject: project,
      comparePeriod: {
        preset: "custom",
        customFrom: "2026-06-10",
        customTo: "2026-06-01",
      },
      locale: "en",
      labels: EXPORT_LABELS,
      periodPresetLabel: "Custom",
      formatWeekOf: (range) => `week of ${range}`,
      shortAll: "all",
      shortCustom: "range",
    });
    expect(payload).toBeNull();
  });
});

describe("POST /api/reports/global-progress/export-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildPdf.mockResolvedValue(Buffer.from("%PDF-test"));
    mockEnforceVisibility.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetEffectiveSession.mockResolvedValue(null);
    const res = await POST(
      new NextRequest("http://localhost/api/reports/global-progress/export-pdf", {
        method: "POST",
        body: JSON.stringify(marinaPayload()),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks dashboard access", async () => {
    mockGetEffectiveSession.mockResolvedValue({
      user: { ...SESSION.user, role: "CONTROLS_MANAGER" },
    } as never);
    const res = await POST(
      new NextRequest("http://localhost/api/reports/global-progress/export-pdf", {
        method: "POST",
        body: JSON.stringify(marinaPayload()),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns PDF for a valid export payload", async () => {
    mockGetEffectiveSession.mockResolvedValue(SESSION as never);
    const payload = marinaPayload();
    const res = await POST(
      new NextRequest("http://localhost/api/reports/global-progress/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(mockBuildPdf).toHaveBeenCalledWith(payload);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe("%PDF-test");
  });

  it("returns 400 for malformed payload", async () => {
    mockGetEffectiveSession.mockResolvedValue(SESSION as never);
    const res = await POST(
      new NextRequest("http://localhost/api/reports/global-progress/export-pdf", {
        method: "POST",
        body: JSON.stringify({ projectName: "Only name" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("passes export labels including building column to the PDF builder", async () => {
    mockGetEffectiveSession.mockResolvedValue(SESSION as never);
    const payload = marinaPayload();
    await POST(
      new NextRequest("http://localhost/api/reports/global-progress/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(mockBuildPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: expect.objectContaining({ colBuilding: "Building" }),
      }),
    );
  });
});

describe("buildPortfolioProgressExportHtml integration contract", () => {
  it("builds printable HTML with scope-first building sections and no redundant All rollup", () => {
    const payload = marinaPayload();
    const html = buildPortfolioProgressExportHtml(payload);
    expect(html).toContain('class="building-page-header">Building: Building A</div>');
    expect(html).toContain('class="scope-heading">Cabinets</div>');
    expect(html).not.toContain(">All<");
    expect(html).not.toContain('class="building-thead-banner"');
  });
});
