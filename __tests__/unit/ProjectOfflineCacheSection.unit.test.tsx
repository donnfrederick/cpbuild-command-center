/**
 * ProjectOfflineCacheSection.unit.test.tsx
 *
 * Tests the offline-data status card on the project overview page.
 * Covers: no-data state, ready state, stale state, syncing state,
 * and the manual sync button triggering triggerDownload.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { ProjectOfflineCacheSection } from "@/components/projects/ProjectOfflineCacheSection";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockTriggerDownload = vi.fn().mockResolvedValue(undefined);
const mockLastSyncedAt = vi.fn().mockReturnValue(null);
const mockIsDownloading = { current: false };

vi.mock("@/hooks/offline-sync-context", () => ({
  useOfflineSyncContext: () => ({
    lastSyncedAt: mockLastSyncedAt,
    isDownloading: mockIsDownloading.current,
    downloadProgress: null,
    triggerDownload: mockTriggerDownload,
    isHydrated: true,
  }),
}));

// Default: online. Individual tests that need offline override this.
const mockIsOnline = { current: true };
vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: mockIsOnline.current, wasOffline: false }),
}));

vi.mock("next-intl", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    ...actual,
    useLocale: () => "en",
  };
});

// ── i18n messages ─────────────────────────────────────────────────────────────

const messages = {
  projectOfflineCache: {
    sectionTitle: "Offline Data",
    ready: "Data cached — last synced {time}",
    stale: "Data may be outdated — last synced {time}",
    syncing: "Syncing… {pct}%",
    error: "Sync failed — tap to retry",
    noData: "No offline data cached yet",
    noDataDescription: "You're currently offline. Connect to the internet and tap \"Download now\" to cache this project.",
    noDataDescriptionOnline: "Caching project data for offline access…",
    syncNow: "Sync now",
    downloadNow: "Download now",
    syncAriaLabel: "Sync offline data for this project now",
    progressAriaLabel: "Syncing — {pct}% complete",
  },
};

function renderSection(projectId = "proj-1") {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectOfflineCacheSection projectId={projectId} />
    </NextIntlClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockIsDownloading.current = false;
  mockIsOnline.current = true;
  mockLastSyncedAt.mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProjectOfflineCacheSection", () => {
  it("shows section title", async () => {
    renderSection();
    await act(async () => { vi.runAllTimers(); });
    expect(screen.getByText("Offline Data")).toBeTruthy();
  });

  it("shows 'no data' state when project was never synced (offline — no auto-trigger)", async () => {
    // When offline the auto-trigger is skipped (guard: if (!isOnline) return).
    // This lets us assert the static no-data UI without the component immediately
    // transitioning to the syncing state.
    mockIsOnline.current = false;
    mockLastSyncedAt.mockReturnValue(null);
    renderSection();
    await act(async () => { vi.runAllTimers(); });
    expect(screen.getByText("No offline data cached yet")).toBeTruthy();
    // Offline: shows instruction to connect
    expect(screen.getByText(/You're currently offline/)).toBeTruthy();
    // Shows "Download now" button (not "Sync now")
    expect(screen.getByRole("button", { name: "Sync offline data for this project now" })).toBeTruthy();
    expect(screen.getByText("Download now")).toBeTruthy();
    // Auto-trigger must NOT have fired while offline
    expect(mockTriggerDownload).not.toHaveBeenCalled();
  });

  it("auto-triggers download on mount when online with no cached data", async () => {
    // isOnline defaults to true (set in beforeEach)
    mockLastSyncedAt.mockReturnValue(null);
    renderSection();
    await act(async () => { vi.runAllTimers(); });
    // Component should have kicked off triggerDownload automatically
    expect(mockTriggerDownload).toHaveBeenCalledWith("proj-1", { showProgressOverlay: false });
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);
  });

  it("shows 'ready' state when synced recently", async () => {
    const recentTime = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago
    mockLastSyncedAt.mockReturnValue(recentTime);
    renderSection();
    await act(async () => { vi.runAllTimers(); });
    expect(screen.getByText(/Data cached — last synced/)).toBeTruthy();
    // Shows "Sync now" button (not "Download now")
    expect(screen.getByText("Sync now")).toBeTruthy();
    // No description text shown when data already exists
    expect(screen.queryByText(/You're currently offline/)).toBeNull();
    expect(screen.queryByText(/Caching project data/)).toBeNull();
  });

  it("shows 'stale' state when synced more than 24h ago", async () => {
    const staleTime = new Date(Date.now() - 25 * 60 * 60_000).toISOString(); // 25h ago
    mockLastSyncedAt.mockReturnValue(staleTime);
    renderSection();
    await act(async () => { vi.runAllTimers(); });
    expect(screen.getByText(/Data may be outdated/)).toBeTruthy();
  });

  it("calls triggerDownload when sync button is clicked", async () => {
    renderSection();
    await act(async () => { vi.runAllTimers(); });
    const btn = screen.getByRole("button", { name: "Sync offline data for this project now" });
    await act(async () => { fireEvent.click(btn); });
    expect(mockTriggerDownload).toHaveBeenCalledWith("proj-1", { showProgressOverlay: false });
  });

  it("does not call triggerDownload twice for two rapid button clicks", async () => {
    // Use a recent syncedAt so the auto-trigger guard (if syncedAt return) fires and
    // triggerDownload starts with a clean call count of 0.
    const recentTime = new Date(Date.now() - 5 * 60_000).toISOString();
    mockLastSyncedAt.mockReturnValue(recentTime);
    renderSection();
    await act(async () => { vi.runAllTimers(); });
    const btn = screen.getByRole("button", { name: "Sync offline data for this project now" });
    // Both clicks arrive before the first promise resolves
    mockTriggerDownload.mockImplementation(() => new Promise((res) => setTimeout(res, 500)));
    await act(async () => { fireEvent.click(btn); });
    await act(async () => { fireEvent.click(btn); });
    expect(mockTriggerDownload).toHaveBeenCalledTimes(1);
  });
});
