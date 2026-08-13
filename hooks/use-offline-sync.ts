"use client";

import { OFFLINE_SYNC_COMPLETE_EVENT } from "@/lib/offline/events";

/**
 * use-offline-sync — central hook for offline download and sync state.
 *
 * Consumed by:
 *  - OfflineProjectButton  — per-project download progress + last-synced time
 *  - OfflineIndicator      — global pending count + flush progress
 *
 * Offline prefs are read via useSyncExternalStore (empty server snapshot) so SSR
 * and hydration match. API prefs load only after the client has hydrated.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { getPendingCount, flushMutationQueue } from "@/lib/offline/mutation-queue";
import type { FlushMutationQueueOptions } from "@/lib/offline/mutation-queue";
import type { MutationType } from "@/lib/offline/mutation-queue";
import { triggerResync, cancelActiveResync } from "@/lib/offline/background-sync";
import { OFFLINE_SNAPSHOT_SYNCED_EVENT } from "@/lib/offline/events";
import {
  clearOfflineUploadProgress,
  patchOfflineUploadProgress,
} from "@/lib/offline/offline-upload-progress";
import type { DownloadProgressState, ResyncProgressCallback } from "@/lib/offline/resync-progress";
import {
  getLocalOfflinePrefsServerSnapshot,
  getLocalOfflinePrefsSnapshot,
  readLocalOfflinePrefs,
  subscribeLocalOfflinePrefs,
  writeLocalOfflinePrefs,
  EMPTY_LOCAL_OFFLINE_PREFS,
  type LocalOfflinePrefs,
} from "@/lib/offline/offline-prefs-local";

export interface SyncDetail {
  done: number;
  total: number;
  /** The mutation type currently being processed — UI components use this to derive a translated label. */
  currentType: MutationType | undefined;
  /** Mutation queue row id — highlights the active row in the upload queue panel. */
  currentMutationId?: string;
  /** media = blob upload; request = API write in flight. */
  phase?: "media" | "request";
}

export interface TriggerDownloadOptions {
  projectName?: string;
  /** Full-screen/bottom-sheet progress — projects list manual pre-download only. */
  showProgressOverlay?: boolean;
}

export interface OfflineSyncState {
  /** 0-100 while a download is in progress, null otherwise */
  downloadProgress: number | null;
  /** Rich progress for the pre-download overlay (null when idle). */
  downloadState: DownloadProgressState | null;
  /** Which project is currently pre-downloading (null when idle). */
  downloadingProjectId: string | null;
  isDownloading: boolean;
  /** Number of mutations waiting to sync */
  pendingCount: number;
  /** 0-100 while a flush is in progress, null otherwise */
  syncProgress: number | null;
  /** Detailed progress for the richer sync UI (null when not syncing). */
  syncDetail: SyncDetail | null;
  isSyncing: boolean;
  /** Trigger a download+cache for the given project. Adds it to offlineProjectIds if not already there. */
  triggerDownload: (projectId: string, options?: TriggerDownloadOptions) => Promise<void>;
  /** Cancel the in-flight pre-download started by triggerDownload. */
  cancelDownload: () => void;
  /** Flush all pending mutations (called automatically on reconnect, but also usable manually). */
  flush: (options?: { manual?: boolean }) => Promise<{ flushed: number; failed: number }>;
  /** Returns the ISO last-synced timestamp for a given projectId, or null. */
  lastSyncedAt: (projectId: string) => string | null;
  /** The set of project IDs currently marked for offline. */
  offlineProjectIds: Set<string>;
  /** Add or remove a project from the offline set. */
  setProjectOffline: (projectId: string, enabled: boolean) => Promise<void>;
}

const POLL_INTERVAL_MS = 5000;
const PREFS_URL = "/api/offline/preferences";

