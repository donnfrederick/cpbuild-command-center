"use client";

import { useCallback, useRef, useState } from "react";
import { FileDown, Filter, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SearchInput } from "@/components/shared/SearchInput";
import { MediaLocationsView } from "@/components/projects/MediaLocationsView";
import {
  MediaPdfExportOverlay,
  type MediaPdfExportStep,
} from "@/components/projects/MediaPdfExportOverlay";
import {
  activeMediaFilterCount,
  EMPTY_MEDIA_FILTERS,
  type MediaActiveFilters,
} from "@/lib/media/media-filters";
import type { MediaExportSnapshot } from "@/lib/media/media-export-types";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isMobilePdfDelivery,
  supportsPdfFileShare,
} from "@/lib/deliver-pdf-blob";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import { MEDIA_ALBUM_PDF_MAX_LOCATIONS } from "@/lib/pdf/media-album-export-limits";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { consumeMediaAlbumExportStream } from "@/lib/media/consume-media-album-export-stream";
import type { MediaAlbumExportProgressSnapshot } from "@/lib/media/media-album-export-progress";

interface MediaPageClientProps {
  projectId: string;
  canManageStatus?: boolean;
  canCalibrate?: boolean;
  currentUserId?: string;
  currentUserRole?: string;
}

function initialExportProgress(locationCount: number): MediaAlbumExportProgressSnapshot {
  return {
    phase: "gathering",
    locationsCompleted: 0,
    locationsTotal: locationCount,
    itemsCollected: 0,
    itemsTotal: null,
    currentLocationLabel: null,
    percent: 0,
  };
}

