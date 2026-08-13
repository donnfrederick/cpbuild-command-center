import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MediaPageClient } from "@/components/projects/MediaPageClient";
import { deliverPdfBlob } from "@/lib/deliver-pdf-blob";
import type { MediaExportSnapshot } from "@/lib/media/media-export-types";

vi.mock("@/components/projects/MediaLocationsView", () => ({
  MediaLocationsView: ({
    onExportSnapshotChange,
  }: {
    onExportSnapshotChange?: (snapshot: MediaExportSnapshot) => void;
  }) => {
    React.useEffect(() => {
      onExportSnapshotChange?.({
        ready: true,
        locationCount: 2,
        request: {
          locations: [
            {
              unitRef: "North|1|101",
              label: "101",
              kind: "unit",
            },
          ],
          filters: { mediaSourceTypes: [], albumSourceTags: [] },
          filterSummary: "All media",
          sourceLabels: {
            observation: "Observation",
            observation_comment: "Obs. comment",
            issue: "Issue",
            issue_comment: "Issue comment",
            inspection: "Inspection",
            general: "General",
            status_update: "Status update",
          },
        },
      });
    }, [onExportSnapshotChange]);
    return <div data-testid="media-locations-view" />;
  },
}));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true }),
}));

vi.mock("@/lib/deliver-pdf-blob", () => ({
  deliverPdfBlob: vi.fn(async () => "downloaded"),
  deliverPdfBlobOnUserGesture: vi.fn(async () => "shared"),
  isMobilePdfDelivery: vi.fn(() => false),
  supportsPdfFileShare: vi.fn(() => false),
}));

const messages = {
  common: { cancel: "Cancel" },
  offline: { offlineActionUnavailable: "Offline" },
  units: {
    mediaView: {
      searchPlaceholder: "Search",
      searchAria: "Search",
      exportPdfAria: "Export PDF",
      exportPdfTooltip: "Export to PDF",
      exportPdfFailed: "PDF export failed.",
      exportPdfSuccess: "PDF exported.",
      exportPdfNoLocations: "No locations with media.",
      exportPdfTooManyLocations: "Too many",
      exportPdfTooManyLocationsTooltip: "Too many tooltip",
      exportPdfSaveFailed: "Save failed",
      exportPdfProgressTitle: "Exporting PDF",
      exportPdfProgressAria: "Export in progress",
      exportPdfProgressHint: "Please wait",
      exportPdfStepGathering: "Collecting media",
      exportPdfStepRendering: "Building PDF",
      exportPdfStepDone: "PDF ready",
      exportPdfSaveButton: "Save PDF",
      exportPdfCancelAria: "Cancel PDF export",
      exportPdfProgressLocations: "{completed} of {total} locations",
      exportPdfProgressItems: "{count, plural, one {# photo} other {# photos}}",
      exportPdfProgressItemsRunning: "{count, plural, one {# photo collected} other {# photos collected}}",
      exportPdfProgressCurrentLocation: "Loading {location}",
      exportPdfProgressRenderingImages: "Loading images ({completed} of {total})",
      exportPdfProgressRenderingPdf: "Generating PDF",
      exportPdfProgressPercent: "{percent}%",
      exportPdfProgressSummaryDone: "{locations, plural, one {# location} other {# locations}} · {items, plural, one {# photo} other {# photos}}",
      filtersTooltip: "Filters",
    },
  },
};

function ndjsonStreamResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("MediaPageClient PDF export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows progress overlay and delivers PDF on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ndjsonStreamResponse([
          {
            type: "progress",
            phase: "gathering",
            locationsCompleted: 1,
            locationsTotal: 2,
            itemsCollected: 3,
            itemsTotal: null,
            currentLocationLabel: "101",
            percent: 33,
          },
          {
            type: "progress",
            phase: "rendering",
            locationsCompleted: 2,
            locationsTotal: 2,
            itemsCollected: 3,
            itemsTotal: 3,
            currentLocationLabel: null,
            renderSubphase: "pdf",
            percent: 95,
          },
          {
            type: "complete",
            fileName: "media-test.pdf",
            pdfBase64: btoa("%PDF-1.4"),
          },
        ]),
      ),
    );

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MediaPageClient projectId="proj-1" />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    expect(screen.getByRole("status", { name: "Export in progress" })).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/proj-1/album/export-pdf",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Accept: "application/x-ndjson",
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(deliverPdfBlob).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText("PDF ready")).toBeInTheDocument();
    });
  });

  it("cancels in-progress export and closes overlay", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise((resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          const onAbort = () => {
            signal?.removeEventListener("abort", onAbort);
            reject(new DOMException("Aborted", "AbortError"));
          };
          signal?.addEventListener("abort", onAbort);
        }),
      ),
    );

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MediaPageClient projectId="proj-1" />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export PDF" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel PDF export" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel PDF export" }));

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "Export in progress" })).not.toBeInTheDocument();
    });

    expect(deliverPdfBlob).not.toHaveBeenCalled();
  });
});
