"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import type { AlbumItem, AlbumSourceType } from "@/lib/media/album-types";
import type { MediaSourceFilterKey } from "@/lib/media/media-filters";
import { filterAlbumItemsByMediaFilters } from "@/lib/media/media-filters";
import { scopeLabelsForUnitCard } from "@/lib/media/media-location-list";
import type { UnitCard } from "@/components/projects/UnitCards";
import { unitTypeColor } from "@/components/projects/UnitCards";
import { UnitAlbumHorizontalStrip } from "@/components/projects/UnitAlbumStrip";
import { UnitAlbumStripSkeleton } from "@/components/projects/UnitAlbumStripSkeleton";
import {
  readUnitAlbumClientCache,
  UNIT_ALBUM_UPDATED_EVENT,
  writeUnitAlbumClientCache,
} from "@/lib/media/unit-album-client-cache";
import { markUnitAlbumTouched } from "@/lib/offline/album-warm-session";

interface UnitMediaViewRowProps {
  projectId: string;
  unitRef: string;
  unitLabel: string;
  unitType?: string;
  card: UnitCard;
  /** When set, expansion is controlled by the parent (e.g. building expand-all). */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onOpenDetail?: () => void;
  /** Nested custom site rows (under a building/level) — shows badge + accent stripe. */
  isCustomLocation?: boolean;
  /** Called when an album fetch finishes (success, error, or empty). Used for bulk expand progress. */
  onAlbumFetchSettled?: (unitRef: string) => void;
  /** When set, only album items matching these filter groups are shown. */
  mediaSourceTypes?: MediaSourceFilterKey[];
  albumSourceTags?: AlbumSourceType[];
}

