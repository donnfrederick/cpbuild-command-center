import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { OfflineIndicator } from "@/components/shared/OfflineIndicator";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { useConnectivityMode } from "@/hooks/use-connectivity-mode";
import { useOfflineSyncContext } from "@/hooks/offline-sync-context";
import { useOfflineCacheView } from "@/hooks/offline-cache-view-context";
import { initBackgroundSync } from "@/lib/offline/background-sync";
import { showInspectionSyncStatus } from "@/lib/inspections/inspection-sync-status";
import {
  notifyInspectionOverlayClosed,
  notifyInspectionOverlayOpened,
  resetInspectionOverlayChromeForTests,
} from "@/lib/inspections/inspection-overlay-chrome";

vi.mock("@/hooks/use-offline-status");
vi.mock("@/hooks/use-connectivity-mode");
vi.mock("@/hooks/offline-sync-context");
vi.mock("@/hooks/offline-cache-view-context");
vi.mock("@/i18n/navigation", () => ({
  usePathname: vi.fn(() => "/en/projects/test-project"),
}));
vi.mock("@/lib/offline/background-sync", () => ({
  initBackgroundSync: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("@/lib/offline/mutation-queue", () => ({
  getPendingCount: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/offline/queued-sync-error-display", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/offline/queued-sync-error-display")>();
  return {
    ...actual,
    firstQueuedSyncErrorDetail: vi.fn().mockResolvedValue(null),
  };
});

const messages = {
  offlineIndicator: {
    offlineWithCount: "You're offline — {count} changes saved",
    offlineNoChanges: "You're offline — cached data available",
    offlineWithCacheDate: "You're offline — showing data from {date}",
    offlineWithCountAndCache: "You're offline — showing data from {date}. {count} changes saved",
    slowConnectionBanner: "Slow connection — changes save locally",
    slowConnectionWithCacheBanner: "Slow connection — showing data from {date}. Changes save locally.",
    bannerSlowAndPending: "Slow connection — {count} changes waiting to upload",
    bannerSlowPendingCache: "Slow connection — {count} waiting · data from {date}",
    bannerPendingAndCache: "{count} changes waiting to upload · showing data from {date}",
    viewingCachedDataBanner: "Showing offline data from {date} — updates made here will sync when you reconnect.",
    queued: "{count} queued",
    syncing: "Syncing…",
    of: "of",
    allCaughtUp: "All synced",
    backOnline: "Back online",
    viewCached: "View what's cached",
    moreInfo: "More info",
    moreInfoAria: "View upload queue and cached data details",
    hideCached: "Hide",
    tapForDetails: "Tap for details",
    panelTitleQueue: "Upload queue",
    panelQueueSubtitle: "{count} changes waiting to upload",
    pendingUploadsBanner: "{count} changes waiting to upload",
    syncPendingUploadsNow: "Sync now",
    syncPendingUploadsAria: "Upload all pending offline changes now",
    syncingPendingUploads: "Uploading…",
    pendingInspectionsBanner: "{count} inspections waiting to upload",
    syncInspectionsNow: "Sync now",
    syncInspectionsAria: "Upload pending inspections now",
    syncingInspections: "Uploading…",
    bannerInspectionSyncFailed: "Could not sync inspection",
    bannerInspectionSaved: "{title}",
    syncAllSuccessTitle: "Upload complete",
    syncAllSuccessDescription: "All pending changes were uploaded.",
    syncStillPendingTitle: "{count} items still waiting",
    syncStillPendingDescription: "See the error on each item below.",
    syncFailedTitle: "Upload did not complete",
    syncFailedDescription: "Nothing uploaded.",
    syncBlockedOfflineTitle: "You're offline",
    syncBlockedOfflineDescription: "Connect to the internet.",
    syncSheetWorking: "Uploading…",
  },
  offlineCachePanel: {
    title: "What's cached",
    projects: "{count} projects",
    units: "{count} units",
    issues: "{count} issues",
    observations: "{count} observations",
    lastSynced: "Last synced {time}",
    noCacheYet: "No data cached — connect to the internet to download",
    queued: "{count} changes queued to upload",
    queuedItemsTitle: "Waiting to upload ({count})",
    queuedItemSyncHint: "Tap Sync now when you're online to upload.",
    queuedItemMediaLostHint: "Photos are no longer on this device.",
    queuedItemMutationBlobMissing: "Photo file missing on this device.",
    queuedItemRemove: "Remove from queue",
    queuedItemRemoveAria: "Remove from queue",
    queuedItemRemoveConfirm: "Remove this item from the queue?",
    projectCacheTitle: "This project",
    projectNoCacheYet: "No offline data for this project yet.",
    inspections: "{count} inspections",
    subcontractors: "{count} subcontractors",
    publishedForms: "{count} forms",
    queuedItemInspectionNoLocation: "Inspection · {formName} · {outcome}",
    queuedItemInspectionTitle: "{formName}",
    queuedItemInspectionDetail: "{level} · {category} · {outcome}",
    queuedItemInspectionDetailWithLocation: "{location} · {level} · {category} · {outcome}",
    queuedItemLevelProject: "Project-level",
    queuedItemLevelUnit: "Unit-level",
    queuedItemLevelScope: "Scope-level",
    queuedItemCategoryOther: "Other",
    queuedItemCategoryClearInspection: "Clear Inspection",
    queuedItemOutcomePass: "Pass",
    queuedItemOutcomeComplete: "Complete",
    queuedItemTime: "Saved {time}",
    queuedItemOpen: "Open to fix",
    queuedItemOpenAria: "Open inspection to fix and resubmit",
  },
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const defaultSync = {
  downloadProgress: null,
  downloadState: null,
  downloadingProjectId: null,
  isDownloading: false,
  pendingCount: 0,
  pendingInspectionCount: 0,
  isInspectionSyncing: false,
  flushPendingInspections: vi.fn().mockResolvedValue(0),
  syncProgress: null,
  syncDetail: null,
  isSyncing: false,
  triggerDownload: vi.fn(),
  cancelDownload: vi.fn(),
  flush: vi.fn(),
  lastSyncedAt: vi.fn(() => null),
  offlineProjectIds: new Set<string>(),
  setProjectOffline: vi.fn(),
};

describe("OfflineIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetInspectionOverlayChromeForTests();
    vi.mocked(useOfflineStatus).mockReturnValue({ isOnline: true, wasOffline: false });
    vi.mocked(useConnectivityMode).mockReturnValue({
      quality: "good",
      isDegraded: false,
      isOnline: true,
    });
    vi.mocked(useOfflineSyncContext).mockReturnValue(defaultSync);
    vi.mocked(useOfflineCacheView).mockReturnValue({
      cachedViewDate: null,
      setCachedViewDate: vi.fn(),
    });
    vi.mocked(initBackgroundSync).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when online and never was offline", () => {
    const { container } = renderWithIntl(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a single offline strip when not online", () => {
    vi.mocked(useOfflineStatus).mockReturnValue({ isOnline: false, wasOffline: true });
    renderWithIntl(<OfflineIndicator />);
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("hides the strip while a clear inspection fill overlay is open", () => {
    vi.mocked(useOfflineStatus).mockReturnValue({ isOnline: false, wasOffline: true });
    notifyInspectionOverlayOpened();
    const { container } = renderWithIntl(<OfflineIndicator />);
    expect(container.firstChild).toBeNull();
    notifyInspectionOverlayClosed();
  });

  it("shows back online in the bottom strip when reconnected with pending uploads", async () => {
    vi.mocked(useOfflineStatus).mockReturnValue({ isOnline: true, wasOffline: true });
    vi.mocked(useOfflineSyncContext).mockReturnValue({ ...defaultSync, pendingCount: 2 });
    renderWithIntl(<OfflineIndicator />);
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(screen.getByText("Back online")).toBeInTheDocument();
  });

  it("shows pending mutation count inline in the offline banner", () => {
    vi.mocked(useOfflineStatus).mockReturnValue({ isOnline: false, wasOffline: false });
    vi.mocked(useOfflineSyncContext).mockReturnValue({ ...defaultSync, pendingCount: 3 });
    renderWithIntl(<OfflineIndicator />);
    expect(screen.getByText(/3 changes saved/)).toBeInTheDocument();
  });

  it("shows one merged pending bar when online with queued changes and cached view", () => {
    vi.mocked(useOfflineSyncContext).mockReturnValue({
      ...defaultSync,
      pendingCount: 1,
      pendingInspectionCount: 0,
    });
    vi.mocked(useOfflineCacheView).mockReturnValue({
      cachedViewDate: "2026-06-18T14:52:00.000Z",
      setCachedViewDate: vi.fn(),
    });
    renderWithIntl(<OfflineIndicator />);
    expect(screen.getByText(/1 .* waiting to upload · showing data from/)).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("shows pending upload bar when online with queued changes only", () => {
    vi.mocked(useOfflineSyncContext).mockReturnValue({
      ...defaultSync,
      pendingCount: 1,
      pendingInspectionCount: 2,
    });
    renderWithIntl(<OfflineIndicator />);
    expect(screen.getByText("3 changes waiting to upload")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload all pending offline changes now" })).toBeInTheDocument();
  });

  it("shows slow connection banner when online but degraded", () => {
    vi.mocked(useConnectivityMode).mockReturnValue({
      quality: "slow",
      isDegraded: true,
      isOnline: true,
    });
    renderWithIntl(<OfflineIndicator />);
    expect(screen.getByText(/Slow connection/)).toBeInTheDocument();
  });

  it("merges cache date into slow connection banner (no duplicate strip)", () => {
    vi.mocked(useConnectivityMode).mockReturnValue({
      quality: "slow",
      isDegraded: true,
      isOnline: true,
    });
    vi.mocked(useOfflineCacheView).mockReturnValue({
      cachedViewDate: "2026-06-18T14:52:00.000Z",
      setCachedViewDate: vi.fn(),
    });
    renderWithIntl(<OfflineIndicator />);
    expect(screen.getByText(/showing data from/)).toBeInTheDocument();
    expect(screen.queryByText(/^Slow connection — changes save locally$/)).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("hides the connectivity strip when online with cached view and empty queue", () => {
    vi.mocked(useOfflineCacheView).mockReturnValue({
      cachedViewDate: "2026-06-18T14:52:00.000Z",
      setCachedViewDate: vi.fn(),
    });
    const { container } = renderWithIntl(<OfflineIndicator />);
    expect(screen.queryByText(/Showing offline data from/)).toBeNull();
    expect(container.querySelector("[data-connectivity-banner]")).toBeNull();
  });

  it("portals the connectivity strip to document.body (position fixed via CSS)", () => {
    vi.mocked(useOfflineStatus).mockReturnValue({ isOnline: false, wasOffline: false });
    renderWithIntl(<OfflineIndicator />);
    const strip = document.body.querySelector("[data-connectivity-banner]");
    expect(strip).toBeTruthy();
    expect(strip?.parentElement).toBe(document.body);
    expect((strip as HTMLElement).style.position).not.toBe("fixed");
  });

  it("surfaces inspection sync errors in the bottom strip (no top banner)", () => {
    renderWithIntl(<OfflineIndicator />);
    act(() => {
      showInspectionSyncStatus({
        variant: "error",
        title: "Could not sync this inspection",
        description: "The server did not respond after 3 tries.",
      });
    });
    expect(screen.getByText("Could not sync this inspection")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("opens sync queue sheet when tapping More info", () => {
    vi.mocked(useOfflineSyncContext).mockReturnValue({
      ...defaultSync,
      pendingCount: 1,
    });
    renderWithIntl(<OfflineIndicator />);
    fireEvent.click(screen.getByRole("button", { name: "View upload queue and cached data details" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Upload queue")).toBeInTheDocument();
  });
});
