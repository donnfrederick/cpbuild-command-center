"use client";

/**
 * Client-only offline button — reads localStorage-backed prefs via OfflineSyncContext.
 * Loaded via next/dynamic (ssr: false) from OfflineProjectButton.tsx.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CloudDownload,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  RefreshCw,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useOfflineSyncContext } from "@/hooks/offline-sync-context";
import { useOfflineStatus } from "@/hooks/use-offline-status";

export interface OfflineProjectButtonProps {
  projectId: string;
  projectName?: string;
  /** Mobile project cards — icon-first labels that stay within card width. */
  compact?: boolean;
}

type ButtonState = "off" | "downloading" | "ready" | "stale" | "error";

const STALE_MS = 24 * 60 * 60 * 1000;

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

export function OfflineProjectButtonClient({
  projectId,
  projectName,
  compact = false,
}: OfflineProjectButtonProps) {
  const t = useTranslations("offlineProjectButton");
  const locale = useLocale();
  const { isOnline } = useOfflineStatus();
  const {
    offlineProjectIds,
    downloadProgress,
    isDownloading,
    downloadingProjectId,
    triggerDownload,
    setProjectOffline,
    lastSyncedAt,
  } = useOfflineSyncContext();

  const [errorState, setErrorState] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const syncedAt = lastSyncedAt(projectId);
  const isEnabled = offlineProjectIds.has(projectId);
  const isThisDownloading = isDownloading && downloadingProjectId === projectId;

  useEffect(() => {
    const next = syncedAt
      ? Date.now() - new Date(syncedAt).getTime() > STALE_MS
      : false;
    const id = setTimeout(() => setIsStale(next), 0);
    return () => clearTimeout(id);
  }, [syncedAt]);

  const state: ButtonState = isThisDownloading
    ? "downloading"
    : errorState
      ? "error"
      : !isEnabled || !syncedAt
        ? "off"
        : isStale
          ? "stale"
          : "ready";

  const handleMainClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (state === "downloading") return;

      setErrorState(false);
      try {
        await triggerDownload(projectId, { projectName, showProgressOverlay: true });
      } catch {
        setErrorState(true);
      }
    },
    [state, triggerDownload, projectId, projectName],
  );

  const handleDisable = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      await setProjectOffline(projectId, false);
      setErrorState(false);
      setShowDisable(false);
    },
    [setProjectOffline, projectId],
  );

  const showX = (state === "ready" || state === "stale") && showDisable && isOnline;
  const relativeSynced = syncedAt ? formatRelativeTime(syncedAt, locale) : null;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      style={compact ? { minWidth: 0, maxWidth: "100%" } : undefined}
      onMouseEnter={() => setShowDisable(true)}
      onMouseLeave={() => setShowDisable(false)}
      onFocus={() => setShowDisable(true)}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setShowDisable(false);
        }
      }}
    >
      <button
        type="button"
        onClick={handleMainClick}
        disabled={state === "downloading"}
        aria-label={
          state === "off"
            ? t("preDownloadAriaLabel")
            : state === "downloading"
              ? t("downloadingAriaLabel", { pct: downloadProgress ?? 0 })
              : state === "ready"
                ? relativeSynced
                  ? t("readyAriaLabelWithTime", { time: relativeSynced })
                  : t("readyAriaLabel")
                : state === "stale"
                  ? t("staleAriaLabel")
                  : t("errorAriaLabel")
        }
        className={[
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
          compact ? "max-w-full shrink min-w-0" : "",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
          state === "off"
            ? "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 focus-visible:ring-neutral-400"
            : state === "ready"
              ? "border border-transparent bg-[var(--success-100)] text-[var(--success-600)] hover:brightness-95 focus-visible:ring-[var(--success-600)]"
              : state === "stale"
                ? "border border-transparent bg-[var(--warning-100)] text-[var(--warning-600)] hover:brightness-95 focus-visible:ring-[var(--warning-600)]"
                : state === "error"
                  ? "border border-transparent bg-[var(--error-100)] text-[var(--error-600)] hover:brightness-95 focus-visible:ring-[var(--error-600)]"
                  : "cursor-not-allowed border border-transparent bg-neutral-50 text-neutral-400",
        ].join(" ")}
        style={
          compact
            ? { whiteSpace: "normal", textAlign: "left", lineHeight: 1.25 }
            : { whiteSpace: "nowrap" }
        }
      >
        {state === "off" && (
          <>
            <CloudDownload size={12} aria-hidden className="shrink-0" />
            {compact ? null : <span>{t("preDownload")}</span>}
          </>
        )}
        {state === "downloading" && (
          <>
            <Loader2 size={12} className="animate-spin shrink-0" aria-hidden />
            <span>{compact ? `${downloadProgress ?? 0}%` : t("downloading", { pct: downloadProgress ?? 0 })}</span>
          </>
        )}
        {state === "ready" && (
          <>
            <CheckCircle size={12} aria-hidden className="shrink-0" />
            {compact ? (
              <span>{relativeSynced ?? t("preDownloaded")}</span>
            ) : (
              <>
                <span>{t("preDownloaded")}</span>
                {relativeSynced ? (
                  <span className="opacity-60">{relativeSynced}</span>
                ) : null}
              </>
            )}
          </>
        )}
        {state === "stale" && (
          <>
            <RefreshCw size={12} aria-hidden className="shrink-0" />
            {compact ? null : <span>{t("stale")}</span>}
          </>
        )}
        {state === "error" && (
          <>
            <AlertTriangle size={12} aria-hidden className="shrink-0" />
            {compact ? null : <span>{t("error")}</span>}
          </>
        )}
      </button>

      {showX && (
        <button
          type="button"
          onClick={handleDisable}
          aria-label={t("disableAriaLabel")}
          className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-200 text-neutral-500 hover:bg-neutral-300 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          <X size={9} aria-hidden />
        </button>
      )}
    </div>
  );
}
