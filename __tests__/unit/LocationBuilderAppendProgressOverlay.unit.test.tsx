import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LocationBuilderAppendProgressOverlay } from "@/components/projects/LocationBuilderAppendProgressOverlay";

const messages = {
  projects: {
    appendProgressTitle: "Adding rows to Location Builder",
    appendProgressUploadingOne: "Uploading 1 row…",
    appendProgressUploading: "Uploading row {completed} of {total}…",
    appendProgressRefreshing: "Refreshing your Location Builder…",
    appendProgressPercent: "{percent}% complete",
    appendProgressKeepOpen: "Please keep this window open until the upload finishes.",
    appendProgressCancelHint: "Cancel removes any rows already uploaded in this session.",
    appendProgressCancelling: "Cancelling upload and removing rows already added…",
    createProgressTitle: "Creating project",
    createProgressCreating: "Setting up project from Unifier…",
    createProgressUploadingOne: "Uploading 1 location row…",
    createProgressUploading: "Uploading location row {completed} of {total}…",
    createProgressRefreshing: "Finishing project setup…",
    createProgressCancelling: "Cancelling and removing changes…",
    createProgressCancelHint: "Cancel removes the project and any location rows already uploaded.",
    createProgressKeepOpen: "Please keep this window open until project creation finishes.",
  },
  common: {
    cancel: "Cancel",
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("LocationBuilderAppendProgressOverlay", () => {
  it("renders append variant with cancel during upload", () => {
    const onCancel = vi.fn();
    render(
      <LocationBuilderAppendProgressOverlay
        progress={{ phase: "uploading", completed: 50, total: 100 }}
        variant="append"
        onCancel={onCancel}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("location-builder-append-progress")).toBeDefined();
    expect(screen.getByText("Adding rows to Location Builder")).toBeDefined();
    expect(screen.getByText("Uploading row 50 of 100…")).toBeDefined();
    expect(screen.getByText("50% complete")).toBeDefined();
    fireEvent.click(screen.getByTestId("location-builder-append-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("renders create variant with creating phase message", () => {
    render(
      <LocationBuilderAppendProgressOverlay
        progress={{ phase: "creating", completed: 0, total: 721 }}
        variant="create"
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId("create-project-upload-progress")).toBeDefined();
    expect(screen.getByText("Creating project")).toBeDefined();
    expect(screen.getByText("Setting up project from Unifier…")).toBeDefined();
    expect(screen.queryByTestId("create-project-upload-cancel")).toBeNull();
  });

  it("shows create cancel button only during uploading phase", () => {
    const onCancel = vi.fn();
    render(
      <LocationBuilderAppendProgressOverlay
        progress={{ phase: "uploading", completed: 1, total: 3 }}
        variant="create"
        onCancel={onCancel}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText("Uploading location row 1 of 3…")).toBeDefined();
    fireEvent.click(screen.getByTestId("create-project-upload-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
