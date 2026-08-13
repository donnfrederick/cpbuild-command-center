import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FieldDailyReportPdfExportOverlay } from "@/components/reports/FieldDailyReportPdfExportOverlay";

vi.mock("@/lib/deliver-pdf-blob", () => ({
  supportsPdfFileShare: () => true,
}));

const messages = {
  fieldDailyReport: {
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
  },
};

describe("FieldDailyReportPdfExportOverlay", () => {
  it("shows preparing progress with a step checklist while rendering", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportPdfExportOverlay
          step="rendering"
          projectName="Temple Square"
          reportDate="2026-07-16"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Exporting PDF")).toBeInTheDocument();
    expect(screen.getByText("Building PDF…")).toBeInTheDocument();
    expect(screen.getByText("Temple Square · 2026-07-16")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("Preparing report")).toBeInTheDocument();
    expect(screen.getByText("This may take up to a minute.")).toBeInTheDocument();
  });

  it("shows the mobile save action when the PDF is ready", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportPdfExportOverlay
          step="done"
          projectName="Temple Square"
          reportDate="2026-07-16"
          showSaveButton
          onSavePdf={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("PDF ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share or Save PDF" })).toBeInTheDocument();
  });
});