export function useOfflineSync(isHydrated: boolean): OfflineSyncState {
  const { isOnline } = useOfflineStatus();

  const [downloadState, setDownloadState] = useState<DownloadProgressState | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadingProjectId, setDownloadingProjectId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [syncDetail, setSyncDetail] = useState<SyncDetail | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const getOfflinePrefsSnapshot = useCallback((): LocalOfflinePrefs => {
    if (!isHydrated) return EMPTY_LOCAL_OFFLINE_PREFS;
    return getLocalOfflinePrefsSnapshot();
  }, [isHydrated]);

  const localPrefs = useSyncExternalStore(
    subscribeLocalOfflinePrefs,
    getOfflinePrefsSnapshot,
    getLocalOfflinePrefsServerSnapshot,
  );

  const offlineProjectIds = useMemo(
    () => new Set(localPrefs.offlineProjectIds),
    [localPrefs.offlineProjectIds],
  );
  const projectSyncedAt = localPrefs.projectSyncedAt;

  const apiPrefsLoadedRef = useRef(false);
  const downloadingRef = useRef(false);

  const mergePrefsFromApi = useCallback(
    (data: { offlineProjectIds?: string[]; projectSyncedAt?: Record<string, string> }) => {
      const current = getLocalOfflinePrefsSnapshot();
      writeLocalOfflinePrefs({
        offlineProjectIds: data.offlineProjectIds ?? current.offlineProjectIds,
        projectSyncedAt: data.projectSyncedAt ?? current.projectSyncedAt,
      });
    },
    [],
  );

  // Load server prefs only after hydration — avoids updating display before SSR HTML matches.
  useEffect(() => {
    if (!isHydrated || apiPrefsLoadedRef.current) return;

    fetch(PREFS_URL)
      .then((r) => r.json())
      .then((data: { offlineProjectIds?: string[]; projectSyncedAt?: Record<string, string> }) => {
        apiPrefsLoadedRef.current = true;
        mergePrefsFromApi(data);
      })
      .catch(() => {
        apiPrefsLoadedRef.current = true;
        const local = readLocalOfflinePrefs();
        if (local) mergePrefsFromApi(local);
      });
  }, [isHydrated, mergePrefsFromApi]);

  // ── Listen for background auto-warm completions ───────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId, syncedAt } = (e as CustomEvent<{ projectId: string; syncedAt: string }>).detail;
      if (projectId && syncedAt) {
        const current = getLocalOfflinePrefsSnapshot();
        writeLocalOfflinePrefs({
          offlineProjectIds: current.offlineProjectIds,
          projectSyncedAt: { ...current.projectSyncedAt, [projectId]: syncedAt },
        });
      }
    };
    window.addEventListener(OFFLINE_SNAPSHOT_SYNCED_EVENT, handler);
    return () => window.removeEventListener(OFFLINE_SNAPSHOT_SYNCED_EVENT, handler);
  }, []);

  // ── Poll pending mutation count (online + offline) ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const count = await getPendingCount().catch(() => 0);
      if (!cancelled) setPendingCount(count);
    };
    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    const onSyncComplete = () => { void poll(); };
    window.addEventListener(OFFLINE_SYNC_COMPLETE_EVENT, onSyncComplete);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener(OFFLINE_SYNC_COMPLETE_EVENT, onSyncComplete);
    };
  }, []);

  // ── Auto-flush on reconnect ────────────────────────────────────────────────
  useEffect(() => {
    if (!isOnline) return;
    const timer = setTimeout(() => {
      void flush();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // ── triggerDownload ────────────────────────────────────────────────────────
  const triggerDownload = useCallback(async (projectId: string, options?: TriggerDownloadOptions) => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setIsDownloading(true);
    setDownloadingProjectId(projectId);
    setDownloadProgress(0);

    const showOverlay = options?.showProgressOverlay === true;
    const priorPrefs = getLocalOfflinePrefsSnapshot();
    const priorOfflineIds = new Set(priorPrefs.offlineProjectIds);
    const wasAlreadyOffline = priorOfflineIds.has(projectId);

    const onProgress: ResyncProgressCallback = (progress) => {
      setDownloadProgress(progress.percent);
      if (!showOverlay) return;
      setDownloadState((prev) => {
        if (prev && prev.projectId !== projectId) return prev;
        const base: DownloadProgressState = prev ?? {
          projectId,
          projectName: options?.projectName,
          percent: 0,
          phase: "preparing",
        };
        return {
          ...base,
          ...progress,
          projectId,
          projectName: options?.projectName ?? base.projectName,
        };
      });
    };

    if (showOverlay) {
      setDownloadState({
        projectId,
        projectName: options?.projectName,
        percent: 0,
        phase: "preparing",
      });
    }

    const nextIds = new Set(priorOfflineIds);
    nextIds.add(projectId);
    writeLocalOfflinePrefs({
      offlineProjectIds: Array.from(nextIds),
      projectSyncedAt: priorPrefs.projectSyncedAt,
    });

    const revertOffline = () => {
      if (!wasAlreadyOffline) {
        writeLocalOfflinePrefs({
          offlineProjectIds: Array.from(priorOfflineIds),
          projectSyncedAt: priorPrefs.projectSyncedAt,
        });
        void fetch(PREFS_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offlineProjectIds: Array.from(priorOfflineIds) }),
        }).catch(() => undefined);
      }
    };

    try {
      await fetch(PREFS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offlineProjectIds: Array.from(nextIds) }),
      });

      let result = await triggerResync([projectId], onProgress, { warmHtml: true });

      if (result.skipped) {
        onProgress({ phase: "waiting", percent: 40 });
        await new Promise((r) => setTimeout(r, 3000));
        result = await triggerResync([projectId], onProgress, { warmHtml: true });
      }

      if (result.cancelled) {
        revertOffline();
        return;
      }

      if (result.ok && result.syncedAt) {
        const current = getLocalOfflinePrefsSnapshot();
        writeLocalOfflinePrefs({
          offlineProjectIds: current.offlineProjectIds,
          projectSyncedAt: { ...current.projectSyncedAt, [projectId]: result.syncedAt },
        });
      } else if (!result.ok && !result.skipped) {
        revertOffline();
      }
    } catch {
      revertOffline();
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
      setDownloadingProjectId(null);
      setDownloadState(null);
      downloadingRef.current = false;
    }
  }, []);

  const cancelDownload = useCallback(() => {
    cancelActiveResync();
  }, []);

  // ── setProjectOffline ─────────────────────────────────────────────────────
  const setProjectOffline = useCallback(async (projectId: string, enabled: boolean) => {
    const prior = getLocalOfflinePrefsSnapshot();
    const next = new Set(prior.offlineProjectIds);
    if (enabled) {
      next.add(projectId);
    } else {
      next.delete(projectId);
    }
    writeLocalOfflinePrefs({
      offlineProjectIds: Array.from(next),
      projectSyncedAt: prior.projectSyncedAt,
    });
    try {
      const res = await fetch(PREFS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offlineProjectIds: Array.from(next) }),
      });
      if (!res.ok) {
        writeLocalOfflinePrefs({
          offlineProjectIds: prior.offlineProjectIds,
          projectSyncedAt: prior.projectSyncedAt,
        });
      }
    } catch {
      writeLocalOfflinePrefs({
        offlineProjectIds: prior.offlineProjectIds,
        projectSyncedAt: prior.projectSyncedAt,
      });
    }
  }, []);

  // ── flush ─────────────────────────────────────────────────────────────────
  const flush = useCallback(async (options?: FlushMutationQueueOptions): Promise<{ flushed: number; failed: number }> => {
    const count = await getPendingCount().catch(() => 0);
    if (count === 0) {
      setPendingCount(0);
      return { flushed: 0, failed: 0 };
    }

    setIsSyncing(true);
    setSyncProgress(0);
    setSyncDetail({ done: 0, total: count, currentType: undefined });
    patchOfflineUploadProgress({
      active: true,
      kind: "mutation",
      phase: "request",
      done: 0,
      total: count,
      currentItemId: null,
      currentType: null,
    });

    try {
      const result = await flushMutationQueue(({ done, total, currentType, currentMutationId, phase }) => {
        setSyncProgress(total > 0 ? Math.round((done / total) * 100) : 100);
        setSyncDetail({ done, total, currentType, currentMutationId, phase });
        patchOfflineUploadProgress({
          active: true,
          kind: "mutation",
          phase: phase === "media" ? "media" : "request",
          done,
          total,
          currentItemId: currentMutationId,
          currentType,
        });
      }, options);
      const remaining = await getPendingCount().catch(() => 0);
      setPendingCount(remaining);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT));
      }
      return result;
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
      setSyncDetail(null);
      clearOfflineUploadProgress();
    }
  }, []);

  const lastSyncedAt = useCallback(
    (projectId: string): string | null => projectSyncedAt[projectId] ?? null,
    [projectSyncedAt],
  );

  return {
    downloadProgress,
    downloadState,
    downloadingProjectId,
    isDownloading,
    pendingCount,
    syncProgress,
    syncDetail,
    isSyncing,
    triggerDownload,
    cancelDownload,
    flush,
    lastSyncedAt,
    offlineProjectIds,
    setProjectOffline,
  };
}
