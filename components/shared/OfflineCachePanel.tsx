"use client";

/**
 * Cache manifest + queued upload list for the connectivity details sheet.
 */

import { useEffect, useState, useCallback, useSyncExternalStore, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Pencil, Trash2, Camera, Loader2 } from "lucide-react";
import { getPendingCount } from "@/lib/offline/mutation-queue";
import { getPendingInspectionCount } from "@/lib/inspections/inspectionOfflineDb";
import { findSnapshotCacheKey, readSnapshotData } from "@/lib/offline/snapshot-cache";
import {
  readProjectCacheManifest,
  type ProjectCacheManifest,
} from "@/lib/offline/snapshot-project-reads";
import { getQueuedUploadItems, discardQueuedUploadItem, type QueuedUploadItem } from "@/lib/offline/queued-upload-items";
import { requestOpenPendingInspection } from "@/lib/offline/pending-inspection-open";
import { requestOpenPendingMutation } from "@/lib/offline/pending-mutation-open";
import { useOfflineSyncContext } from "@/hooks/offline-sync-context";
import { FilterPanelSection } from "@/components/shared/filterPanel";
import { INSPECTIONS_PENDING_COUNT_EVENT } from "@/lib/inspections/useInspectionSync";
import { OFFLINE_SYNC_COMPLETE_EVENT } from "@/lib/offline/events";
import { formatQueuedSyncErrorDisplay } from "@/lib/offline/queued-sync-error-display";
import { requestStatusPhotoRetake } from "@/lib/offline/pending-status-photo-retake";
import {
  getOfflineUploadProgressSnapshot,
  queuedUploadRowStatus,
  subscribeOfflineUploadProgress,
} from "@/lib/offline/offline-upload-progress";
import { UploadQueueProgressHeader } from "@/components/shared/UploadQueueProgressHeader";

interface GlobalCacheManifest {
  projectCount: number;
  unitCount: number;
  issueCount: number;
  observationCount: number;
  inspectionCount: number;
  subcontractorCount: number;
  publishedFormCount: number;
  generatedAt: string | null;
}

async function readGlobalCacheManifest(): Promise<GlobalCacheManifest | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;

  try {
    const snapshotKey = await findSnapshotCacheKey();
    if (!snapshotKey) return null;

    const snapshot = await readSnapshotData(undefined, snapshotKey);
    if (!snapshot?.data) return null;

    const data = snapshot.data;
    return {
      projectCount: Array.isArray(data.projects) ? data.projects.length : 0,
      unitCount: Array.isArray(data.units) ? data.units.length : 0,
      issueCount: Array.isArray(data.issues) ? data.issues.length : 0,
      observationCount: Array.isArray(data.observations) ? data.observations.length : 0,
      inspectionCount: Array.isArray(data["inspection-submissions"])
        ? data["inspection-submissions"].length
        : 0,
      subcontractorCount: Array.isArray(data.subcontractors) ? data.subcontractors.length : 0,
      publishedFormCount: Array.isArray(data["published-forms"]) ? data["published-forms"].length : 0,
      generatedAt: snapshot.generatedAt ?? null,
    };
  } catch {
    return null;
  }
}

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

const statRowStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-caption)",
  color: "var(--color-text-secondary)",
  lineHeight: 1.45,
};

function isUnrecoverableMediaError(error?: string): boolean {
  return Boolean(error?.includes("Deferred inspection media blob missing"));
}

function syncErrorDisplayText(error: string, t: (key: string, values?: Record<string, string | number>) => string): string | null {
  return formatQueuedSyncErrorDisplay(error, t);
}

interface OfflineCachePanelProps {
  prioritizeQueue?: boolean;
  /** When on a project route, show counts scoped to this project. */
  projectId?: string | null;
  /** Close the parent sheet before opening the inspection editor. */
  onBeforeOpenInspection?: () => void;
}

