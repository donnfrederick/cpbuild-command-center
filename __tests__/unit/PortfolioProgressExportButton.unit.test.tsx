import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { PortfolioProgressExportButton } from "@/components/reports/PortfolioProgressExportButton";
import type { PortfolioProjectSnapshot } from "@/lib/reports/portfolio-progress-types";
import type { ComparePeriodState } from "@/lib/reports/portfolio-progress-period";

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
  globalReports: {
    portfolioProgress: {
      exportPdf: "Export building and level detail PDF",
      exportFailed: "Export failed.",
      exportInvalidPeriod: "Choose a valid compare period before exporting.",
      exportPdfOpenFailed: "Could not open the PDF. Please try again.",
      exportPdfProgressTitle: "Exporting PDF",
      exportPdfStepPreparing: "Preparing report",
      exportPdfStepRendering: "Building PDF",
      exportPdfDone: "PDF ready",
      exportPdfProgressAria: "Global progress report PDF export in progress",
      exportPdfSaveButton: "Save PDF",
      exportPdfShareButton: "Share or Save PDF",
      exportPdfMobileHint: "Tap below to share or save to Files.",
      exportPdfProgressHint: "This may take up to a minute.",
      exportPdfProgressPercent: "{percent}%",
      exportPdfProgressProject: "{projectName} · {period}",
      exportDocumentTitle: "Progress Detail Report",
      periodCardLabel: "Period",
      deltaVsPeriod: "Change vs prior {period}",
      exportScopeSummaryHeading: "Scope summary",
      colScope: "Scope",
      verifiedShort: "Verified",
      exportVerifiedChange: "Verified change",
      unverifiedShort: "Unverified",
      exportUnverifiedChange: "Unverified change",
      overallVerifiedLabel: "Overall verified",
      exportLevelDetailHeading: "Building and level detail",
      exportColBuilding: "Building",
      exportColLevel: "Level",
      exportColOverall: "Overall",
      exportColAllLevels: "All",
      exportColBuildingTotal: "Total",
      exportColPct: "%",
      exportColChange: "Change",
      exportColStart: "Start",
      exportColLastUpdated: "Updated",
      exportColEnd: "End",
      exportUnitDetailHeading: "Location detail",
      exportColUnit: "Unit",
      exportColSubcontractor: "Subcontractor",
      noChange: "—",
      exportConfidentialFooter: "Confidential",
    },
  },
};

const baseProject: PortfolioProjectSnapshot = {
  id: "p1",
  name: "Temple Square",
  projectManagerName: "PM",
  installManagerName: null,
  hasChangesInPeriod: false,
  scopeSummaries: [
    {
      scopeName: "Cabinetry",
      verifiedPct: 50,
      verifiedDelta: 0,
      subPct: 0,
      subDelta: null,
    },
  ],
  buildings: [
    {
      buildingName: "Building A",
      levels: [
        {
          levelLabel: "Level 1",
          cells: [
            {
              scopeName: "Cabinetry",
              verifiedPct: 50,
              verifiedDelta: 0,
              subPct: 0,
              subDelta: null,
            },
          ],
        },
      ],
    },
  ],
};

const comparePeriod: ComparePeriodState = {
  preset: "1w",
  customFrom: "",
  customTo: "",
};

function mockFetchSuccess() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(new Blob(["%PDF-test"], { type: "application/pdf" })),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PortfolioProgressExportButton", () => {
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

  it("shows the progress overlay while exporting on desktop", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PortfolioProgressExportButton
          baseProject={baseProject}
          comparePeriod={comparePeriod}
          locale="en"
          periodPresetLabel="1 week"
          formatWeekOf={(range) => range}
          shortAll="all"
          shortCustom="range"
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Export building and level detail PDF" }));

    await waitFor(() => {
      expect(screen.getByText("Exporting PDF")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(deliverPdfBlob).toHaveBeenCalledTimes(1);
    });

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
        <PortfolioProgressExportButton
          baseProject={baseProject}
          comparePeriod={comparePeriod}
          locale="en"
          periodPresetLabel="1 week"
          formatWeekOf={(range) => range}
          shortAll="all"
          shortCustom="range"
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Export building and level detail PDF" }));

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
