import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { LocationBuilderUploadPreviewModal } from "@/components/projects/LocationBuilderUploadPreviewModal";

const messages = {
  projects: {
    appendUploadPreviewTitle: "Review rows to append",
    appendUploadPreviewBody: "These rows will be added to the bottom.",
    appendUploadSafetyNote: "This upload only appends new rows.",
    loadedFile: "Loaded: {name} ({count} rows)",
    appendPreviewTabNew: "New rows ({count})",
    appendPreviewTabNewPlural: "New rows ({count})",
    appendPreviewTabExisting: "Existing rows ({count})",
    appendPreviewTabExistingPlural: "Existing rows ({count})",
    appendPreviewTabExistingLoading: "Existing rows…",
    appendPreviewNewRows: "New rows to append — {count} row (editable)",
    appendPreviewNewRowsPlural: "New rows to append — {count} rows (editable)",
    appendPreviewExistingRows: "Existing rows — {count} row (read-only)",
    appendPreviewExistingRowsPlural: "Existing rows — {count} rows (read-only)",
    appendPreviewLoadingExisting: "Loading existing rows…",
    confirmAppendRows: "Confirm & append rows ({count})",
    confirmAppendRowsShort: "Confirm & append rows",
    formatIssues: "Format issues:",
    fixInPreview: "Fix in preview.",
    andMoreRows: "… and {count} more",
    upmPreviewRowNumberHeader: "Row",
    noUnitRows: "No unit rows.",
    adding: "Adding…",
    appendProgressTitle: "Adding rows to Location Builder",
    appendProgressUploadingOne: "Uploading 1 row…",
    appendProgressUploading: "Uploading row {completed} of {total}…",
    appendProgressRefreshing: "Refreshing your Location Builder…",
    appendProgressPercent: "{percent}% complete",
    appendProgressKeepOpen: "Please keep this window open until the upload finishes.",
    appendProgressCancelHint: "Cancel removes any rows already uploaded in this session.",
    appendProgressCancelling: "Cancelling upload and removing rows already added…",
    parseSpreadsheetTitle: "Reading spreadsheet…",
    parseSpreadsheetBody: "Preparing a preview of the rows to append.",
    parseSpreadsheetBodyNamed: "Preparing a preview of {name}.",
  },
  common: {
    cancel: "Cancel",
    close: "Close",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("LocationBuilderUploadPreviewModal", () => {
  const baseProps = {
    fileName: "test.xlsx",
    newHeaders: ["Building", "Unit"],
    newRows: [{ Building: "A", Unit: "101" }],
    validationErrors: [] as const,
    existingHeaders: ["Building", "Unit"] as const,
    existingRows: [{ Building: "B", Unit: "202" }],
    isSubmitting: false,
    onCellEdit: vi.fn(),
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };

  it("shows new rows preview by default and confirm is enabled when valid", () => {
    render(<LocationBuilderUploadPreviewModal {...baseProps} />, { wrapper: Wrapper });

    expect(screen.getByTestId("location-builder-upload-preview")).toBeDefined();
    expect(screen.getByRole("button", { name: "Confirm & append rows (1)" })).toBeEnabled();
    expect(screen.getByText("Loaded: test.xlsx (1 rows)")).toBeDefined();
  });

  it("switches to read-only existing rows tab", async () => {
    const user = userEvent.setup();
    render(<LocationBuilderUploadPreviewModal {...baseProps} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("tab", { name: "Existing rows (1)" }));

    expect(screen.getByText("Existing rows — 1 row (read-only)")).toBeDefined();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByText("B")).toBeDefined();
  });

  it("disables confirm when validation errors exist", () => {
    render(
      <LocationBuilderUploadPreviewModal
        {...baseProps}
        validationErrors={[{ row: 1, col: "Unit", message: "bad" }]}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("button", { name: "Confirm & append rows (1)" })).toBeDisabled();
    expect(screen.getByText("Format issues:")).toBeDefined();
  });

  it("calls onConfirm when confirm is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<LocationBuilderUploadPreviewModal {...baseProps} onConfirm={onConfirm} />, {
      wrapper: Wrapper,
    });

    await user.click(screen.getByRole("button", { name: "Confirm & append rows (1)" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows loading label on existing tab while rows fetch (not zero)", () => {
    render(
      <LocationBuilderUploadPreviewModal {...baseProps} existingRowsLoading existingRows={[]} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("tab", { name: "Existing rows…" })).toBeDefined();
    expect(screen.queryByRole("tab", { name: "Existing rows (0)" })).toBeNull();
  });

  it("shows loading state on existing tab content when selected", async () => {
    const user = userEvent.setup();
    render(
      <LocationBuilderUploadPreviewModal {...baseProps} existingRowsLoading existingRows={[]} />,
      { wrapper: Wrapper },
    );

    await user.click(screen.getByRole("tab", { name: "Existing rows…" }));
    expect(screen.getByText("Loading existing rows…")).toBeDefined();
  });

  it("shows progress overlay when append is in progress", () => {
    render(
      <LocationBuilderUploadPreviewModal
        {...baseProps}
        isSubmitting
        appendProgress={{ phase: "uploading", completed: 50, total: 721 }}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("location-builder-append-progress")).toBeDefined();
    expect(screen.getByText("Adding rows to Location Builder")).toBeDefined();
    expect(screen.getByText("Uploading row 50 of 721…")).toBeDefined();
    expect(screen.getByText("7% complete")).toBeDefined();
    expect(screen.getByText("Please keep this window open until the upload finishes.")).toBeDefined();
  });

  it("shows refreshing message in progress overlay", () => {
    render(
      <LocationBuilderUploadPreviewModal
        {...baseProps}
        isSubmitting
        appendProgress={{ phase: "refreshing", completed: 721, total: 721 }}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("Refreshing your Location Builder…")).toBeDefined();
    expect(screen.queryByText(/% complete/)).toBeNull();
  });

  it("shows cancel control during uploading phase", async () => {
    const onCancelAppend = vi.fn();
    render(
      <LocationBuilderUploadPreviewModal
        {...baseProps}
        isSubmitting
        appendProgress={{ phase: "uploading", completed: 50, total: 721 }}
        onCancelAppend={onCancelAppend}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.click(screen.getByTestId("location-builder-append-cancel"));
    expect(onCancelAppend).toHaveBeenCalledTimes(1);
  });

  it("portals dialog to document.body so overflow-hidden layouts cannot hide it", () => {
    const { container } = render(
      <div style={{ overflow: "hidden", height: 120 }}>
        <LocationBuilderUploadPreviewModal {...baseProps} />
      </div>,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole("dialog", { name: "Review rows to append" })).toBeDefined();
    expect(screen.getByText("Review rows to append")).toBeDefined();
    expect(container.querySelector('[data-testid="location-builder-upload-preview"]')).toBeNull();
    expect(document.body.contains(screen.getByTestId("location-builder-upload-preview"))).toBe(true);
  });
});
