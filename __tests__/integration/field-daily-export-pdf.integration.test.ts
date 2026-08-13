import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));
vi.mock("@/lib/field-daily-report/project-hub-service", () => ({
  fetchProjectFieldDailySliceByDate: vi.fn(),
}));
vi.mock("@/lib/field-daily-report/hydrate-export-media", () => ({
  buildFieldDailyReportExportMediaContext: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    project: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/field-daily-report/project-scope", () => ({
  userCanAccessProjectFieldDaily: vi.fn(),
}));
vi.mock("@/lib/pdf/field-daily-report-pdf", () => ({
  buildFieldDailyReportExportPdf: vi.fn(),
}));

import { POST } from "@/app/api/reports/field-daily/export-pdf/route";
import { getEffectiveSession } from "@/lib/masquerade";
import { fetchProjectFieldDailySliceByDate } from "@/lib/field-daily-report/project-hub-service";
import { buildFieldDailyReportExportMediaContext } from "@/lib/field-daily-report/hydrate-export-media";
import { userCanAccessProjectFieldDaily } from "@/lib/field-daily-report/project-scope";
import { buildFieldDailyReportExportPdf } from "@/lib/pdf/field-daily-report-pdf";
import { db } from "@/lib/db";
import type { FieldDailyReportPdfLabels } from "@/lib/field-daily-report/pdf-export";
import { emptyProjectSnapshot } from "@/lib/field-daily-report/snapshot-activity";

const mockGetEffectiveSession = vi.mocked(getEffectiveSession);
const mockFetchSlice = vi.mocked(fetchProjectFieldDailySliceByDate);
const mockBuildMedia = vi.mocked(buildFieldDailyReportExportMediaContext);
const mockCanAccess = vi.mocked(userCanAccessProjectFieldDaily);
const mockBuildPdf = vi.mocked(buildFieldDailyReportExportPdf);
const mockFindProject = vi.mocked(db.project.findFirst);

const SESSION = {
  user: {
    id: "user-1",
    email: "im@example.com",
    role: "INSTALL_MANAGER",
    name: "IM User",
    specialPermissions: [],
  },
};

const EXPORT_LABELS: FieldDailyReportPdfLabels = {
  documentTitle: "Field Daily Report",
  reportDateHeading: "Report date",
  exportedAtHeading: "Exported",
  filterHeading: "Filters",
  projectsHeading: "projects",
  sectionProgress: "Progress",
  sectionStatus: "Status updates",
  sectionTeamsOnSite: "Teams on site",
  sectionSubcontractors: "Subcontractors",
  sectionInspections: "Inspections",
  sectionIssues: "Issues",
  sectionObservations: "Observations",
  sectionWorkforce: "Workforce",
  sectionOther: "Other",
  notesLabel: "Your notes",
  workforceDailyManpowerLabel: "Daily manpower",
  missingDailyManpowerAlert: "Missing data: daily manpower info",
  workforceManpowerSummary: "{count} people on site",
  workforceDailyManpowerHeader: "Daily manpower: {count}",
  progressDeltaOnly: "+{delta}%",
  progressCurrentPct: "{pct}% complete",
  progressUnavailable: "Unavailable",
  noFieldActivity: "No activity for this day.",
  generatedAt: "Generated",
  confidentialFooter: "CP Build — Internal use only",
  locationProjectLevel: "Project level",
  previewLabels: {
    statusChanges: "1 status change",
    inspections: "0 inspections",
    issuesReported: "0 issues reported",
    otherActivity: "0 other activity items",
  },
};

const sampleSlice = {
  projectId: "p1",
  projectName: "Temple Square",
  snapshot: {
    ...emptyProjectSnapshot(),
    progress: {
      ...emptyProjectSnapshot().progress,
      pctComplete: 12,
      pctCompleteDelta: 2,
    },
    statusUpdates: {
      summaryGroups: [
        {
          id: "g1",
          statusLabel: "Install: In Progress",
          unitEntries: [{ locationLabel: "Unit 2A", activityLogIds: ["a1"] }],
          sourceActivityLogIds: ["a1"],
        },
      ],
      sourceEvents: [],
    },
  },
  sectionNotes: [],
  comments: [],
};

function exportBody(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "p1",
    reportDate: "2026-07-16",
    locale: "en",
    filterSummary: "",
    activitySummary: "1 status change · 0 inspections",
    labels: EXPORT_LABELS,
    ...overrides,
  };
}

describe("POST /api/reports/field-daily/export-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildPdf.mockResolvedValue(Buffer.from("%PDF-test"));
    mockFindProject.mockResolvedValue({ id: "p1", installManagerId: "user-1" } as never);
    mockCanAccess.mockResolvedValue(true);
    mockFetchSlice.mockResolvedValue(sampleSlice);
    mockBuildMedia.mockResolvedValue({
      statusPhotoRows: [],
      inspectionImagesBySubmissionId: new Map(),
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetEffectiveSession.mockResolvedValue(null);
    const res = await POST(
      new NextRequest("http://localhost/api/reports/field-daily/export-pdf", {
        method: "POST",
        body: JSON.stringify(exportBody()),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks field daily report access", async () => {
    mockGetEffectiveSession.mockResolvedValue({
      user: { ...SESSION.user, role: "MEMBER" },
    } as never);
    const res = await POST(
      new NextRequest("http://localhost/api/reports/field-daily/export-pdf", {
        method: "POST",
        body: JSON.stringify(exportBody()),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns PDF after hydrating media and prefetching images", async () => {
    mockGetEffectiveSession.mockResolvedValue(SESSION as never);
    const res = await POST(
      new NextRequest("http://localhost/api/reports/field-daily/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: "session=abc" },
        body: JSON.stringify(exportBody()),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(mockBuildMedia).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", reportDate: "2026-07-16" }),
    );
    expect(mockBuildPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        projects: [
          expect.objectContaining({
            projectName: "Temple Square",
            activitySummary: "1 status change · 0 inspections",
          }),
        ],
      }),
      expect.objectContaining({
        pdfImageFetch: expect.objectContaining({ cookieHeader: "session=abc" }),
      }),
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe("%PDF-test");
  });

  it("returns 404 when report slice is missing", async () => {
    mockGetEffectiveSession.mockResolvedValue(SESSION as never);
    mockFetchSlice.mockResolvedValue(null);
    const res = await POST(
      new NextRequest("http://localhost/api/reports/field-daily/export-pdf", {
        method: "POST",
        body: JSON.stringify(exportBody()),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for malformed payload", async () => {
    mockGetEffectiveSession.mockResolvedValue(SESSION as never);
    const res = await POST(
      new NextRequest("http://localhost/api/reports/field-daily/export-pdf", {
        method: "POST",
        body: JSON.stringify({ reportDate: "2026-07-16" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