export function MediaPageClient({
  projectId,
  canManageStatus = false,
  canCalibrate = false,
  currentUserId,
  currentUserRole,
}: MediaPageClientProps) {
  const t = useTranslations("units.mediaView");
  const tOffline = useTranslations("offline");
  const { isOnline } = useOfflineStatus();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<MediaActiveFilters>(EMPTY_MEDIA_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [exportSnapshot, setExportSnapshot] = useState<MediaExportSnapshot>({
    ready: false,
    locationCount: 0,
    request: null,
  });
  const [exportStep, setExportStep] = useState<MediaPdfExportStep | null>(null);
  const [exportProgress, setExportProgress] = useState<MediaAlbumExportProgressSnapshot>(
    initialExportProgress(0),
  );
  const [pendingPdf, setPendingPdf] = useState<{ blob: Blob; fileName: string } | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const filterCount = activeMediaFilterCount(filters);
  const exportingPdf = exportStep !== null;

  const handleCancelExportPdf = useCallback(() => {
    exportAbortRef.current?.abort();
    exportAbortRef.current = null;
    setExportStep(null);
    setPendingPdf(null);
    setExportProgress(initialExportProgress(0));
  }, []);

  const handleExportPdf = useCallback(async () => {
    if (exportingPdf) return;
    if (!isOnline) {
      toast.error(tOffline("offlineActionUnavailable"));
      return;
    }
    if (!exportSnapshot.ready) return;

    if (exportSnapshot.overLocationLimit) {
      toast.error(
        t("exportPdfTooManyLocations", {
          count: exportSnapshot.locationCount,
          max: MEDIA_ALBUM_PDF_MAX_LOCATIONS,
        }),
      );
      return;
    }

    if (!exportSnapshot.request || exportSnapshot.locationCount === 0) {
      toast.error(t("exportPdfNoLocations"));
      return;
    }

    setExportStep("gathering");
    setExportProgress(initialExportProgress(exportSnapshot.locationCount));
    setPendingPdf(null);

    const controller = new AbortController();
    exportAbortRef.current = controller;

    try {
      const res = await fetch(`/api/projects/${projectId}/album/export-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
          "X-Media-Export-Stream": "1",
        },
        body: JSON.stringify(exportSnapshot.request),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(formatPdfExportErrorToast(errBody, t("exportPdfFailed")));
        setExportStep(null);
        return;
      }

      const { blob, fileName } = await consumeMediaAlbumExportStream(res, {
        signal: controller.signal,
        onProgress: (snapshot) => {
          setExportProgress(snapshot);
          setExportStep(snapshot.phase === "rendering" ? "rendering" : "gathering");
        },
      });

      if (controller.signal.aborted) return;

      if (!blob.size) {
        toast.error(t("exportPdfFailed"));
        setExportStep(null);
        return;
      }

      setExportStep("done");
      setExportProgress((prev) => ({ ...prev, percent: 100 }));

      if (isMobilePdfDelivery()) {
        setPendingPdf({ blob, fileName });
        return;
      }

      await deliverPdfBlob(blob, fileName);
      toast.success(t("exportPdfSuccess"));
      setTimeout(() => {
        setExportStep(null);
        setExportProgress(initialExportProgress(0));
      }, 1200);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(formatPdfExportErrorToast(err, t("exportPdfFailed")));
      }
      setExportStep(null);
      setPendingPdf(null);
      setExportProgress(initialExportProgress(0));
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
      }
    }
  }, [exportingPdf, isOnline, exportSnapshot, projectId, t, tOffline]);

  const handleSavePendingPdf = useCallback(async () => {
    if (!pendingPdf) return;
    try {
      await deliverPdfBlobOnUserGesture(pendingPdf.blob, pendingPdf.fileName);
      toast.success(t("exportPdfSuccess"));
      setPendingPdf(null);
      setExportStep(null);
      setExportProgress(initialExportProgress(0));
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(t("exportPdfSaveFailed"));
      }
    }
  }, [pendingPdf, t]);

  const exportDisabled =
    exportingPdf
    || !exportSnapshot.ready
    || exportSnapshot.locationCount === 0
    || exportSnapshot.overLocationLimit
    || !isOnline;

  const exportTooltip = exportSnapshot.overLocationLimit
    ? t("exportPdfTooManyLocationsTooltip", {
        count: exportSnapshot.locationCount,
        max: MEDIA_ALBUM_PDF_MAX_LOCATIONS,
      })
    : t("exportPdfTooltip");

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: "8px var(--page-padding-x, 12px)",
          borderBottom: "1px solid var(--neutral-200)",
          backgroundColor: "var(--neutral-0)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchAria")}
            />
          </div>
          <button
            type="button"
            aria-label={t("exportPdfAria")}
            title={exportTooltip}
            disabled={exportDisabled}
            onClick={() => void handleExportPdf()}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--neutral-200)",
              background: exportDisabled ? "var(--neutral-50)" : "var(--neutral-0)",
              color: exportDisabled ? "var(--neutral-400)" : "var(--neutral-600)",
              cursor: exportDisabled ? "not-allowed" : "pointer",
            }}
          >
            {exportingPdf ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <FileDown size={16} aria-hidden />
            )}
          </button>
          <button
            type="button"
            aria-label={t("filtersTooltip")}
            aria-pressed={filterCount > 0}
            title={t("filtersTooltip")}
            onClick={() => setShowFilters(true)}
            style={{
              position: "relative",
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: "var(--radius-md)",
              border: filterCount > 0 ? "1px solid var(--primary-300)" : "1px solid var(--neutral-200)",
              background: filterCount > 0 ? "var(--primary-50)" : "var(--neutral-0)",
              color: filterCount > 0 ? "var(--primary-700)" : "var(--neutral-600)",
              cursor: "pointer",
            }}
          >
            <Filter size={16} aria-hidden />
            {filterCount > 0 && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: "var(--primary-600)",
                  color: "var(--color-text-inverse)",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: "16px",
                  textAlign: "center",
                }}
              >
                {filterCount}
              </span>
            )}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <MediaLocationsView
          projectId={projectId}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={setFilters}
          showFilters={showFilters}
          onShowFiltersChange={setShowFilters}
          canManageStatus={canManageStatus}
          canCalibrate={canCalibrate}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onExportSnapshotChange={setExportSnapshot}
        />
      </div>

      {exportStep ? (
        <MediaPdfExportOverlay
          step={exportStep}
          progress={exportProgress}
          showSaveButton={Boolean(pendingPdf)}
          onSavePdf={pendingPdf ? () => void handleSavePendingPdf() : undefined}
          savePdfLabel={
            pendingPdf
              ? supportsPdfFileShare()
                ? t("exportPdfShareButton")
                : t("exportPdfSaveButton")
              : undefined
          }
          savePdfHint={
            pendingPdf
              ? supportsPdfFileShare()
                ? t("exportPdfShareHint")
                : t("exportPdfSaveHint")
              : undefined
          }
          onCancel={exportStep !== "done" ? handleCancelExportPdf : undefined}
        />
      ) : null}
    </div>
  );
}
