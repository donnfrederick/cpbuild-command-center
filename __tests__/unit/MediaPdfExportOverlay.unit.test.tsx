import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MediaPdfExportOverlay } from "@/components/projects/MediaPdfExportOverlay";
import type { MediaAlbumExportProgressSnapshot } from "@/lib/media/media-album-export-progress";

const messages = {
  common: { cancel: "Cancel" },
  units: {
    mediaView: {
      exportPdfProgressTitle: "Exporting PDF",
      exportPdfProgressAria: "Media PDF export in progress",
      exportPdfProgressHint: "Large exports can take a minute.",
      exportPdfStepGathering: "Collecting media",
      exportPdfStepRendering: "Building PDF",
      exportPdfStepDone: "PDF ready",
      exportPdfSaveButton: "Save PDF",
      exportPdfShareButton: "Share or Save PDF",
      exportPdfShareHint: "Tap below to share or save to Files.",
      exportPdfSaveHint: "Tap below to open the PDF.",
      exportPdfCancelAria: "Cancel PDF export",
      exportPdfProgressLocations: "{completed} of {total} locations",
      exportPdfProgressItems: "{count, plural, one {# photo} other {# photos}}",
      exportPdfProgressItemsRunning: "{count, plural, one {# photo collected} other {# photos collected}}",
      exportPdfProgressCurrentLocation: "Loading {location}",
      exportPdfProgressRenderingImages: "Loading images ({completed} of {total})",
      exportPdfProgressRenderingPdf: "Generating PDF",
      exportPdfProgressPercent: "{percent}%",
      exportPdfProgressSummaryDone: "{locations, plural, one {# location} other {# locations}} · {items, plural, one {# photo} other {# photos}}",
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

const baseProgress: MediaAlbumExportProgressSnapshot = {
  phase: "gathering",
  locationsCompleted: 1,
  locationsTotal: 5,
  itemsCollected: 4,
  itemsTotal: null,
  currentLocationLabel: "101",
  percent: 13,
};

describe("MediaPdfExportOverlay", () => {
  it("shows gathering progress with a progress bar", () => {
    render(
      <MediaPdfExportOverlay step="gathering" progress={baseProgress} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Media PDF export in progress",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "13");
    expect(screen.getByText("1 of 5 locations · 4 photos collected")).toBeInTheDocument();
    expect(screen.getByText("13%")).toBeInTheDocument();
  });

  it("shows save button when done on mobile handoff", () => {
    const onSave = vi.fn();
    render(
      <MediaPdfExportOverlay
        step="done"
        progress={{
          ...baseProgress,
          phase: "rendering",
          locationsCompleted: 5,
          itemsCollected: 12,
          itemsTotal: 12,
          percent: 100,
        }}
        showSaveButton
        onSavePdf={onSave}
        savePdfLabel="Save PDF"
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("button", { name: "Save PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel PDF export" })).not.toBeInTheDocument();
  });

  it("shows cancel while export is in progress", () => {
    const onCancel = vi.fn();
    render(
      <MediaPdfExportOverlay
        step="rendering"
        progress={{
          ...baseProgress,
          phase: "rendering",
          renderSubphase: "images",
          imagesLoaded: 2,
          imagesTotal: 8,
          percent: 72,
        }}
        onCancel={onCancel}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel PDF export" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
