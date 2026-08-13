"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";
import { MediaSharedFilterSections } from "@/components/projects/MediaSharedFilterSections";
import type { MediaActiveFilters, MediaLocationFilterOptions } from "@/lib/media/media-filters";

export type MediaBulkLoadPhase = "confirm" | "loading" | "done";

interface MediaBulkLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: MediaBulkLoadPhase;
  completed: number;
  total: number;
  search: string;
  onSearchChange: (value: string) => void;
  hideWithoutMedia: boolean;
  onHideWithoutMediaChange: (value: boolean) => void;
  filters: MediaActiveFilters;
  onFiltersChange: (filters: MediaActiveFilters) => void;
  locationFilterOptions: MediaLocationFilterOptions;
  standaloneMediaCount: number;
  onStartLoad: () => void;
  onCollapseAll: () => void;
}

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function MediaBulkLoadDialog({
  open,
  onOpenChange,
  phase,
  completed,
  total,
  search,
  onSearchChange,
  hideWithoutMedia,
  onHideWithoutMediaChange,
  filters,
  onFiltersChange,
  locationFilterOptions,
  standaloneMediaCount,
  onStartLoad,
  onCollapseAll,
}: MediaBulkLoadDialogProps) {
  const t = useTranslations("units.mediaView");
  const isMobile = useIsMobileViewport();
  const showMobileWarning = isMobile && total >= 20;
  const safeTotal = Math.max(total, 1);
  const pct = Math.min(100, Math.round((completed / safeTotal) * 100));
  const isLoading = phase === "loading";
  const isDone = phase === "done";
  const showStandaloneHint =
    standaloneMediaCount > 0
    && filters.buildings.length === 0
    && filters.levels.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={phase !== "loading"}
        style={{ maxHeight: "min(90vh, 640px)", overflowY: "auto" }}
      >
        <DialogHeader>
          <DialogTitle>
            {isDone
              ? t("bulkLoadDialogTitleDone")
              : isLoading
                ? t("bulkLoadDialogTitleLoading")
                : t("bulkLoadDialogTitleConfirm")}
          </DialogTitle>
          <DialogDescription>
            {isDone
              ? t("bulkLoadDialogDescDone", { count: total })
              : isLoading
                ? t("bulkLoadDialogDescLoading")
                : t("bulkLoadDialogDescConfirm")}
          </DialogDescription>
        </DialogHeader>

        {!isDone ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {phase === "confirm" ? (
              <>
                <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-600)", lineHeight: 1.45 }}>
                  {t("bulkLoadFilterHint")}
                </p>

                <SearchInput
                  value={search}
                  onChange={onSearchChange}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchAria")}
                />

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: "var(--neutral-800)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={hideWithoutMedia}
                    onChange={(event) => onHideWithoutMediaChange(event.target.checked)}
                  />
                  {isMobile ? t("hideWithoutMediaLabelShort") : t("hideWithoutMediaLabel")}
                </label>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: "10px 0 0",
                    borderTop: "1px solid var(--neutral-200)",
                  }}
                >
                  <MediaSharedFilterSections
                    filters={filters}
                    onChange={onFiltersChange}
                    options={locationFilterOptions}
                    showLocationKinds={false}
                    collapsibleSections
                    sectionsDefaultExpanded={false}
                  />
                </div>

                {showStandaloneHint ? (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-500)" }}>
                    {t("bulkLoadStandaloneIncluded", { count: standaloneMediaCount })}
                  </p>
                ) : null}

                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--primary-800)",
                  }}
                >
                  {t("bulkLoadLocationCount", { count: total })}
                </p>

                {showMobileWarning ? (
                  <p
                    role="note"
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "var(--warning-600)",
                      lineHeight: 1.45,
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--warning-100)",
                    }}
                  >
                    {t("bulkLoadMobileWarning", { count: total })}
                  </p>
                ) : null}
              </>
            ) : null}

            {isLoading ? (
              <div role="status" aria-live="polite" aria-busy={completed < total}>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--primary-800)",
                  }}
                >
                  {t("bulkAlbumLoadProgress", { completed, total })}
                </p>
                <div
                  aria-hidden
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "var(--primary-100)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: "var(--primary-600)",
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--neutral-500)" }}>
                  {t("bulkLoadBackgroundHint")}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "var(--neutral-600)" }}>
            {t("bulkLoadDialogDescDone", { count: total })}
          </p>
        )}

        <DialogFooter style={{ gap: 8, flexWrap: "wrap" }}>
          {phase === "confirm" ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("bulkLoadCancel")}
              </Button>
              <Button
                type="button"
                onClick={onStartLoad}
                disabled={total === 0}
              >
                {t("bulkLoadStart", { count: total })}
              </Button>
            </>
          ) : null}
          {isLoading ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("bulkLoadRunInBackground")}
              </Button>
              <Button type="button" variant="outline" onClick={onCollapseAll}>
                {t("bulkLoadStop")}
              </Button>
            </>
          ) : null}
          {isDone ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t("bulkLoadClose")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
