/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OfflineSyncProvider, useOfflineSyncContext } from "@/hooks/offline-sync-context";

function HydrationProbe() {
  const { isHydrated, offlineProjectIds } = useOfflineSyncContext();
  return (
    <div>
      <span data-testid="hydrated">{String(isHydrated)}</span>
      <span data-testid="count">{offlineProjectIds.size}</span>
    </div>
  );
}

vi.mock("@/hooks/use-offline-sync", () => ({
  useOfflineSync: (isHydrated: boolean) => ({
    downloadProgress: null,
    downloadState: null,
    downloadingProjectId: null,
    isDownloading: false,
    pendingCount: 0,
    syncProgress: null,
    syncDetail: null,
    isSyncing: false,
    triggerDownload: vi.fn(),
    cancelDownload: vi.fn(),
    flush: vi.fn(),
    lastSyncedAt: vi.fn(),
    offlineProjectIds: isHydrated ? new Set(["proj-1"]) : new Set(),
    setProjectOffline: vi.fn(),
  }),
}));

vi.mock("@/lib/offline/connectivity", () => ({
  subscribeConnectivityQuality: vi.fn(() => vi.fn()),
}));

vi.mock("@/lib/inspections/inspectionOfflineDb", () => ({
  getAllPending: vi.fn().mockResolvedValue([]),
  getPendingInspectionCount: vi.fn().mockResolvedValue(0),
  resetSyncAttemptsForManualRetry: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/inspections/inspection-sync-one", () => ({
  syncOne: vi.fn(),
  InspectionSyncRejectedError: class InspectionSyncRejectedError extends Error {},
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("OfflineSyncProvider", () => {
  it("renders without useInspectionSync export errors", () => {
    expect(() =>
      render(
        <OfflineSyncProvider>
          <div>child</div>
        </OfflineSyncProvider>,
      ),
    ).not.toThrow();
  });

  it("sets isHydrated after mount", async () => {
    render(
      <OfflineSyncProvider>
        <HydrationProbe />
      </OfflineSyncProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("hydrated")).toHaveTextContent("true");
    });
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
