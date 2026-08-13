import { describe, it, expect } from "vitest";
import { buildConnectivityBannerSummary } from "@/lib/offline/connectivity-banner-summary";

const base = {
  isOnline: true,
  isSlowConnection: false,
  hasCachedView: false,
  formattedCacheDate: "Jun 26, 07:54 PM",
  pendingCount: 0,
  pendingInspectionCount: 0,
  isSyncing: false,
  isInspectionSyncing: false,
  showOnlineToast: false,
  wasOffline: false,
  inspectionStatus: null,
};

describe("buildConnectivityBannerSummary", () => {
  it("returns null when fully online with no signals", () => {
    expect(buildConnectivityBannerSummary(base)).toBeNull();
  });

  it("shows syncing variant even when isOnline is stale false", () => {
    const summary = buildConnectivityBannerSummary({
      ...base,
      isOnline: false,
      isSyncing: true,
    });
    expect(summary?.variant).toBe("syncing");
    expect(summary?.messageKey).toBe("syncing");
  });

  it("merges pending uploads and cached view into one pending strip", () => {
    const summary = buildConnectivityBannerSummary({
      ...base,
      hasCachedView: true,
      pendingInspectionCount: 1,
    });
    expect(summary?.variant).toBe("pending");
    expect(summary?.messageKey).toBe("bannerPendingAndCache");
    expect(summary?.showSyncButton).toBe(true);
    expect(summary?.showTapForDetails).toBe(true);
  });

  it("does not emit a cached strip when online with cache only", () => {
    const withBoth = buildConnectivityBannerSummary({
      ...base,
      hasCachedView: true,
      pendingCount: 1,
    });
    expect(withBoth?.messageKey).toBe("bannerPendingAndCache");
    expect(
      buildConnectivityBannerSummary({
        ...base,
        hasCachedView: true,
        isOnline: true,
      }),
    ).toBeNull();
    expect(
      buildConnectivityBannerSummary({
        ...base,
        hasCachedView: true,
        isOnline: false,
      })?.messageKey,
    ).toBe("offlineWithCacheDate");
  });

  it("hides cached strip when online with empty queue", () => {
    expect(
      buildConnectivityBannerSummary({
        ...base,
        hasCachedView: true,
        isOnline: true,
      }),
    ).toBeNull();
  });

  it("hides reconnected toast when queue is empty", () => {
    expect(
      buildConnectivityBannerSummary({
        ...base,
        showOnlineToast: true,
        wasOffline: true,
      }),
    ).toBeNull();
  });

  it("surfaces inspection sync errors in the bottom strip", () => {
    const summary = buildConnectivityBannerSummary({
      ...base,
      inspectionStatus: {
        id: "x",
        variant: "error",
        title: "Could not sync this inspection",
        description: "After 3 tries",
      },
    });
    expect(summary?.variant).toBe("inspection-error");
    expect(summary?.showTapForDetails).toBe(true);
  });

  it("merges slow connection with pending and cache", () => {
    const summary = buildConnectivityBannerSummary({
      ...base,
      isSlowConnection: true,
      hasCachedView: true,
      pendingCount: 1,
    });
    expect(summary?.messageKey).toBe("bannerSlowPendingCache");
    expect(summary?.showSyncButton).toBe(true);
  });
});
