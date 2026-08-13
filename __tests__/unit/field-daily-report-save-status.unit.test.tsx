import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  FieldDailySectionSaveIndicator,
  FieldDailyReportSaveFooter,
  FieldDailyReportSaveProvider,
  useFieldDailyReportSaveReporter,
} from "@/components/reports/FieldDailyReportSaveStatus";

const messages = {
  common: {
    cancel: "Cancel",
  },
  fieldDailyReport: {
    saving: "Saving…",
    saved: "Saved",
    sectionCommentSaveError: "Couldn't save this note",
    saveNotesAndClose: "Save notes and close",
    savingNotesAndClose: "Saving…",
    close: "Close",
  },
};

function DirtyReporter() {
  const reportStatus = useFieldDailyReportSaveReporter();
  return (
    <button type="button" onClick={() => reportStatus?.("progress", "dirty")}>
      Mark dirty
    </button>
  );
}

describe("FieldDailySectionSaveIndicator", () => {
  it("shows saving state with spinner label", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailySectionSaveIndicator status="saving" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
  });

  it("shows saved confirmation", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailySectionSaveIndicator status="saved" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("shows error state", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailySectionSaveIndicator status="error" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't save this note");
  });

  it("renders nothing when idle", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailySectionSaveIndicator status="idle" />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("FieldDailyReportSaveFooter", () => {
  it("renders only Close when notes are clean", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportSaveProvider>
          <FieldDailyReportSaveFooter onClose={() => undefined} onSaveAndClose={() => undefined} />
        </FieldDailyReportSaveProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save notes and close" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("renders save and cancel when notes are dirty", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportSaveProvider>
          <DirtyReporter />
          <FieldDailyReportSaveFooter onClose={() => undefined} onSaveAndClose={() => undefined} />
        </FieldDailyReportSaveProvider>
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark dirty" }));

    expect(screen.getByRole("button", { name: "Save notes and close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("calls onSaveAndClose after a successful save", async () => {
    const onSaveAndClose = vi.fn();
    const saveAllNotes = vi.fn().mockResolvedValue(true);

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FieldDailyReportSaveProvider>
          <DirtyReporter />
          <FieldDailyReportSaveFooter onClose={() => undefined} onSaveAndClose={onSaveAndClose} />
        </FieldDailyReportSaveProvider>
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Save notes and close" }));

    await vi.waitFor(() => {
      expect(onSaveAndClose).toHaveBeenCalledTimes(1);
    });
  });
});
