"use client";

/**
 * ProjectOfflineCacheSection — understated offline-data status card for the
 * project overview page.
 *
 * Auto-triggers a download on first visit (no data yet, user is online) so the
 * user sees live progress instead of a passive "it'll happen eventually" message.
 * Also lets the user manually re-sync at any time.
 * Styled to match the "% COMPLETE BY SCOPE" card in ProjectOverviewStats.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, Clock, HardDrive } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useOfflineSyncContext } from "@/hooks/offline-sync-context";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { PROJECT_HUB_CARD_STYLE, ProjectHubCardHeader } from "@/components/projects/ProjectHubCardHeader";

const STALE_MS = 24 * 60 * 60 * 1000;

const card: React.CSSProperties = PROJECT_HUB_CARD_STYLE;

function formatRelativeTime(isoString: string, locale: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return rtf.format(0, "minute");
  if (mins < 60) return rtf.format(-mins, "minute");
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return rtf.format(-hrs, "hour");
  return rtf.format(-Math.floor(hrs / 24), "day");
}

interface Props {
  projectId: string;
}

export function ProjectOfflineCacheSection({ projectId }: Props) {
  const t = useTranslations("projectOfflineCache");
  const locale = useLocale();
  const { lastSyncedAt, isDownloading, downloadProgress, triggerDownload, isHydrated } =
    useOfflineSyncContext();
  const { isOnline } = useOfflineStatus();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const autoTriggeredRef = useRef(false);

  const syncedAt = isHydrated ? lastSyncedAt(projectId) : null;
  const activeProgress = isSyncing ? downloadProgress : null;

  // Avoid calling Date.now() during render
  useEffect(() => {
    const next = syncedAt
      ? Date.now() - new Date(syncedAt).getTime() > STALE_MS
      : false;
    const id = setTimeout(() => setIsStale(next), 0);
    return () => clearTimeout(id);
  }, [syncedAt]);

  const handleSync = useCallback(async () => {
    if (isSyncing || isDownloading) return;
    setIsSyncing(true);
    setSyncError(false);
    try {
      await triggerDownload(projectId, { showProgressOverlay: false });
    } catch {
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isDownloading, triggerDownload, projectId]);

  // Auto-trigger on first visit if there's no cached data yet and the user is online.
  // This makes the progress bar visible instead of a passive "it'll happen eventually" message.
  // Guard with a ref so we only fire once per mount even in React StrictMode double-invoke.
  useEffect(() => {
    if (autoTriggeredRef.current) return;
    if (!isOnline) return;
    if (syncedAt) return; // already have data — don't auto-re-download on every visit
    autoTriggeredRef.current = true;
    void handleSync();
    // handleSync is stable for the lifetime of this effect; intentionally not in deps
    // to avoid re-triggering when isSyncing/isDownloading flip during the download.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, syncedAt]);

  const showProgress = isSyncing && activeProgress !== null;

  return (
    <div style={card}>
      <ProjectHubCardHeader icon={HardDrive} title={t("sectionTitle")} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        {/* Status text */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            minWidth: 0,
          }}
        >
          {isSyncing ? (
            <RefreshCw
              size={13}
              className="animate-spin"
              aria-hidden
              style={{ color: "var(--neutral-400)", flexShrink: 0 }}
            />
          ) : syncError ? (
            <AlertTriangle
              size={13}
              aria-hidden
              style={{ color: "var(--error-600)", flexShrink: 0 }}
            />
          ) : syncedAt && !isStale ? (
            <CheckCircle2
              size={13}
              aria-hidden
              style={{ color: "var(--success-600)", flexShrink: 0 }}
            />
          ) : isStale ? (
            <AlertTriangle
              size={13}
              aria-hidden
              style={{ color: "var(--warning-600)", flexShrink: 0 }}
            />
          ) : (
            <Clock
              size={13}
              aria-hidden
              style={{ color: "var(--neutral-400)", flexShrink: 0 }}
            />
          )}

          <span
            style={{
              fontSize: "var(--text-body)",
              color: syncError
                ? "var(--error-600)"
                : isStale
                  ? "var(--warning-600)"
                  : "var(--neutral-600)",
            }}
          >
            {isSyncing
              ? t("syncing", { pct: activeProgress ?? 0 })
              : syncError
                ? t("error")
                : syncedAt
                  ? isStale
                    ? t("stale", { time: formatRelativeTime(syncedAt, locale) })
                    : t("ready", { time: formatRelativeTime(syncedAt, locale) })
                  : t("noData")}
          </span>
        </div>

        {/* Sync button */}
        {!isSyncing && (
          <button
            type="button"
            onClick={handleSync}
            aria-label={t("syncAriaLabel")}
            disabled={isDownloading}
            className="offline-cache-sync-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 600,
              color: "#737891",
              backgroundColor: "#F0F1F5",
              border: "none",
              borderRadius: 14,
              padding: "4px 12px",
              cursor: isDownloading ? "not-allowed" : "pointer",
              opacity: isDownloading ? 0.5 : 1,
              transition: "color 0.15s, border-color 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            <RefreshCw size={11} aria-hidden />
            {syncedAt ? t("syncNow") : t("downloadNow")}
          </button>
        )}
      </div>

      {/* Progress bar — visible only while syncing */}
      {showProgress && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={activeProgress ?? 0}
          aria-valuetext={t("progressAriaLabel", { pct: activeProgress ?? 0 })}
          style={{
            marginTop: "var(--space-3)",
            height: 4,
            borderRadius: 2,
            backgroundColor: "var(--neutral-100)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${activeProgress}%`,
              borderRadius: 2,
              backgroundColor: "var(--primary-600)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}

      {/* Subtext — shown only when no data cached yet */}
      {!syncedAt && !isSyncing && (
        <p
          style={{
            margin: "var(--space-2) 0 0",
            fontSize: 11,
            color: "var(--neutral-400)",
            lineHeight: 1.5,
          }}
        >
          {isOnline ? t("noDataDescriptionOnline") : t("noDataDescription")}
        </p>
      )}
    </div>
  );
}