export function UnitMediaViewRow({
  projectId,
  unitRef,
  unitLabel,
  unitType,
  card,
  expanded: expandedProp,
  onExpandedChange,
  onOpenDetail,
  isCustomLocation = false,
  onAlbumFetchSettled,
  mediaSourceTypes = [],
  albumSourceTags = [],
}: UnitMediaViewRowProps) {
  const t = useTranslations("units.mediaView");
  const { isOnline } = useOfflineStatus();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = expandedProp !== undefined;
  const expanded = isControlled ? expandedProp : internalExpanded;
  const [items, setItems] = useState<AlbumItem[] | null>(() => {
    const cached = readUnitAlbumClientCache(projectId, unitRef);
    return cached && cached.length > 0 ? cached : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  /** False until the first album fetch for this expand session completes. */
  const [albumFetchSettled, setAlbumFetchSettled] = useState(false);
  const scopeLabels = useMemo(() => scopeLabelsForUnitCard(card), [card]);
  const typeColors = unitType ? unitTypeColor(unitType) : null;

  const setExpanded = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const value = typeof next === "function" ? next(expanded) : next;
      if (isControlled) onExpandedChange?.(value);
      else setInternalExpanded(value);
    },
    [expanded, isControlled, onExpandedChange],
  );

  const loadAlbum = useCallback(async (signal?: AbortSignal) => {
    markUnitAlbumTouched(projectId, unitRef);
    const cached = readUnitAlbumClientCache(projectId, unitRef);
    if (cached && cached.length > 0) {
      setItems(cached);
    }
    setLoading(true);
    setError(false);
    let aborted = false;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/album?unitRef=${encodeURIComponent(unitRef)}`,
        { cache: isOnline ? "no-store" : "default", signal },
      );
      if (!res.ok) {
        setItems([]);
        setError(true);
        return;
      }
      const data = (await res.json()) as { items: AlbumItem[] };
      writeUnitAlbumClientCache(projectId, unitRef, data.items);
      setItems(data.items);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        aborted = true;
        return;
      }
      setItems([]);
      setError(true);
    } finally {
      setLoading(false);
      if (!aborted) {
        setAlbumFetchSettled(true);
        onAlbumFetchSettled?.(unitRef);
      }
    }
  }, [projectId, unitRef, isOnline, onAlbumFetchSettled]);

  useEffect(() => {
    if (!expanded) {
      setAlbumFetchSettled(false);
      return;
    }
    const ctrl = new AbortController();
    void loadAlbum(ctrl.signal);
    return () => ctrl.abort();
  }, [expanded, loadAlbum]);

  useEffect(() => {
    function refreshAlbum() {
      if (!expanded) return;
      void loadAlbum();
    }
    function handleAlbumUpdated(event: Event) {
      const detail = (event as CustomEvent<{ projectId: string; unitRef: string }>).detail;
      if (detail?.projectId !== projectId || detail?.unitRef !== unitRef) return;
      refreshAlbum();
    }
    window.addEventListener("inspections:updated", refreshAlbum);
    window.addEventListener(UNIT_ALBUM_UPDATED_EVENT, handleAlbumUpdated);
    return () => {
      window.removeEventListener("inspections:updated", refreshAlbum);
      window.removeEventListener(UNIT_ALBUM_UPDATED_EVENT, handleAlbumUpdated);
    };
  }, [expanded, loadAlbum, projectId, unitRef]);

  const displayItems = useMemo(
    () =>
      items
        ? filterAlbumItemsByMediaFilters(items, {
            mediaSourceTypes,
            albumSourceTags,
          })
        : items,
    [items, mediaSourceTypes, albumSourceTags],
  );

  const hasDisplayableItems = (displayItems?.length ?? 0) > 0;
  const showAlbumSkeleton =
    !error && !hasDisplayableItems && (loading || !albumFetchSettled);

  return (
    <div
      style={{
        borderBottom: "1px solid var(--neutral-100)",
        borderLeft: isCustomLocation ? "3px solid var(--primary-600)" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: isCustomLocation ? "10px 12px 10px 9px" : "10px 12px",
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`unit-media-${unitRef.replace(/\|/g, "-")}`}
          style={{
            display: "flex",
            alignItems: "center",
            flex: 1,
            minWidth: 0,
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "inherit",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--neutral-900)",
              lineHeight: 1.2,
            }}
          >
            {unitLabel}
          </div>
          {(isCustomLocation || unitType || scopeLabels.length > 0) ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 3,
                flexWrap: "wrap",
                minWidth: 0,
              }}
            >
              {isCustomLocation ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 3,
                    lineHeight: 1.3,
                    backgroundColor: "var(--primary-50)",
                    color: "var(--primary-700)",
                    flexShrink: 0,
                    letterSpacing: "0.02em",
                  }}
                >
                  {t("customLocationBadge")}
                </span>
              ) : null}
              {unitType && typeColors ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 3,
                    lineHeight: 1.3,
                    backgroundColor: typeColors.bg,
                    color: typeColors.text,
                    flexShrink: 0,
                  }}
                >
                  {unitType}
                </span>
              ) : null}
              {scopeLabels.length > 0 ? (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--neutral-500)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {scopeLabels.join(" · ")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexShrink: 0,
          }}
        >
          {onOpenDetail ? (
            <button
              type="button"
              onClick={onOpenDetail}
              aria-label={t("openUnitDetailAria", { unit: unitLabel })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                minHeight: 32,
                padding: "4px 6px",
                border: "none",
                borderRadius: 6,
                background: "transparent",
                color: "var(--primary-600)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              <Eye size={14} aria-hidden />
              {t("openUnitDetailLabel")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={`unit-media-${unitRef.replace(/\|/g, "-")}`}
            aria-label={
              expanded
                ? t("collapsePhotosAria", { unit: unitLabel })
                : t("expandPhotosAria", { unit: unitLabel })
            }
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              padding: 0,
              border: "none",
              borderRadius: 6,
              background: "transparent",
              color: "var(--neutral-400)",
              cursor: "pointer",
            }}
          >
            {expanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div
          id={`unit-media-${unitRef.replace(/\|/g, "-")}`}
          style={{ background: expanded ? "var(--neutral-50)" : undefined, position: "relative" }}
        >
          {showAlbumSkeleton ? (
            <UnitAlbumStripSkeleton label={t("loadingPhotosForUnit", { unit: unitLabel })} />
          ) : error ? (
            <p style={{ fontSize: 11, color: "var(--error-600)", padding: "0 12px 10px", margin: 0 }} role="alert">
              {t("loadError")}
            </p>
          ) : (
            <>
              {loading && displayItems && displayItems.length > 0 ? (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 12,
                    right: 12,
                    height: 3,
                    borderRadius: 999,
                    background: "var(--primary-100)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="animate-pulse"
                    style={{
                      width: "40%",
                      height: "100%",
                      borderRadius: 999,
                      background: "var(--primary-500)",
                    }}
                  />
                </div>
              ) : null}
              <UnitAlbumHorizontalStrip items={displayItems ?? []} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