export function OfflineCachePanel({
  prioritizeQueue = false,
  projectId = null,
  onBeforeOpenInspection,
}: OfflineCachePanelProps) {
  const t = useTranslations("offlineCachePanel");
  const locale = useLocale();
  const { lastSyncedAt, isSyncing, syncProgress } = useOfflineSyncContext();
  const uploadProgress = useSyncExternalStore(
    subscribeOfflineUploadProgress,
    getOfflineUploadProgressSnapshot,
    () => getOfflineUploadProgressSnapshot(),
  );
  const [globalManifest, setGlobalManifest] = useState<GlobalCacheManifest | null>(null);
  const [projectManifest, setProjectManifest] = useState<ProjectCacheManifest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingInspectionCount, setPendingInspectionCount] = useState(0);
  const [queuedItems, setQueuedItems] = useState<QueuedUploadItem[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  const reloadQueue = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  const handleDiscardItem = useCallback(async (item: QueuedUploadItem) => {
    const confirmKey =
      item.source === "mutation" && item.mutationType === "link-status-album-photo"
        ? "queuedItemRemoveStatusPhotoConfirm"
        : item.source === "mutation"
          ? "queuedItemRemoveMutationConfirm"
          : "queuedItemRemoveConfirm";
    const confirmed = window.confirm(t(confirmKey));
    if (!confirmed) return;
    setDiscardingId(item.id);
    try {
      await discardQueuedUploadItem(item);
      reloadQueue();
    } finally {
      setDiscardingId(null);
    }
  }, [reloadQueue, t]);

  const handleEditItem = useCallback((item: QueuedUploadItem) => {
    onBeforeOpenInspection?.();
    if (item.source === "inspection") {
      requestOpenPendingInspection(item.id);
      return;
    }
    if (item.mutationType === "link-status-album-photo") {
      requestStatusPhotoRetake(item.id);
      return;
    }
    requestOpenPendingMutation(item.id);
  }, [onBeforeOpenInspection]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [globalM, projectM, count, inspectionCount, items] = await Promise.all([
        readGlobalCacheManifest(),
        projectId ? readProjectCacheManifest(projectId) : Promise.resolve(null),
        getPendingCount().catch(() => 0),
        getPendingInspectionCount().catch(() => 0),
        getQueuedUploadItems().catch(() => [] as QueuedUploadItem[]),
      ]);
      if (!cancelled) {
        setGlobalManifest(globalM);
        setProjectManifest(projectM);
        setPendingCount(count);
        setPendingInspectionCount(inspectionCount);
        setQueuedItems(items);
        setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [reloadToken, projectId]);

  useEffect(() => {
    function bumpReload() {
      setReloadToken((n) => n + 1);
    }
    window.addEventListener(INSPECTIONS_PENDING_COUNT_EVENT, bumpReload);
    window.addEventListener("inspections:updated", bumpReload);
    window.addEventListener(OFFLINE_SYNC_COMPLETE_EVENT, bumpReload);
    return () => {
      window.removeEventListener(INSPECTIONS_PENDING_COUNT_EVENT, bumpReload);
      window.removeEventListener("inspections:updated", bumpReload);
      window.removeEventListener(OFFLINE_SYNC_COMPLETE_EVENT, bumpReload);
    };
  }, []);

  useEffect(() => {
    if (uploadProgress.active) {
      setReloadToken((n) => n + 1);
    }
  }, [uploadProgress.active, uploadProgress.done, uploadProgress.currentItemId]);

  const currentUploadItem = useMemo(
    () =>
      uploadProgress.currentItemId
        ? queuedItems.find((item) => item.id === uploadProgress.currentItemId) ?? null
        : null,
    [queuedItems, uploadProgress.currentItemId],
  );

  const currentUploadLabel = currentUploadItem
    ? t(currentUploadItem.labelKey as Parameters<typeof t>[0], currentUploadItem.labelValues)
    : null;

  const syncProgressTitle = uploadProgress.active
    ? t("syncProgressTitle", {
        done: Math.min(uploadProgress.done + 1, uploadProgress.total),
        total: uploadProgress.total,
      })
    : null;

  const projectSyncedAt = projectId ? lastSyncedAt(projectId) : null;
  const hasProjectCache = projectManifest !== null;
  const hasGlobalCache = globalManifest !== null;
  const isEmpty = projectId ? !hasProjectCache && !hasGlobalCache : !hasGlobalCache;
  const totalQueued = pendingCount + pendingInspectionCount;
  const showQueuedSummary = totalQueued > 0 && queuedItems.length === 0;

  const cacheSectionLabel = projectId ? t("projectCacheTitle") : t("title");

  const queueSection = queuedItems.length > 0 ? (
    <FilterPanelSection label={t("queuedItemsTitle", { count: queuedItems.length })}>
      {uploadProgress.active && syncProgressTitle ? (
        <UploadQueueProgressHeader
          progress={uploadProgress}
          percent={isSyncing ? syncProgress : null}
          title={syncProgressTitle}
          currentLabel={currentUploadLabel}
          mediaPhaseLabel={t("syncProgressMediaPhase")}
        />
      ) : prioritizeQueue ? (
        <p style={{ ...statRowStyle, marginBottom: 8, color: "var(--color-text-tertiary)" }}>
          {t("queuedItemSyncHint")}
        </p>
      ) : null}
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {queuedItems.map((item) => {
          const errorText = item.lastSyncError
            ? syncErrorDisplayText(item.lastSyncError, t)
            : null;
          const mediaLost = isUnrecoverableMediaError(item.lastSyncError);
          const isStatusPhotoMutation = item.mutationType === "link-status-album-photo";
          const rowStatus = queuedUploadRowStatus(item.id, uploadProgress);
          const isUploadingRow = rowStatus === "uploading";
          const isPendingRow = rowStatus === "pending";
          return (
            <li
              key={item.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: isUploadingRow
                  ? "var(--primary-50, var(--control-bg))"
                  : "var(--control-bg)",
                border: isUploadingRow
                  ? "1px solid var(--primary-400, var(--primary-600))"
                  : "1px solid var(--color-divider)",
                opacity: isPendingRow ? 0.88 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span
                    style={{
                      color: "var(--color-text-primary)",
                      fontSize: "var(--text-caption)",
                      fontWeight: "var(--font-weight-extrabold)",
                      lineHeight: 1.35,
                    }}
                  >
                    {t(item.labelKey as Parameters<typeof t>[0], item.labelValues)}
                  </span>
                  {isUploadingRow ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "var(--text-micro)",
                        fontWeight: "var(--font-weight-extrabold)",
                        color: "var(--primary-600)",
                      }}
                    >
                      <Loader2 size={11} className="animate-spin" aria-hidden />
                      {uploadProgress.phase === "media"
                        ? t("queuedItemStatusUploadingMedia")
                        : t("queuedItemStatusUploading")}
                    </span>
                  ) : isPendingRow ? (
                    <span
                      style={{
                        fontSize: "var(--text-micro)",
                        fontWeight: "var(--font-weight-medium)",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {t("queuedItemStatusPending")}
                    </span>
                  ) : null}
                </div>
                {item.detailKey && item.detailValues ? (
                  <span
                    style={{
                      color: "var(--color-text-secondary)",
                      fontSize: "var(--text-micro)",
                      lineHeight: 1.4,
                    }}
                  >
                    {t(item.detailKey as Parameters<typeof t>[0], {
                      level: t(item.detailValues.level as Parameters<typeof t>[0]),
                      category: t(item.detailValues.category as Parameters<typeof t>[0]),
                      outcome: t(item.detailValues.outcome as Parameters<typeof t>[0]),
                      ...(item.detailValues.location
                        ? { location: String(item.detailValues.location) }
                        : {}),
                    })}
                  </span>
                ) : null}
                <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-micro)" }}>
                  {t("queuedItemTime", { time: formatRelativeTime(new Date(item.queuedAt).toISOString(), locale) })}
                </span>
                {mediaLost ? (
                  <span style={{ color: "var(--error-600)", fontSize: "var(--text-micro)", lineHeight: 1.4 }}>
                    {t("queuedItemMediaLostHint")}
                  </span>
                ) : errorText ? (
                  <span style={{ color: "var(--error-600)", fontSize: "var(--text-micro)", lineHeight: 1.4 }}>
                    {errorText}
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", flexShrink: 0, gap: 2 }}>
                <button
                  type="button"
                  onClick={() => handleEditItem(item)}
                  aria-label={
                    isStatusPhotoMutation
                      ? t("queuedItemRetakeAria")
                      : item.source === "inspection"
                        ? t("queuedItemOpenAria")
                        : t("queuedItemEditAria")
                  }
                  title={
                    isStatusPhotoMutation
                      ? t("queuedItemRetake")
                      : item.source === "inspection"
                        ? t("queuedItemOpen")
                        : t("queuedItemEdit")
                  }
                  style={{
                    width: 32,
                    height: 32,
                    padding: 0,
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    background: "transparent",
                    color: "var(--primary-600)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isStatusPhotoMutation ? (
                    <Camera size={15} aria-hidden />
                  ) : (
                    <Pencil size={15} aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDiscardItem(item)}
                  disabled={discardingId === item.id}
                  aria-label={t("queuedItemRemoveAria")}
                  title={t("queuedItemRemove")}
                  style={{
                    width: 32,
                    height: 32,
                    padding: 0,
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    background: "transparent",
                    color: "var(--error-600)",
                    cursor: discardingId === item.id ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: discardingId === item.id ? 0.5 : 1,
                  }}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {totalQueued > queuedItems.length ? (
        <p style={{ margin: "8px 0 0", fontSize: "var(--text-micro)", color: "var(--color-text-tertiary)" }}>
          {t("queuedItemsPartial", { shown: queuedItems.length, total: totalQueued })}
        </p>
      ) : null}
    </FilterPanelSection>
  ) : null;

  const cacheBody = (
    <>
      {isLoading ? <p style={statRowStyle}>…</p> : null}
      {!isLoading && isEmpty ? (
        <p style={statRowStyle}>
          {projectId ? t("projectNoCacheYet") : t("noCacheYet")}
        </p>
      ) : null}
      {!isLoading && projectId && hasProjectCache && projectManifest ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={statRowStyle}>{t("units", { count: projectManifest.unitCount })}</p>
            <p style={statRowStyle}>{t("issues", { count: projectManifest.issueCount })}</p>
            <p style={statRowStyle}>{t("observations", { count: projectManifest.observationCount })}</p>
            <p style={statRowStyle}>{t("inspections", { count: projectManifest.inspectionCount })}</p>
          </div>
          {projectSyncedAt ? (
            <p style={{ ...statRowStyle, marginTop: 8, color: "var(--color-text-tertiary)" }}>
              {t("lastSynced", { time: formatRelativeTime(projectSyncedAt, locale) })}
            </p>
          ) : projectManifest.generatedAt ? (
            <p style={{ ...statRowStyle, marginTop: 8, color: "var(--color-text-tertiary)" }}>
              {t("lastSynced", { time: formatRelativeTime(projectManifest.generatedAt, locale) })}
            </p>
          ) : null}
        </>
      ) : null}
      {!isLoading && !projectId && hasGlobalCache && globalManifest ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={statRowStyle}>{t("projects", { count: globalManifest.projectCount })}</p>
            <p style={statRowStyle}>{t("units", { count: globalManifest.unitCount })}</p>
            <p style={statRowStyle}>{t("issues", { count: globalManifest.issueCount })}</p>
            <p style={statRowStyle}>{t("observations", { count: globalManifest.observationCount })}</p>
            <p style={statRowStyle}>{t("inspections", { count: globalManifest.inspectionCount })}</p>
            <p style={statRowStyle}>{t("subcontractors", { count: globalManifest.subcontractorCount })}</p>
            <p style={statRowStyle}>{t("publishedForms", { count: globalManifest.publishedFormCount })}</p>
          </div>
          {globalManifest.generatedAt ? (
            <p style={{ ...statRowStyle, marginTop: 8, color: "var(--color-text-tertiary)" }}>
              {t("lastSynced", { time: formatRelativeTime(globalManifest.generatedAt, locale) })}
            </p>
          ) : null}
        </>
      ) : null}
      {!isLoading && projectId && !hasProjectCache && hasGlobalCache ? (
        <p style={{ ...statRowStyle, marginTop: 8, color: "var(--color-text-tertiary)" }}>
          {t("projectNoCacheYet")}
        </p>
      ) : null}
    </>
  );

  const cacheSection = <FilterPanelSection label={cacheSectionLabel}>{cacheBody}</FilterPanelSection>;

  return (
    <>
      {prioritizeQueue && queueSection}
      {cacheSection}
      {!prioritizeQueue ? queueSection : null}

      {showQueuedSummary ? (
        <FilterPanelSection label={t("queuedItemsTitle", { count: totalQueued })}>
          {pendingCount > 0 ? (
            <p style={{ ...statRowStyle, color: "var(--warning-600)" }}>
              {t("queued", { count: pendingCount })}
            </p>
          ) : null}
          {pendingInspectionCount > 0 ? (
            <p style={{ ...statRowStyle, color: "var(--warning-600)" }}>
              {t("queuedInspections", { count: pendingInspectionCount })}
            </p>
          ) : null}
        </FilterPanelSection>
      ) : null}
    </>
  );
}
