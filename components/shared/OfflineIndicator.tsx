"use client";

/**
 * Bottom connectivity strip — offline, slow, pending uploads, cache age,
 * and inspection sync feedback. Portaled to document.body and fixed above
 * the mobile bottom nav so layout overflow cannot trap positioning.
 */

import { useEffect, useState, useRef, useCallback, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { useConnectivityMode } from "@/hooks/use-connectivity-mode";
import { useOfflineSyncContext } from "@/hooks/offline-sync-context";
import { formatOfflineCacheDate, useOfflineCacheView } from "@/hooks/offline-cache-view-context";
import { ConnectivityDetailsSheet } from "@/components/shared/ConnectivityDetailsSheet";
import { useIsBrowser } from "@/hooks/use-is-browser";
import {
  WifiOff,
  SignalLow,
  RefreshCw,
  OctagonX,
  CircleCheck,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { initBackgroundSync } from "@/lib/offline/background-sync";
import {
  buildConnectivityBannerSummary,
  connectivityBannerColors,
  type ConnectivityBannerVariant,
} from "@/lib/offline/connectivity-banner-summary";
import {
  isInspectionOverlayChromeSuppressed,
  subscribeInspectionOverlayChrome,
} from "@/lib/inspections/inspection-overlay-chrome";
import {
  dismissInspectionSyncStatus,
  subscribeInspectionSyncStatus,
  showInspectionSyncStatus,
  type InspectionSyncStatusPayload,
} from "@/lib/inspections/inspection-sync-status";
import { getPendingCount } from "@/lib/offline/mutation-queue";
import { firstQueuedSyncErrorDetail } from "@/lib/offline/queued-sync-error-display";
import type { SheetSyncFeedback } from "@/lib/offline/sync-sheet-feedback";
import {
  getOfflineUploadProgressSnapshot,
  subscribeOfflineUploadProgress,
} from "@/lib/offline/offline-upload-progress";
import type { SyncDetail } from "@/hooks/use-offline-sync";
import { toast } from "sonner";

function syncLabelFor(type: import("@/lib/offline/mutation-queue").MutationType | undefined, t: (key: string) => string): string {
  switch (type) {
    case "create-observation": return t("syncLabelObservation");
    case "create-issue":       return t("syncLabelIssue");
    case "add-comment":        return t("syncLabelComment");
    case "unit-status":        return t("syncLabelStatus");
    case "link-status-album-photo": return t("syncLabelStatusPhoto");
    case "create-custom-site-location": return t("syncLabelCustomSiteLocation");
    default:                   return t("syncing");
  }
}

function formatMutationSyncStripLabel(
  syncDetail: SyncDetail,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const label = syncLabelFor(syncDetail.currentType, t);
  const current = Math.min(syncDetail.done + 1, syncDetail.total);
  if (syncDetail.phase === "media") {
    return t("syncBannerMedia", { label, current, total: syncDetail.total });
  }
  return t("syncBannerItemProgress", { label, current, total: syncDetail.total });
}

function StripIcon({ variant }: { variant: ConnectivityBannerVariant }) {
  switch (variant) {
    case "offline":
      return <WifiOff size={13} aria-hidden style={{ flexShrink: 0 }} />;
    case "slow":
      return <SignalLow size={13} aria-hidden style={{ flexShrink: 0 }} />;
    case "inspection-error":
      return <OctagonX size={13} aria-hidden style={{ flexShrink: 0 }} />;
    case "syncing":
      return <Loader2 size={13} className="animate-spin" aria-hidden style={{ flexShrink: 0 }} />;
    case "reconnected":
    case "inspection-success":
      return <CircleCheck size={13} aria-hidden style={{ flexShrink: 0 }} />;
    case "pending":
    case "cached":
    default:
      return <RefreshCw size={13} aria-hidden style={{ flexShrink: 0 }} />;
  }
}

export function OfflineIndicator() {
  const isBrowser = useIsBrowser();
  const t = useTranslations("offlineIndicator");
  const tQueuePanel = useTranslations("offlineCachePanel");
  const pathname = usePathname();
  const projectIdFromRoute = useMemo(() => {
    const match = pathname?.match(/\/projects\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);
  const { isOnline, wasOffline } = useOfflineStatus();
  const { quality } = useConnectivityMode();
  const isSlowConnection = isOnline && quality === "slow";
  const {
    pendingCount,
    pendingInspectionCount,
    isSyncing,
    isInspectionSyncing,
    syncProgress,
    syncDetail,
    flushPendingInspections,
    flush,
  } = useOfflineSyncContext();
  const uploadProgress = useSyncExternalStore(
    subscribeOfflineUploadProgress,
    getOfflineUploadProgressSnapshot,
    () => getOfflineUploadProgressSnapshot(),
  );
  const { cachedViewDate } = useOfflineCacheView();
  const formattedCacheDate = formatOfflineCacheDate(cachedViewDate);
  const hasCachedView = cachedViewDate != null;
  const inspectionOverlayOpen = useSyncExternalStore(
    subscribeInspectionOverlayChrome,
    isInspectionOverlayChromeSuppressed,
    () => false,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSyncFeedback, setSheetSyncFeedback] = useState<SheetSyncFeedback | null>(null);
  const [cachePanelKey, setCachePanelKey] = useState(0);
  const [showOnlineToast, setShowOnlineToast] = useState(false);
  const [inspectionStatus, setInspectionStatus] = useState<InspectionSyncStatusPayload | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectionDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    initBackgroundSync();
  }, []);

  useEffect(() => {
    return subscribeInspectionSyncStatus((detail) => {
      if (detail.action === "show" || detail.action === "update") {
        setInspectionStatus(detail.status);
      } else {
        setInspectionStatus((prev) => (prev?.id === detail.id ? null : prev));
      }
    });
  }, []);

  useEffect(() => {
    if (!inspectionStatus) return;
    if (inspectionStatus.variant === "error") return;
    if (inspectionDismissRef.current) clearTimeout(inspectionDismissRef.current);
    inspectionDismissRef.current = setTimeout(() => {
      dismissInspectionSyncStatus(inspectionStatus.id);
      setInspectionStatus(null);
    }, 4000);
    return () => {
      if (inspectionDismissRef.current) clearTimeout(inspectionDismissRef.current);
    };
  }, [inspectionStatus]);

  useEffect(() => {
    if (!isOnline) return;
    if (isSyncing || isInspectionSyncing || wasOffline) {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      const id = setTimeout(() => setShowOnlineToast(true), 0);
      return () => clearTimeout(id);
    }
  }, [isOnline, isSyncing, isInspectionSyncing, wasOffline]);

  useEffect(() => {
    if (!isSyncing && !isInspectionSyncing && showOnlineToast) {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setShowOnlineToast(false), 4000);
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      };
    }
  }, [isSyncing, isInspectionSyncing, showOnlineToast]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setTimeout(() => sheetTriggerRef.current?.focus(), 280);
  }, []);

  const handleSyncAllPending = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isOnline) {
      const feedback: SheetSyncFeedback = {
        variant: "error",
        title: t("syncBlockedOfflineTitle"),
        description: t("syncBlockedOfflineDescription"),
      };
      setSheetSyncFeedback(feedback);
      toast.error(feedback.title, { description: feedback.description });
      showInspectionSyncStatus({
        variant: "error",
        title: feedback.title,
        description: feedback.description,
      });
      return;
    }

    setSheetSyncFeedback({
      variant: "syncing",
      title: t("syncingPendingUploads"),
      description: t("syncSheetWorking"),
    });

    const hadPending = pendingCount + pendingInspectionCount;
    const mutationResult = await flush({ manual: true });
    const inspectionRemaining = await flushPendingInspections({ manual: true, showReminderIfPending: true });
    const mutationRemaining = await getPendingCount().catch(() => 0);
    setCachePanelKey((k) => k + 1);

    const totalRemaining = mutationRemaining + inspectionRemaining;

    const publishFeedback = (feedback: SheetSyncFeedback) => {
      setSheetSyncFeedback(feedback);
      if (feedback.variant === "success") {
        toast.success(feedback.title, { description: feedback.description });
      } else if (feedback.variant === "error") {
        toast.error(feedback.title, { description: feedback.description });
      }
      showInspectionSyncStatus({
        variant: feedback.variant === "success" ? "success" : "error",
        title: feedback.title,
        description: feedback.description,
        showRetry: feedback.variant === "error",
      });
    };

    if (totalRemaining === 0 && hadPending > 0) {
      publishFeedback({
        variant: "success",
        title: t("syncAllSuccessTitle"),
        description: t("syncAllSuccessDescription"),
      });
      return;
    }

    if (totalRemaining > 0) {
      const errorDetail =
        (await firstQueuedSyncErrorDetail(tQueuePanel))
        ?? t("syncStillPendingDescription");
      publishFeedback({
        variant: "error",
        title: t("syncStillPendingTitle", { count: totalRemaining }),
        description: errorDetail,
      });
      return;
    }

    if (mutationResult.failed > 0) {
      publishFeedback({
        variant: "error",
        title: t("syncFailedTitle"),
        description: t("syncFailedDescription"),
      });
      return;
    }

    if (hadPending === 0) {
      publishFeedback({
        variant: "success",
        title: t("syncNothingPendingTitle"),
        description: t("syncNothingPendingDescription"),
      });
    } else {
      setSheetSyncFeedback(null);
    }
  }, [flush, flushPendingInspections, isOnline, pendingCount, pendingInspectionCount, t, tQueuePanel]);

  const isUploadingPending = isSyncing || isInspectionSyncing;
  const totalPending = pendingCount + pendingInspectionCount;

  const summary = useMemo(
    () =>
      buildConnectivityBannerSummary({
        isOnline,
        isSlowConnection,
        hasCachedView,
        formattedCacheDate,
        pendingCount,
        pendingInspectionCount,
        isSyncing,
        isInspectionSyncing,
        showOnlineToast,
        wasOffline,
        inspectionStatus,
      }),
    [
      isOnline,
      isSlowConnection,
      hasCachedView,
      formattedCacheDate,
      pendingCount,
      pendingInspectionCount,
      isSyncing,
      isInspectionSyncing,
      showOnlineToast,
      wasOffline,
      inspectionStatus,
    ],
  );

  if (!summary || inspectionOverlayOpen) return null;

  const colors = connectivityBannerColors(summary.variant);

  const stripLabel =
    summary.variant === "syncing" && syncDetail
      ? formatMutationSyncStripLabel(syncDetail, t)
      : summary.variant === "syncing" && uploadProgress.active && uploadProgress.kind === "inspection"
        ? t("syncBannerInspectionProgress", {
            current: Math.min(uploadProgress.done + 1, uploadProgress.total),
            total: uploadProgress.total,
          })
        : summary.variant === "inspection-error" || summary.variant === "inspection-success"
        ? summary.inspectionAlert?.title ?? t(summary.messageKey as Parameters<typeof t>[0], summary.messageValues)
        : t(summary.messageKey as Parameters<typeof t>[0], summary.messageValues);

  const openSheet = () => {
    if (summary.showTapForDetails) {
      setSheetSyncFeedback(null);
      setSheetOpen(true);
    }
  };

  const strip = (
    <div
      data-mobile-chrome-strip
      data-connectivity-banner
    >
      <div
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          minHeight: 36,
          padding: "6px 10px",
          background: colors.background,
          color: colors.color,
          borderTop: colors.borderTop,
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        <StripIcon variant={summary.variant} />
        <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>{stripLabel}</span>
        {summary.showTapForDetails ? (
          <button
            ref={sheetTriggerRef}
            type="button"
            onClick={openSheet}
            aria-label={t("moreInfoAria")}
            style={{
              flexShrink: 0,
              padding: "5px 8px",
              border: "1px solid currentColor",
              borderRadius: 6,
              background: "transparent",
              color: "inherit",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t("moreInfo")}
          </button>
        ) : null}
        {summary.showSyncButton ? (
          <button
            type="button"
            onClick={handleSyncAllPending}
            disabled={isUploadingPending}
            aria-label={t("syncPendingUploadsAria")}
            style={{
              flexShrink: 0,
              padding: "5px 8px",
              border: "1px solid currentColor",
              borderRadius: 6,
              background: "transparent",
              color: "inherit",
              fontSize: 11,
              fontWeight: 600,
              cursor: isUploadingPending ? "wait" : "pointer",
              opacity: isUploadingPending ? 0.7 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {isUploadingPending ? t("syncingPendingUploads") : t("syncPendingUploadsNow")}
          </button>
        ) : null}
      </div>
      {summary.variant === "syncing" && syncProgress !== null && (
        <div style={{ height: 3, background: "var(--neutral-700)" }}>
          <div
            style={{
              height: "100%",
              width: `${syncProgress}%`,
              background: "var(--success-600)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}
    </div>
  );

  if (!isBrowser) return null;

  return (
    <>
      {createPortal(strip, document.body)}

      {sheetOpen ? (
        <ConnectivityDetailsSheet
          onClose={closeSheet}
          stripLabel={stripLabel}
          pendingUploadCount={totalPending}
          showSyncButton={summary.showSyncButton || totalPending > 0}
          isUploadingPending={isUploadingPending}
          onSync={() => handleSyncAllPending()}
          cachePanelKey={cachePanelKey}
          projectId={projectIdFromRoute}
          syncFeedback={sheetSyncFeedback}
        />
      ) : null}
    </>
  );
}
