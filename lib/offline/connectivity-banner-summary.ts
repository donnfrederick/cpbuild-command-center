import type { InspectionSyncStatusPayload } from "@/lib/inspections/inspection-sync-status";

export type ConnectivityBannerVariant =
  | "offline"
  | "slow"
  | "pending"
  | "cached"
  | "syncing"
  | "reconnected"
  | "inspection-error"
  | "inspection-success";

export interface ConnectivityBannerSummary {
  variant: ConnectivityBannerVariant;
  messageKey: string;
  messageValues: Record<string, string | number>;
  showSyncButton: boolean;
  showTapForDetails: boolean;
  inspectionAlert?: Pick<InspectionSyncStatusPayload, "title" | "description" | "variant">;
}

export interface ConnectivityBannerInput {
  isOnline: boolean;
  isSlowConnection: boolean;
  hasCachedView: boolean;
  formattedCacheDate: string;
  pendingCount: number;
  pendingInspectionCount: number;
  isSyncing: boolean;
  isInspectionSyncing: boolean;
  showOnlineToast: boolean;
  wasOffline: boolean;
  inspectionStatus: InspectionSyncStatusPayload | null;
}

/**
 * Collapses offline / slow / pending / cache / sync feedback into one bottom strip.
 * Returns null when nothing should be shown.
 */
export function buildConnectivityBannerSummary(
  input: ConnectivityBannerInput,
): ConnectivityBannerSummary | null {
  const totalPending = input.pendingCount + input.pendingInspectionCount;
  const isUploading = input.isSyncing || input.isInspectionSyncing;
  const inspection = input.inspectionStatus;
  const inspectionIsError = inspection?.variant === "error";
  const inspectionIsTransientSuccess =
    inspection?.variant === "success" || inspection?.variant === "loading";

  // Prefer syncing UI over a stale offline flag (missed "online" event on mobile).
  if (isUploading) {
    return {
      variant: "syncing",
      messageKey: "syncing",
      messageValues: {},
      showSyncButton: false,
      showTapForDetails: totalPending > 0 || input.hasCachedView,
      inspectionAlert: inspection ?? undefined,
    };
  }

  if (!input.isOnline) {
    const messageKey =
      totalPending > 0
        ? input.hasCachedView
          ? "offlineWithCountAndCache"
          : "offlineWithCount"
        : input.hasCachedView
          ? "offlineWithCacheDate"
          : "offlineNoChanges";
    return {
      variant: "offline",
      messageKey,
      messageValues:
        totalPending > 0
          ? input.hasCachedView
            ? { count: totalPending, date: input.formattedCacheDate }
            : { count: totalPending }
          : input.hasCachedView
            ? { date: input.formattedCacheDate }
            : {},
      showSyncButton: false,
      showTapForDetails: true,
      inspectionAlert: inspectionIsError ? inspection : undefined,
    };
  }

  if (inspectionIsError && inspection) {
    return {
      variant: "inspection-error",
      messageKey: "bannerInspectionSyncFailed",
      messageValues: {
        title: inspection.title,
        ...(totalPending > 0 ? { count: totalPending } : {}),
      },
      showSyncButton: totalPending > 0,
      showTapForDetails: true,
      inspectionAlert: inspection,
    };
  }

  if (input.isSlowConnection) {
    let messageKey = "slowConnectionBanner";
    const messageValues: Record<string, string | number> = {};
    if (input.hasCachedView && totalPending > 0) {
      messageKey = "bannerSlowPendingCache";
      messageValues.date = input.formattedCacheDate;
      messageValues.count = totalPending;
    } else if (input.hasCachedView) {
      messageKey = "slowConnectionWithCacheBanner";
      messageValues.date = input.formattedCacheDate;
    } else if (totalPending > 0) {
      messageKey = "bannerSlowAndPending";
      messageValues.count = totalPending;
    }
    return {
      variant: "slow",
      messageKey,
      messageValues,
      showSyncButton: totalPending > 0,
      showTapForDetails: true,
      inspectionAlert: inspectionIsTransientSuccess ? inspection : undefined,
    };
  }

  if (input.showOnlineToast && totalPending > 0) {
    return {
      variant: "reconnected",
      messageKey: input.wasOffline ? "backOnline" : "allCaughtUp",
      messageValues: {},
      showSyncButton: false,
      showTapForDetails: false,
      inspectionAlert: inspectionIsTransientSuccess ? inspection : undefined,
    };
  }

  if (totalPending > 0) {
    const messageKey = input.hasCachedView
      ? "bannerPendingAndCache"
      : "pendingUploadsBanner";
    return {
      variant: "pending",
      messageKey,
      messageValues: input.hasCachedView
        ? { count: totalPending, date: input.formattedCacheDate }
        : { count: totalPending },
      showSyncButton: true,
      showTapForDetails: true,
      inspectionAlert: inspectionIsTransientSuccess ? inspection : undefined,
    };
  }

  if (inspectionIsTransientSuccess && inspection) {
    return {
      variant: "inspection-success",
      messageKey: "bannerInspectionSaved",
      messageValues: { title: inspection.title },
      showSyncButton: false,
      showTapForDetails: false,
      inspectionAlert: inspection,
    };
  }

  return null;
}

export function connectivityBannerColors(variant: ConnectivityBannerVariant): {
  background: string;
  color: string;
  borderTop?: string;
} {
  switch (variant) {
    case "offline":
      return {
        background: "var(--neutral-900)",
        color: "var(--neutral-0)",
      };
    case "inspection-error":
      return {
        background: "var(--error-600)",
        color: "var(--neutral-0)",
      };
    case "slow":
    case "pending":
      return {
        background: "var(--warning-600)",
        color: "var(--neutral-0)",
      };
    case "syncing":
      return {
        background: "var(--neutral-900)",
        color: "var(--neutral-0)",
      };
    case "reconnected":
    case "inspection-success":
      return {
        background: "var(--success-600)",
        color: "var(--neutral-0)",
      };
    case "cached":
    default:
      return {
        background: "var(--warning-100)",
        color: "var(--warning-600)",
        borderTop: "1px solid var(--warning-600)",
      };
  }
}
