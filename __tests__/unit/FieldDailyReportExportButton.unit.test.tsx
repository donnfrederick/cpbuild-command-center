import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { FieldDailyReportExportButton } from "@/components/reports/FieldDailyReportExportButton";
import { emptyProjectSnapshot } from "@/lib/field-daily-report/snapshot-activity";
import type { FieldDailyReportProjectDto } from "@/lib/field-daily-report/types";

vi.mock("@/hooks/use-is-browser", () => ({
  useIsBrowser: () => true,
}));

const deliverPdfBlob = vi.fn();
const deliverPdfBlobOnUserGesture = vi.fn();
const isMobilePdfDelivery = vi.fn();

vi.mock("@/lib/deliver-pdf-blob", () => ({
  deliverPdfBlob: (...args: unknown[]) => deliverPdfBlob(...args),
  deliverPdfBlobOnUserGesture: (...args: unknown[]) => deliverPdfBlobOnUserGesture(...args),
  isMobilePdfDelivery: () => isMobilePdfDelivery(),
  supportsPdfFileShare: () => false,
}));

const messages = {
  fieldDailyReport: {
    exportPdf: "Export PDF",
    exportPdfAria: "Export PDF for {projectName}",
    exportPdfFailed: "PDF export failed.",
    exportPdfOpenFailed: "Could not open the PDF. Please try again.",
    exportPdfProgressTitle: "Exporting PDF",
    exportPdfStepPreparing: "Preparing report",
    exportPdfStepRendering: "Building PDF",
    exportPdfDone: "PDF ready",
    exportPdfProgressAria: "Field daily report PDF export in progress",
    exportPdfSaveButton: "Save PDF",
    exportPdfShareButton: "Share or Save PDF",
    exportPdfMobileHint: "Tap below to share or save to Files.",
    exportPdfProgressHint: "This may take up to a minute.",
    exportPdfProgressPercent: "{percent}%",
    exportPdfProgressProject: "{projectName} · {reportDate}",
    exportDocumentTitle: "Field Daily Report",
    exportReportDateHeading: "Report date",
    exportExportedAtHeading: "Exported",
    exportFilterHeading: "Filters",
    exportProjectsHeading: "projects",
    exportGeneratedPrefix: "Generated",
    exportConfidentialFooter: "CP Build — Internal use only",
    locationProjectLevel: "Project level",
    sectionProgress: "Progress",
    sectionStatus: "Status updates",
    sectionTeamsOnSite: "Teams on site",
    sectionSubcontractors: "Subcontractors",
    sectionInspections: "Inspections",
    sectionIssues: "Issues",
    sectionObservations: "Observations",
    sectionWorkforce: "Workforce",
    sectionOther: "Other",
    sectionCommentLabel: "Your notes",
    workforceDailyManpowerLabel: "Daily manpower",
    missingDailyManpowerAlert: "Missing data: daily manpower info",
    workforceManpowerSummary: "{count, plural, one {# person on site} other {# people on site}}",
    workforceManpowerSummaryPdf: "{count} people on site",
    workforceDailyManpowerHeader: "Daily manpower: {count}",
    progressDeltaOnly: "+{delta}%",
    progressCurrentPct: "{pct}% complete",
    progressUnavailable: "Unavailable",
    hubHistoryNoActivity: "No activity for this day.",
    hubPreviewStatusChanges: "{count, plural, one {# status change} other {# status changes}}",
    hubPreviewInspections: "{count, plural, one {# inspection} other {# inspections}}",
    hubPreviewIssuesReported: "{count, plural, one {# issue reported} other {# issues reported}}",
    hubPreviewOtherActivity: "{count, plural, one {# other activity item} other {# other activity items}}",
    statusUnitsMoved: "{count, plural, one {# unit} other {# units}}",
  },
};

const project: FieldDailyReportProjectDto = {
  projectId: "p1",
  projectName: "Temple Square",
  snapshot: {
    ...emptyProjectSnapshot(),
    progress: {
      ...emptyProjectSnapshot().progress,
      inspectionSubmittedCount: 1,
    },
    inspections: {
      summaryGroups: [
        {
          id: "insp-1",
          outcome: "PASS",
          items: [
            {
              itemKey: "i1",
              activityLogId: "a1",
              createdAt: "",
              headline: "Clear",
              locationLabel: "U1",
            },
          ],
        },
      ],
    },
  },
  sectionNotes: [],
  comments: [],
};

function mockFetchSuccess() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(new Blob(["%PDF-test"], { type: "application/pdf" })),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("FieldDailyReportExportButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobilePdfDelivery.mockReturnValue(false);
    deliverPdfBlob.mockResolvedValue("downloaded");
    deliverPdfBlobOnUserGesture.mockResolvedValue("shared");
    mockFetchSuccess();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sends localized progress label templates in the PDF payload", async () => {
    const fetchMock = mockFetchSuccess();
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportExportButton project={project} reportDate="2026-07-16" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Export PDF for Temple Square" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      projectId: string;
      reportDate: string;
      activitySummary: string;
      labels: {
        progressDeltaOnly: string;
        progressCurrentPct: string;
        workforceManpowerSummary: string;
        workforceDailyManpowerHeader: string;
      };
    };

    expect(body.projectId).toBe("p1");
    expect(body.reportDate).toBe("2026-07-16");
    expect(body.activitySummary).toContain("inspection");
    expect(body.labels.progressDeltaOnly).toBe("+{delta}%");
    expect(body.labels.progressCurrentPct).toBe("{pct}% complete");
    expect(body.labels.workforceManpowerSummary).toBe("{count} people on site");
    expect(body.labels.workforceDailyManpowerHeader).toBe("Daily manpower: {count}");
    expect(body.labels.progressDeltaOnly).not.toContain("fieldDailyReport");
    expect(body.labels.progressCurrentPct).not.toContain("fieldDailyReport");
  });

  it("delivers the PDF with deliverPdfBlob on desktop after export", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportExportButton project={project} reportDate="2026-07-16" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Export PDF for Temple Square" }));

    await waitFor(() => {
      expect(screen.getByText("Exporting PDF")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(deliverPdfBlob).toHaveBeenCalledTimes(1);
    });

    expect(deliverPdfBlobOnUserGesture).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText("PDF ready")).toBeInTheDocument();
    });

    await vi.advanceTimersByTimeAsync(1200);

    await waitFor(() => {
      expect(screen.queryByText("PDF ready")).not.toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("shows a second save tap on mobile after the PDF is generated", async () => {
    isMobilePdfDelivery.mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportExportButton project={project} reportDate="2026-07-16" />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Export PDF for Temple Square" }));

    await waitFor(() => {
      expect(screen.getByText("PDF ready")).toBeInTheDocument();
    });

    expect(deliverPdfBlob).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save PDF" }));

    await waitFor(() => {
      expect(deliverPdfBlobOnUserGesture).toHaveBeenCalledTimes(1);
    });
  });
});
