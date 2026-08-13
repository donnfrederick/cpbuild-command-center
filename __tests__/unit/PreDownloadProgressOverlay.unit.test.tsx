/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

const mockCancelDownload = vi.hoisted(() => vi.fn());
const mockCreatePortal = vi.hoisted(() =>
  vi.fn((node: ReactNode) => node),
);

vi.mock("react-dom", async (importActual) => {
  const actual = await importActual<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: mockCreatePortal,
  };
});

vi.mock("@/hooks/offline-sync-context", () => ({
  useOfflineSyncContext: () => ({
    downloadState: {
      projectId: "proj-1",
      projectName: "348 South Temple Apts",
      percent: 62,
      phase: "warmingPages",
      step: 3,
      stepTotal: 12,
    },
    cancelDownload: mockCancelDownload,
  }),
}));

import { PreDownloadProgressOverlay } from "@/components/projects/PreDownloadProgressOverlay";

const messages = {
  preDownloadOverlay: {
    title: "Pre-downloading project",
    cancel: "Cancel download",
    cancelAriaLabel: "Cancel pre-download",
    progressAriaLabel: "Pre-download {pct}% complete",
    percentComplete: "{pct}% complete",
    stepDetail: "Step {current} of {total}",
    phase: {
      preparing: "Getting ready…",
      fetchingSnapshot: "Downloading project data from the server…",
      savingSnapshot: "Saving data to this device…",
      warmingApis: "Caching field data for offline use…",
      warmingPages: "Preparing offline pages…",
      warmingMedia: "Downloading photos and attachments…",
      finishing: "Finishing up…",
      waiting: "Waiting for a background sync to finish…",
    },
  },
};

describe("PreDownloadProgressOverlay", () => {
  beforeEach(() => {
    mockCancelDownload.mockReset();
    mockCreatePortal.mockClear();
  });

  it("shows phase message, project name, and cancel action", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreDownloadProgressOverlay />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Pre-downloading project")).toBeInTheDocument();
    expect(screen.getByText("348 South Temple Apts")).toBeInTheDocument();
    expect(screen.getByText("Preparing offline pages…")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 12")).toBeInTheDocument();
    expect(screen.getByText("62% complete")).toBeInTheDocument();
    expect(document.querySelector("[data-pre-download-overlay]")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel download" }));
    expect(mockCancelDownload).toHaveBeenCalledTimes(1);
  });

  it("portals overlay to document.body when download is active", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PreDownloadProgressOverlay />
      </NextIntlClientProvider>,
    );

    expect(mockCreatePortal).toHaveBeenCalledTimes(1);
    expect(mockCreatePortal.mock.calls[0]?.[1]).toBe(document.body);
  });
});
