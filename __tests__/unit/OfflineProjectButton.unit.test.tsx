/**
 * OfflineProjectButton.unit.test.tsx
 *
 * Covers compact mobile layout and hydration-safe first paint (placeholder only).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { OfflineProjectButtonClient } from "@/components/projects/OfflineProjectButtonClient";

const mockTriggerDownload = vi.fn().mockResolvedValue(undefined);
const mockLastSyncedAt = vi.fn().mockReturnValue(null);
const mockOfflineProjectIds = { current: new Set<string>() };

vi.mock("@/hooks/offline-sync-context", () => ({
  useOfflineSyncContext: () => ({
    offlineProjectIds: mockOfflineProjectIds.current,
    downloadProgress: 50,
    isDownloading: false,
    downloadingProjectId: null,
    triggerDownload: mockTriggerDownload,
    setProjectOffline: vi.fn(),
    lastSyncedAt: mockLastSyncedAt,
  }),
}));

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true, wasOffline: false }),
}));

vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    ...actual,
    useLocale: () => "en",
  };
});

const messages = {
  offlineProjectButton: {
    preDownload: "Pre-download",
    preDownloadAriaLabel: "Pre-download project for offline use",
    preDownloaded: "Pre-downloaded",
    readyAriaLabel: "Pre-downloaded — tap to refresh",
    readyAriaLabelWithTime: "Pre-downloaded {time} — tap to refresh",
    downloading: "Downloading {pct}%",
    downloadingAriaLabel: "Downloading — {pct}% complete",
    stale: "Stale — refresh",
    staleAriaLabel: "Offline data stale — tap to refresh",
    error: "Failed — retry",
    errorAriaLabel: "Download failed — tap to retry",
    disableAriaLabel: "Remove offline download",
  },
};

function renderClient(props: { compact?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OfflineProjectButtonClient projectId="proj-1" projectName="Test Project" {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-19T12:05:00.000Z"));
  mockOfflineProjectIds.current = new Set(["proj-1"]);
  mockLastSyncedAt.mockReturnValue("2026-06-19T12:04:00.000Z");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OfflineProjectButtonClient compact mode", () => {
  it("shows relative time only (not the Pre-downloaded label) when compact and ready", async () => {
    renderClient({ compact: true });
    await vi.runAllTimersAsync();

    const button = screen.getByRole("button", { name: /Pre-downloaded .* tap to refresh/i });
    expect(button).toBeInTheDocument();
    expect(button.textContent).not.toContain("Pre-downloaded");
    expect(button.textContent).toMatch(/minute/i);
  });

  it("shows full Pre-downloaded label when not compact", async () => {
    renderClient({ compact: false });
    await vi.runAllTimersAsync();

    expect(screen.getByText("Pre-downloaded")).toBeInTheDocument();
  });
});
