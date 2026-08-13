"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useId } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Eye, Filter, X, ChevronDown, ChevronRight, ArrowDownUp, MessageSquare, FileDown, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { FieldLogListSkeleton } from "@/components/projects/FieldLogListSkeleton";
import { FieldLogExportSelectionBar } from "@/components/projects/FieldLogExportSelectionBar";
import type { ObsSummary } from "@/components/projects/UnitCards";
import { ObservationDetailModal } from "@/components/projects/ObservationDetailModal";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isMobilePdfDelivery,
} from "@/lib/deliver-pdf-blob";
import { chunkObservationIds } from "@/lib/pdf/observations-export-batch";
import {
  buildFieldLogLocationFilterOptions,
  fieldLogLocationFilterSummary,
  matchesFieldLogLocationFilter,
} from "@/lib/field-log-location-filter";
import {
  BuildingLevelFilterSection,
  type BuildingLevelFilterOptions,
} from "@/components/shared/BuildingLevelFilterSection";
import {
  FilterChip,
  FilterPanelFooterActions,
  FilterPanelShell,
} from "@/components/shared/filterPanel";
import { useObservationCatalog } from "@/lib/observations/use-observation-catalog";
import { resolveObservationTypeBadgeMeta } from "@/lib/observations/observationDisplay";
import { normalizeSnapshotObservation, type SnapshotObservationRow } from "@/lib/offline/normalize-snapshot-observation";
import { readSnapshotObservationsForProject } from "@/lib/offline/snapshot-project-reads";
import { useRegisterOfflineCacheView } from "@/hooks/use-register-offline-cache-view";
import { useOfflineStatus } from "@/hooks/use-offline-status";

// ── Types ─────────────────────────────────────────────────────────────────────

type DatePreset = "all" | "7d" | "30d" | "custom";

interface DateRange {
  preset: DatePreset;
  customFrom: string;
  customTo: string;
}

interface Filters {
  obsTypes: string[];
  buildings: string[];
  levels: string[];
  authors: string[];   // author user IDs
  dateRange: DateRange;
}

const EMPTY_FILTERS: Filters = {
  obsTypes: [],
  buildings: [],
  levels: [],
  authors: [],
  dateRange: { preset: "all", customFrom: "", customTo: "" },
};

const DATE_PRESET_KEYS: DatePreset[] = ["all", "7d", "30d", "custom"];

// ── Scope buckets ─────────────────────────────────────────────────────────────

type ScopeLevel = "project" | "building" | "level" | "unit";

interface ScopeParsed {
  level: ScopeLevel;
  building: string;
  floor: string;
  unit: string;
  /** Human-readable label for display */
  label: string;
}

function parseScope(unitRef: string | null | undefined): ScopeParsed {
  if (!unitRef || unitRef === "||") {
    return { level: "project", building: "", floor: "", unit: "", label: "Project" };
  }
  const parts = unitRef.split("|");
  const building = parts[0] ?? "";
  const floor    = parts[1] ?? "";
  const unit     = parts[2] ?? "";

  if (!building) {
    return { level: "project", building: "", floor: "", unit: "", label: "Project" };
  }
  if (!floor) {
    return { level: "building", building, floor: "", unit: "", label: building };
  }
  if (!unit) {
    return { level: "level", building, floor, unit: "", label: `${building} › Level ${floor}` };
  }
  return { level: "unit", building, floor, unit, label: `${building} › Level ${floor} › ${unit}` };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)     return "just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function activeFilterCount(f: Filters): number {
  return (
    f.obsTypes.length +
    f.buildings.length +
    f.levels.length +
    f.authors.length +
    (f.dateRange.preset !== "all" ? 1 : 0)
  );
}

function applyFilters(obs: ObsSummary[], f: Filters): ObsSummary[] {
  const now = Date.now();
  const MS_7D  = 7  * 24 * 60 * 60 * 1000;
  const MS_30D = 30 * 24 * 60 * 60 * 1000;

  return obs.filter((o) => {
    if (f.obsTypes.length > 0 && !f.obsTypes.includes(o.observationType)) return false;

    if (f.buildings.length > 0 || f.levels.length > 0) {
      if (!matchesFieldLogLocationFilter(o.unitRef, f.buildings, f.levels)) return false;
    }

    if (f.authors.length > 0 && !f.authors.includes(o.author.id)) return false;

    const { preset, customFrom, customTo } = f.dateRange;
    if (preset !== "all") {
      const ts = new Date(o.createdAt).getTime();
      if (preset === "7d"  && ts < now - MS_7D)  return false;
      if (preset === "30d" && ts < now - MS_30D) return false;
      if (preset === "custom") {
        if (customFrom && ts < new Date(customFrom).getTime()) return false;
        if (customTo && ts > new Date(customTo).getTime() + 24 * 60 * 60 * 1000 - 1) return false;
      }
    }

    return true;
  });
}

// ── Export progress overlay ───────────────────────────────────────────────────

type ObsExportStep = "gathering" | "photos" | "rendering" | "finalizing" | "done";

const OBS_EXPORT_STEP_ORDER: ObsExportStep[] = ["gathering", "photos", "rendering", "finalizing", "done"];

const OBS_EXPORT_STEPS: Array<{ id: ObsExportStep; label: string; detail: string }> = [
  { id: "gathering",  label: "Gathering observations", detail: "Fetching all matching observations from the database…" },
  { id: "photos",     label: "Loading photos",         detail: "Downloading attached images. This is usually the slowest step." },
  { id: "rendering",  label: "Rendering pages",        detail: "Laying out observations, photos, and comments into print-ready pages…" },
  { id: "finalizing", label: "Finalizing PDF",         detail: "Compressing and packaging the document for download…" },
  { id: "done",       label: "Done!",                  detail: "Your PDF is ready." },
];

/** Never move the progress indicator backwards during a single export run. */
function advanceObsExportStep(
  setStep: Dispatch<SetStateAction<ObsExportStep | null>>,
  next: ObsExportStep,
) {
  setStep((prev) => {
    if (prev === null || prev === "done") return next;
    return OBS_EXPORT_STEP_ORDER.indexOf(next) > OBS_EXPORT_STEP_ORDER.indexOf(prev) ? next : prev;
  });
}

function ObsExportProgressOverlay({
  step,
  batchPartLabel,
  exportingCountLabel,
  batchRenderingDetail,
  busyAriaLabel,
  onSavePdf,
  savePdfLabel,
  savePdfHint,
}: {
  step: ObsExportStep;
  batchPartLabel?: string;
  exportingCountLabel: string;
  batchRenderingDetail?: string;
  busyAriaLabel: string;
  onSavePdf?: () => void;
  savePdfLabel?: string;
  savePdfHint?: string;
}) {
  const currentIdx = OBS_EXPORT_STEP_ORDER.indexOf(step);
  const isDone = step === "done";
  const current = OBS_EXPORT_STEPS.find((s) => s.id === step)!;
  const detail =
    step === "rendering" && batchRenderingDetail ? batchRenderingDetail : current.detail;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={busyAriaLabel}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{
        backgroundColor: "var(--neutral-0)", borderRadius: 16, padding: "32px 28px",
        maxWidth: 400, width: "100%", boxShadow: "var(--shadow-2)",
        display: "flex", flexDirection: "column", gap: 24,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-400)", marginBottom: 6 }}>
            {busyAriaLabel}
          </p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: isDone ? "var(--success-700)" : "var(--neutral-900)" }}>
            {isDone ? "PDF ready!" : current.label + "…"}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--neutral-500)", lineHeight: 1.5 }}>
            {isDone && onSavePdf && savePdfHint ? savePdfHint : detail}
          </p>
        </div>
        {isDone && onSavePdf && savePdfLabel && (
          <button
            type="button"
            onClick={onSavePdf}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "none",
              borderRadius: 10,
              backgroundColor: "var(--neutral-900)",
              color: "var(--neutral-0)",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {savePdfLabel}
          </button>
        )}
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {OBS_EXPORT_STEPS.filter((s) => s.id !== "done").map((s, idx) => {
            const done   = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <li key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, opacity: done || active ? 1 : 0.35 }}>
                <span aria-hidden style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: "50%",
                  backgroundColor: done ? "var(--success-600)" : active ? "var(--primary-600)" : "var(--neutral-200)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                  color: done || active ? "#fff" : "var(--neutral-400)",
                  transition: "background-color 0.3s",
                }}>
                  {done ? "✓" : idx + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: done ? "var(--success-700)" : active ? "var(--neutral-900)" : "var(--neutral-400)" }}>
                  {s.label}
                </span>
                {active && !isDone && (
                  <span aria-hidden className="animate-spin" style={{
                    marginLeft: "auto", width: 14, height: 14, borderRadius: "50%",
                    border: "2px solid var(--neutral-200)", borderTopColor: "var(--primary-600)",
                    display: "inline-block", flexShrink: 0,
                  }} />
                )}
              </li>
            );
          })}
        </ol>
        {!isDone && (
          <p style={{ margin: 0, fontSize: 11, color: "var(--neutral-400)", textAlign: "center", lineHeight: 1.4 }}>
            {exportingCountLabel}
            {batchPartLabel ? ` · ${batchPartLabel}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ── ObsCard ───────────────────────────────────────────────────────────────────

const THUMB_MAX = 6;

function PhotoStrip({ attachments }: { attachments: { id: string; storageUrl: string; mimeType: string }[] }) {
  const images = attachments.filter((a) => a.mimeType?.startsWith("image/"));
  if (images.length === 0) return null;
  const visible = images.slice(0, THUMB_MAX);
  const overflow = images.length - THUMB_MAX;
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
      {visible.map((a, idx) => {
        const isLast = idx === THUMB_MAX - 1 && overflow > 0;
        return (
          <div key={a.id} style={{ position: "relative", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.storageUrl}
              alt=""
              style={{
                width: 72, height: 72,
                borderRadius: 8,
                objectFit: "cover",
                display: "block",
                backgroundColor: "var(--neutral-100)",
              }}
            />
            {isLast && (
              <div
                style={{
                  position: "absolute", inset: 0,
                  borderRadius: 8,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>+{overflow}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SelectIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        backgroundColor: selected ? "var(--primary-500)" : "var(--neutral-0)",
        border: selected ? "none" : "1.5px solid var(--neutral-400)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        marginTop: 4,
      }}
    >
      {selected && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <polyline
            points="1.5,5 4,7.5 8.5,2.5"
            stroke="var(--neutral-0)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function ObsRow({
  obs,
  onClick,
  typeCatalog,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  obs: ObsSummary;
  onClick: () => void;
  typeCatalog: Array<{ code: string; displayName: string }>;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const t = useTranslations("units");
  const typeMeta = resolveObservationTypeBadgeMeta(obs.observationType, typeCatalog);
  const authorName = obs.author.name ?? obs.author.email.split("@")[0];
  const title = obs.title || obs.description || "Observation";

  const handleClick = () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect();
      return;
    }
    onClick();
  };

  const rowAriaLabel = selectMode
    ? t("obsLogSelectAria", { title })
    : undefined;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={rowAriaLabel}
      aria-pressed={selectMode ? selected : undefined}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        width: "100%",
        padding: "12px 16px",
        backgroundColor: selected && selectMode ? "var(--primary-50)" : "var(--neutral-0)",
        border: "none",
        borderBottom: "1px solid var(--neutral-100)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {selectMode && <SelectIndicator selected={selected} />}
      {/* Full-width content column — pill + title share one line */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, overflow: "hidden" }}>
          <span
            style={{
              flexShrink: 0,
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: typeMeta.bg,
              color: typeMeta.color,
            }}
          >
            {typeMeta.label}
          </span>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--neutral-900)",
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {title}
          </p>
        </div>
        <span style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 3, display: "block" }}>
          {authorName} · {timeAgo(obs.createdAt)}
        </span>
        <PhotoStrip attachments={obs.attachments} />
        {obs._count.comments > 0 && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            marginTop: 6,
            fontSize: 11, fontWeight: 600, color: "var(--primary-600)",
            backgroundColor: "var(--primary-50)",
            borderRadius: 99, padding: "2px 8px",
          }}>
            <MessageSquare size={11} aria-hidden />
            {obs._count.comments} {obs._count.comments === 1 ? "comment" : "comments"}
          </span>
        )}
      </div>

      {!selectMode && (
        <ChevronRight size={14} style={{ color: "var(--neutral-300)", flexShrink: 0, marginTop: 4 }} aria-hidden />
      )}
    </button>
  );
}

// ── CollapsibleGroup ──────────────────────────────────────────────────────────

function CollapsibleGroup({
  label,
  count,
  open,
  onToggle,
  children,
  action,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  // Single item: skip the toggle button entirely — always show the item directly.
  const isSingle = count === 1;
  const isOpen = isSingle || open;

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--neutral-200)", marginBottom: 12 }}>
      {/* Header */}
      {isSingle ? (
        // Static non-interactive header — no chevron, no toggle
        <div
          style={{
            display: "flex", alignItems: "center", width: "100%",
            padding: "11px 14px", backgroundColor: "var(--neutral-50)",
            borderBottom: "1px solid var(--neutral-200)", gap: 8,
          }}
        >
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
            {label}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: "flex", alignItems: "center", width: "100%",
            padding: "11px 14px", backgroundColor: "var(--neutral-50)",
            border: "none", borderBottom: isOpen ? "1px solid var(--neutral-200)" : "none",
            cursor: "pointer", gap: 8, textAlign: "left",
          }}
        >
          <ChevronDown
            size={15}
            style={{
              flexShrink: 0, color: "var(--neutral-500)",
              transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 0.15s",
            }}
            aria-hidden
          />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
            {label}
          </span>
          <span
            style={{
              fontSize: 11, fontWeight: 600, color: "var(--neutral-500)",
              backgroundColor: "var(--neutral-100)", borderRadius: 99, padding: "2px 8px",
            }}
          >
            {count}
          </span>
        </button>
      )}

      {isOpen && (
        <>
          {children}
          {action && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--neutral-100)", backgroundColor: "var(--neutral-0)" }}>
              {action}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Filter panel (animated bottom sheet / side panel) ─────────────────────────

function ObsFilterPanel({
  filters,
  locationFilterOptions,
  availableAuthors,
  observationTypes,
  onFiltersChange,
  onClose,
}: {
  filters: Filters;
  locationFilterOptions: BuildingLevelFilterOptions;
  availableAuthors: { id: string; label: string }[];
  observationTypes: Array<{ code: string; displayName: string }>;
  onFiltersChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const t = useTranslations("units");

  const datePresets: { key: DatePreset; label: string }[] = [
    { key: "all",    label: t("obsFilterDateAll") },
    { key: "7d",     label: t("obsFilterDate7d") },
    { key: "30d",    label: t("obsFilterDate30d") },
    { key: "custom", label: t("obsFilterDateCustom") },
  ];

  const filterCount = activeFilterCount(filters);

  const toggle = (key: "obsTypes" | "authors", value: string, arr: string[]) => {
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    onFiltersChange({ ...filters, [key]: next });
  };

  return (
    <FilterPanelShell
      title={t("obsFilterTitle")}
      subtitle={t("obsFilterSubtitle")}
      closeAriaLabel={t("obsFilterCloseAria")}
      onClose={onClose}
      footer={(close) => (
        <FilterPanelFooterActions
          clearLabel={t("obsFilterClearAll")}
          applyLabel={t("obsFilterDone")}
          onClear={() => onFiltersChange(EMPTY_FILTERS)}
          onApply={close}
          clearDisabled={filterCount === 0}
        />
      )}
    >
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Observation type */}
              <div>
                <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("obsFilterTypeLabel")}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {observationTypes.map((type) => (
                    <FilterChip
                      key={type.code}
                      label={type.displayName}
                      active={filters.obsTypes.includes(type.code)}
                      onClick={() => toggle("obsTypes", type.code, filters.obsTypes)}
                    />
                  ))}
                </div>
              </div>

              <BuildingLevelFilterSection
                options={locationFilterOptions}
                value={{ buildings: filters.buildings, levels: filters.levels }}
                onChange={(next) =>
                  onFiltersChange({ ...filters, buildings: next.buildings, levels: next.levels })
                }
              />

              {/* Created by */}
              {availableAuthors.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Created by
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {availableAuthors.map(({ id, label }) => {
                      const isSelected = filters.authors.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggle("authors", id, filters.authors)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "9px 12px", borderRadius: 10,
                            border: isSelected ? "1.5px solid var(--primary-300)" : "1.5px solid var(--neutral-200)",
                            backgroundColor: isSelected ? "var(--primary-50)" : "var(--neutral-0)",
                            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                            transition: "background 0.12s, border-color 0.12s",
                          }}
                        >
                          {/* Avatar initial */}
                          <span style={{
                            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                            backgroundColor: isSelected ? "var(--primary-500)" : "var(--neutral-200)",
                            color: isSelected ? "var(--neutral-0)" : "var(--neutral-600)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {label.charAt(0).toUpperCase()}
                          </span>
                          <span style={{
                            flex: 1, fontSize: 13,
                            color: isSelected ? "var(--primary-700)" : "var(--neutral-800)",
                            fontWeight: isSelected ? 600 : 400,
                          }}>
                            {label}
                          </span>
                          {isSelected && (
                            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                              <path d="M1 5L5 9L13 1" stroke="var(--primary-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Date range */}
              <div>
                <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("obsFilterDateLabel")}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: filters.dateRange.preset === "custom" ? 14 : 0 }}>
                  {datePresets.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => onFiltersChange({ ...filters, dateRange: { preset: p.key, customFrom: "", customTo: "" } })}
                      style={{
                        padding: "8px 16px", borderRadius: 99,
                        border: filters.dateRange.preset === p.key ? "2px solid var(--primary-500)" : "1.5px solid var(--neutral-300)",
                        backgroundColor: filters.dateRange.preset === p.key ? "var(--primary-50)" : "var(--neutral-0)",
                        color: filters.dateRange.preset === p.key ? "var(--primary-700)" : "var(--neutral-700)",
                        fontSize: 13, fontWeight: filters.dateRange.preset === p.key ? 600 : 400,
                        cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.12s",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {filters.dateRange.preset === "custom" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", letterSpacing: "0.03em" }}>{t("obsFilterDateFrom")}</label>
                      <input
                        type="date"
                        value={filters.dateRange.customFrom}
                        max={filters.dateRange.customTo || undefined}
                        onChange={(e) => onFiltersChange({ ...filters, dateRange: { ...filters.dateRange, customFrom: e.target.value } })}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--neutral-300)", backgroundColor: "var(--neutral-0)", fontSize: 14, color: "var(--neutral-800)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-600)", letterSpacing: "0.03em" }}>{t("obsFilterDateTo")}</label>
                      <input
                        type="date"
                        value={filters.dateRange.customTo}
                        min={filters.dateRange.customFrom || undefined}
                        onChange={(e) => onFiltersChange({ ...filters, dateRange: { ...filters.dateRange, customTo: e.target.value } })}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--neutral-300)", backgroundColor: "var(--neutral-0)", fontSize: 14, color: "var(--neutral-800)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>
    </FilterPanelShell>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  projectName?: string;
  currentUserId?: string;
  currentUserRole?: string;
  embeddedInFieldReports?: boolean;
}

export function ObservationsLogClient({
  projectId,
  projectName = "Project",
  currentUserId,
  currentUserRole,
  embeddedInFieldReports = false,
}: Props) {
  const t = useTranslations("units");
  const tOffline = useTranslations("offlineIndicator");
  const { observationTypes } = useObservationCatalog(projectId);
  const { isOnline } = useOfflineStatus();
  const [allObs, setAllObs] = useState<ObsSummary[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheDate, setCacheDate] = useState<string | null>(null);
  useRegisterOfflineCacheView(isFromCache, cacheDate);
  const [filters, setFilters]   = useState<Filters>(EMPTY_FILTERS);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedObs, setSelectedObs] = useState<ObsSummary | null>(null);
  const [exportStep, setExportStep] = useState<
    null | "gathering" | "photos" | "rendering" | "finalizing" | "done"
  >(null);
  const [exportBatch, setExportBatch] = useState<{ current: number; total: number } | null>(null);
  const [exportProgressCount, setExportProgressCount] = useState(0);
  const [pendingPdf, setPendingPdf] = useState<{ blob: Blob; fileName: string } | null>(null);
  const exporting = exportStep !== null;
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedObservationIds, setSelectedObservationIds] = useState<Set<string>>(() => new Set());
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });

  // Collapsible group open state
  const [projectOpen, setProjectOpen]   = useState(true);
  const [buildingOpen, setBuildingOpen] = useState<Record<string, boolean>>({});
  const [levelOpen, setLevelOpen]       = useState<Record<string, boolean>>({});
  const [unitOpen, setUnitOpen]         = useState<Record<string, boolean>>({});

  const fetchObs = useCallback(async () => {
    setError(null);
    setIsFromCache(false);
    setCacheDate(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/observations`);
      if (!res.ok) throw new Error("Failed to load observations");
      const data: { observations: ObsSummary[] } = await res.json();
      setAllObs(data.observations);
    } catch (e) {
      const cached = await readSnapshotObservationsForProject(projectId);
      if (cached) {
        setAllObs(
          (cached.data as SnapshotObservationRow[]).map(normalizeSnapshotObservation),
        );
        setIsFromCache(true);
        setCacheDate(cached.generatedAt);
        setLoading(false);
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load observations");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchObs(); }, [fetchObs]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Sort
  const sorted = useMemo(() => {
    return [...allObs].sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortOrder === "newest" ? diff : -diff;
    });
  }, [allObs, sortOrder]);

  const filtered = useMemo(() => applyFilters(sorted, filters), [sorted, filters]);

  // Scope groups
  const projectObs  = useMemo(() => filtered.filter((o) => parseScope(o.unitRef).level === "project"), [filtered]);
  const buildingObs = useMemo(() => filtered.filter((o) => parseScope(o.unitRef).level === "building"), [filtered]);
  const levelObs    = useMemo(() => filtered.filter((o) => parseScope(o.unitRef).level === "level"), [filtered]);
  const unitObs     = useMemo(() => filtered.filter((o) => parseScope(o.unitRef).level === "unit"), [filtered]);

  const locationFilterOptions = useMemo(
    (): BuildingLevelFilterOptions => buildFieldLogLocationFilterOptions(allObs),
    [allObs],
  );

  // All unique authors across all observations, sorted by display name
  const availableAuthors = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of allObs) {
      const label = o.author.name ?? o.author.email.split("@")[0];
      map.set(o.author.id, label);
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allObs]);

  // Group building obs by building key
  const buildingGroups = useMemo(() => {
    const map = new Map<string, ObsSummary[]>();
    for (const o of buildingObs) {
      const { building } = parseScope(o.unitRef);
      const list = map.get(building) ?? [];
      list.push(o);
      map.set(building, list);
    }
    return map;
  }, [buildingObs]);

  // Group level obs by "building|level" key
  const levelGroups = useMemo(() => {
    const map = new Map<string, { label: string; items: ObsSummary[] }>();
    for (const o of levelObs) {
      const { building, floor } = parseScope(o.unitRef);
      const key = `${building}|${floor}`;
      const entry = map.get(key) ?? { label: `${building} › Level ${floor}`, items: [] };
      entry.items.push(o);
      map.set(key, entry);
    }
    return map;
  }, [levelObs]);

  // Group unit obs by "building|level|unit" key
  const unitGroups = useMemo(() => {
    const map = new Map<string, { label: string; items: ObsSummary[] }>();
    for (const o of unitObs) {
      const { building, floor, unit } = parseScope(o.unitRef);
      const key = `${building}|${floor}|${unit}`;
      const entry = map.get(key) ?? { label: `${building} › Level ${floor} › ${unit}`, items: [] };
      entry.items.push(o);
      map.set(key, entry);
    }
    return map;
  }, [unitObs]);

  const filterCount = activeFilterCount(filters);
  const hasFilters  = filterCount > 0;

  // Flat list in the same order observations appear on screen (project → building → level → unit).
  const displayOrder = useMemo<ObsSummary[]>(() => [
    ...projectObs,
    ...Array.from(buildingGroups.values()).flat(),
    ...Array.from(levelGroups.values()).flatMap((g) => g.items),
    ...Array.from(unitGroups.values()).flatMap((g) => g.items),
  ], [projectObs, buildingGroups, levelGroups, unitGroups]);

  const displayOrderIdSet = useMemo(
    () => new Set(displayOrder.map((o) => o.id)),
    [displayOrder],
  );

  const effectiveSelectedIds = useMemo(
    () => new Set([...selectedObservationIds].filter((id) => displayOrderIdSet.has(id))),
    [selectedObservationIds, displayOrderIdSet],
  );

  const toggleSelect = useCallback((observationId: string) => {
    setSelectedObservationIds((prev) => {
      const next = new Set(prev);
      if (next.has(observationId)) next.delete(observationId);
      else next.add(observationId);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedObservationIds((prev) => {
      const next = new Set(prev);
      for (const obs of displayOrder) next.add(obs.id);
      return next;
    });
  }, [displayOrder]);

  const deselectAll = useCallback(() => {
    setSelectedObservationIds(new Set());
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedObservationIds(new Set());
  }, []);

  const enterSelectMode = useCallback(() => {
    setIsSelectMode(true);
  }, []);

  const renderObsRow = useCallback(
    (obs: ObsSummary) => (
      <ObsRow
        key={obs.id}
        obs={obs}
        typeCatalog={observationTypes}
        selectMode={isSelectMode}
        selected={effectiveSelectedIds.has(obs.id)}
        onToggleSelect={() => toggleSelect(obs.id)}
        onClick={() => setSelectedObs(obs)}
      />
    ),
    [isSelectMode, effectiveSelectedIds, toggleSelect, observationTypes],
  );

  // ── Export handler ────────────────────────────────────────────────────────
  const handleExport = useCallback(async (explicitIds?: string[]) => {
    const isSelectionExport = explicitIds !== undefined;
    const observationIds = isSelectionExport
      ? displayOrder.filter((o) => explicitIds.includes(o.id)).map((o) => o.id)
      : displayOrder.map((o) => o.id);

    if (exporting) return;
    if (isSelectionExport && observationIds.length === 0) {
      toast.error(t("obsExportSelectedNone"));
      return;
    }
    if (!isSelectionExport && observationIds.length === 0) return;
    if (!isOnline) {
      toast.error(tOffline("offlineActionUnavailable"));
      return;
    }

    setExportProgressCount(observationIds.length);
    const batches = chunkObservationIds(observationIds);

    let filterSummary: string;
    if (isSelectionExport) {
      filterSummary = t("obsExportSelectedSummary", { count: observationIds.length });
    } else {
      const filterParts: string[] = [];
      if (filters.obsTypes.length > 0) {
        filterParts.push(
          filters.obsTypes
            .map((k) => ({ QUALITY: "Quality", PROGRESS: "Progress", SAFETY: "Safety", OTHER: "Other" })[k] ?? k)
            .join(", "),
        );
      }
      if (filters.buildings.length > 0 || filters.levels.length > 0) {
        const locationSummary = fieldLogLocationFilterSummary(filters.buildings, filters.levels);
        if (locationSummary) filterParts.push(locationSummary);
      }
      if (filters.authors.length > 0) {
        filterParts.push(`${filters.authors.length} author${filters.authors.length > 1 ? "s" : ""}`);
      }
      if (filters.dateRange.preset !== "all") {
        if (filters.dateRange.preset === "7d") filterParts.push(t("obsFilterDate7d"));
        else if (filters.dateRange.preset === "30d") filterParts.push(t("obsFilterDate30d"));
        else filterParts.push(t("obsFilterDateCustom"));
      }
      filterSummary = filterParts.join(" · ") || t("obsExportAllObservations");
    }

    const isMultiBatch = batches.length > 1;
    setExportBatch(isMultiBatch ? { current: 1, total: batches.length } : null);
    setExportStep("gathering");

    const pdfParts: Uint8Array[] = [];
    let cleanupProgressTimers: (() => void) | undefined;

    if (isMultiBatch) {
      const timers: ReturnType<typeof setTimeout>[] = [];
      timers.push(setTimeout(() => advanceObsExportStep(setExportStep, "photos"), 3_000));
      timers.push(setTimeout(() => advanceObsExportStep(setExportStep, "rendering"), 8_000));
      cleanupProgressTimers = () => timers.forEach(clearTimeout);
    }

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batchIds = batches[batchIndex]!;
        const isFirstBatch = batchIndex === 0;
        const batchNum = batchIndex + 1;

        let cleanupBatchTimers: (() => void) | undefined;
        if (isMultiBatch) {
          setExportBatch({ current: batchNum, total: batches.length });
        } else {
          setExportStep("gathering");
          const timers: ReturnType<typeof setTimeout>[] = [];
          timers.push(setTimeout(() => setExportStep("photos"), 3_000));
          timers.push(setTimeout(() => setExportStep("rendering"), 8_000));
          timers.push(setTimeout(() => setExportStep("finalizing"), 16_000));
          cleanupBatchTimers = () => timers.forEach(clearTimeout);
        }

        try {
          const res = await fetch(`/api/projects/${projectId}/observations/export-pdf`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              isSelectionExport
                ? {
                    observationIds: batchIds,
                    sortOrder,
                    projectName,
                    filterSummary: isFirstBatch ? filterSummary : "",
                    coverTitle: isFirstBatch ? t("obsExportCoverTitle") : undefined,
                    includeCover: isFirstBatch,
                    coverObservationCount: isFirstBatch ? observationIds.length : undefined,
                  }
                : {
                    observationIds: batchIds,
                    obsTypes: filters.obsTypes,
                    authors: filters.authors,
                    buildings: filters.buildings,
                    levels: filters.levels,
                    datePreset: filters.dateRange.preset,
                    dateFrom:
                      filters.dateRange.preset === "custom" ? filters.dateRange.customFrom : undefined,
                    dateTo:
                      filters.dateRange.preset === "custom" ? filters.dateRange.customTo : undefined,
                    sortOrder,
                    projectName,
                    filterSummary: isFirstBatch ? filterSummary : "",
                    coverTitle: isFirstBatch ? t("obsExportCoverTitle") : undefined,
                    includeCover: isFirstBatch,
                    coverObservationCount: isFirstBatch ? observationIds.length : undefined,
                  },
            ),
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            toast.error(formatPdfExportErrorToast(errBody, t("obsExportFailed")));
            cleanupProgressTimers?.();
            setExportStep(null);
            setExportBatch(null);
            return;
          }

          pdfParts.push(new Uint8Array(await res.arrayBuffer()));
        } finally {
          cleanupBatchTimers?.();
        }
      }

      cleanupProgressTimers?.();
      setExportStep("finalizing");
      setExportBatch(null);

      const mergedBytes =
        pdfParts.length === 1
          ? pdfParts[0]!
          : await (await import("@/lib/pdf/merge-pdf-buffers")).mergePdfBuffers(pdfParts);
      const blob = new Blob([Uint8Array.from(mergedBytes)], { type: "application/pdf" });

      setExportStep("done");

      const fileName = `observations-export-${new Date().toISOString().slice(0, 10)}.pdf`;

      if (isMobilePdfDelivery()) {
        setPendingPdf({ blob, fileName });
        return;
      }

      await deliverPdfBlob(blob, fileName);
      setTimeout(() => {
        setExportStep(null);
        setExportBatch(null);
      }, 1_200);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(t("obsExportFailedGeneric"));
      }
      cleanupProgressTimers?.();
      setExportStep(null);
      setExportBatch(null);
      setPendingPdf(null);
    }
  }, [exporting, displayOrder, filters, sortOrder, projectId, projectName, t, isOnline, tOffline]);

  const handleExportSelected = useCallback(() => {
    const ids = displayOrder
      .filter((obs) => effectiveSelectedIds.has(obs.id))
      .map((obs) => obs.id);
    void handleExport(ids);
  }, [displayOrder, effectiveSelectedIds, handleExport]);

  const handleSavePendingPdf = useCallback(async () => {
    if (!pendingPdf) return;
    try {
      await deliverPdfBlobOnUserGesture(pendingPdf.blob, pendingPdf.fileName);
      setPendingPdf(null);
      setExportStep(null);
      setExportBatch(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(t("obsExportSaveFailed"));
      }
    }
  }, [pendingPdf, t]);

  function openObs(obs: ObsSummary) {
    setSelectedObs(obs);
  }

  if (loading) {
    if (isMobileViewport) {
      return (
        <FieldLogListSkeleton
          loadingLabel={t("obsLoadingText")}
          embeddedInFieldReports={embeddedInFieldReports}
          showStandaloneChrome={!embeddedInFieldReports}
        />
      );
    }
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--neutral-400)", fontSize: 14 }}>
        {t("obsLoadingText")}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <p style={{ color: "var(--error-600)", fontSize: 14 }}>{error}</p>
        <button
          type="button"
          onClick={fetchObs}
          style={{
            marginTop: 12, padding: "8px 16px", borderRadius: 8,
            border: "1.5px solid var(--neutral-250)", backgroundColor: "var(--neutral-0)",
            fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--neutral-700)",
          }}
        >
          {t("obsRetry")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* PDF export progress overlay */}
      {exportStep !== null && (
        <ObsExportProgressOverlay
          step={exportStep}
          batchRenderingDetail={
            exportBatch && exportBatch.total > 1 && exportStep === "rendering"
              ? t("obsExportBatchRenderingDetail")
              : undefined
          }
          batchPartLabel={
            exportBatch && exportBatch.total > 1
              ? t("obsExportBatchPart", {
                  current: exportBatch.current,
                  total: exportBatch.total,
                })
              : undefined
          }
          exportingCountLabel={t("obsExportProgressCount", { count: exportProgressCount })}
          busyAriaLabel={t("obsExportPdfBusyAria")}
          onSavePdf={pendingPdf ? () => void handleSavePendingPdf() : undefined}
          savePdfLabel={pendingPdf ? t("obsExportSavePdf") : undefined}
          savePdfHint={pendingPdf ? t("obsExportSavePdfHint") : undefined}
        />
      )}

      {!embeddedInFieldReports && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--neutral-200)",
            flexShrink: 0,
            backgroundColor: "var(--neutral-0)",
          }}
        >
          <Eye size={17} style={{ color: "var(--neutral-600)", flexShrink: 0 }} aria-hidden />
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)", flex: 1 }}>
            {t("obsPageTitle")}
          </h1>
        </div>
      )}

      {/* Toolbar: sort + filter + export (compact icons when embedded in field reports) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: embeddedInFieldReports ? "flex-end" : "space-between",
          padding: "8px var(--page-padding-x)",
          borderBottom: "1px solid var(--neutral-100)",
          backgroundColor: "var(--neutral-0)",
          flexShrink: 0,
          gap: 6,
        }}
      >
        {/* Sort toggle */}
        <button
          type="button"
          onClick={() => setSortOrder((s) => (s === "newest" ? "oldest" : "newest"))}
          aria-label={sortOrder === "newest" ? t("obsSortNewestAria") : t("obsSortOldestAria")}
          title={sortOrder === "newest" ? t("obsSortNewestFirst") : t("obsSortOldestFirst")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            ...(embeddedInFieldReports
              ? {
                  height: 34,
                  width: 34,
                  borderRadius: 14,
                  border: "none",
                  backgroundColor: "var(--neutral-100)",
                  color: "var(--neutral-500)",
                }
              : {
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--neutral-200)",
                  backgroundColor: "var(--neutral-0)",
                  color: "var(--neutral-600)",
                  fontSize: 12,
                  fontWeight: 500,
                }),
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ArrowDownUp
            size={embeddedInFieldReports ? 14 : 13}
            aria-hidden
            style={{
              transform: sortOrder === "oldest" ? "scaleY(-1)" : "none",
              transition: "transform 0.15s",
            }}
          />
          {!embeddedInFieldReports &&
            (sortOrder === "newest" ? t("obsSortNewest") : t("obsSortOldest"))}
        </button>

        {/* Right group: filter + export */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>

          {/* Filter button */}
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            aria-label={t("obsFilterToolbarAria")}
            title={t("obsFilterToolbarAria")}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              height: 34, width: 34,
              borderRadius: 14,
              border: "none",
              backgroundColor: hasFilters ? "#FFF4ED" : "#F0F1F5",
              color: hasFilters ? "#F55F00" : "#737891",
              cursor: "pointer",
              position: "relative",
              flexShrink: 0,
              transition: "all 0.12s",
            }}
          >
            <Filter size={14} aria-hidden />
            {filterCount > 0 && (
              <span
                style={{
                  position: "absolute", top: -5, right: -5,
                  minWidth: 16, height: 16, borderRadius: 99,
                  backgroundColor: "var(--error-600)", color: "var(--neutral-0)",
                  fontSize: 10, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 4px",
                }}
              >
                {filterCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => (isSelectMode ? exitSelectMode() : enterSelectMode())}
            aria-label={t("selectMode")}
            aria-pressed={isSelectMode}
            title={t("selectMode")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 34,
              width: 34,
              borderRadius: 14,
              border: "none",
              backgroundColor: isSelectMode ? "var(--primary-100)" : "var(--neutral-100)",
              color: isSelectMode ? "var(--primary-600)" : "var(--neutral-500)",
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 0.12s",
            }}
          >
            <CheckSquare size={14} aria-hidden />
          </button>

          {!isSelectMode && (
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || filtered.length === 0}
            aria-label={t("obsExportPdfAria")}
            title={t("obsExportPdfAria")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              ...(embeddedInFieldReports
                ? { height: 34, width: 34, padding: 0 }
                : { gap: 5, height: 34, padding: "0 12px" }),
              borderRadius: 14,
              border: "none",
              backgroundColor: "var(--neutral-100)",
              color: "var(--neutral-500)",
              fontSize: 12,
              fontWeight: 500,
              cursor: filtered.length === 0 ? "not-allowed" : "pointer",
              opacity: filtered.length === 0 ? 0.4 : 1,
              flexShrink: 0,
              transition: "all 0.12s",
              whiteSpace: "nowrap" as const,
            }}
          >
            <FileDown size={embeddedInFieldReports ? 14 : 13} aria-hidden />
            {!embeddedInFieldReports && t("obsExportLogLabel")}
          </button>
          )}

        </div>
      </div>

      {isSelectMode && !isMobileViewport && (
        <FieldLogExportSelectionBar
          selectedCount={effectiveSelectedIds.size}
          totalVisible={displayOrder.length}
          onSelectAll={selectAllVisible}
          onDeselectAll={deselectAll}
          onExport={handleExportSelected}
          onCancel={exitSelectMode}
          exporting={exporting}
          mobile={false}
          exportButtonLabel={t("obsExportSelectedPdf")}
          exportAriaLabel={t("obsExportSelectedAria")}
        />
      )}

      {isSelectMode && isMobileViewport && (
        <FieldLogExportSelectionBar
          selectedCount={effectiveSelectedIds.size}
          totalVisible={displayOrder.length}
          onSelectAll={selectAllVisible}
          onDeselectAll={deselectAll}
          onExport={handleExportSelected}
          onCancel={exitSelectMode}
          exporting={exporting}
          mobile
          exportButtonLabel={t("obsExportSelectedPdf")}
          exportAriaLabel={t("obsExportSelectedAria")}
        />
      )}

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: isSelectMode && isMobileViewport
            ? "12px var(--page-padding-x) calc(env(safe-area-inset-bottom, 0px) + 120px)"
            : "12px var(--page-padding-x) calc(env(safe-area-inset-bottom, 0px) + 32px)",
        }}
      >

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 56 }}>
            <p style={{ fontSize: 14, color: "var(--neutral-400)", margin: 0 }}>
              {hasFilters ? t("obsNotFoundFiltered") : t("obsNotFound")}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                style={{ marginTop: 10, fontSize: 13, color: "var(--primary-700)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                {t("obsClearFilters")}
              </button>
            )}
          </div>
        )}

        {/* Project scope */}
        {projectObs.length > 0 && (
          <CollapsibleGroup
            label="Project"
            count={projectObs.length}
            open={projectOpen}
            onToggle={() => setProjectOpen((v) => !v)}
          >
            {projectObs.map((o) => renderObsRow(o))}
          </CollapsibleGroup>
        )}

        {/* Building scope */}
        {buildingGroups.size > 0 && Array.from(buildingGroups.entries()).map(([bKey, items]) => (
          <CollapsibleGroup
            key={bKey}
            label={bKey}
            count={items.length}
            open={buildingOpen[bKey] ?? true}
            onToggle={() => setBuildingOpen((prev) => ({ ...prev, [bKey]: !(prev[bKey] ?? true) }))}
          >
            {items.map((o) => renderObsRow(o))}
          </CollapsibleGroup>
        ))}

        {/* Level scope */}
        {levelGroups.size > 0 && Array.from(levelGroups.entries()).map(([lKey, { label, items }]) => (
          <CollapsibleGroup
            key={lKey}
            label={label}
            count={items.length}
            open={levelOpen[lKey] ?? true}
            onToggle={() => setLevelOpen((prev) => ({ ...prev, [lKey]: !(prev[lKey] ?? true) }))}
          >
            {items.map((o) => renderObsRow(o))}
          </CollapsibleGroup>
        ))}

        {/* Unit scope */}
        {unitGroups.size > 0 && Array.from(unitGroups.entries()).map(([uKey, { label, items }]) => (
          <CollapsibleGroup
            key={uKey}
            label={label}
            count={items.length}
            open={unitOpen[uKey] ?? true}
            onToggle={() => setUnitOpen((prev) => ({ ...prev, [uKey]: !(prev[uKey] ?? true) }))}
          >
            {items.map((o) => renderObsRow(o))}
          </CollapsibleGroup>
        ))}

      </div>

      {/* Filter panel */}
      {showFilters && (
        <ObsFilterPanel
          filters={filters}
          locationFilterOptions={locationFilterOptions}
          availableAuthors={availableAuthors}
          observationTypes={observationTypes}
          onFiltersChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Observation detail modal */}
      {selectedObs && (() => {
        const selectedIdx = displayOrder.findIndex((o) => o.id === selectedObs.id);
        return (
          <ObservationDetailModal
            obs={selectedObs}
            unitContext={{
              unitKey: parseScope(selectedObs.unitRef).unit || parseScope(selectedObs.unitRef).label,
              building: parseScope(selectedObs.unitRef).building,
              level: parseScope(selectedObs.unitRef).floor,
              unit: parseScope(selectedObs.unitRef).unit,
              unitRef: selectedObs.unitRef ?? "",
            }}
            projectId={projectId}
            projectName={projectName}
            currentUserId={currentUserId}
            currentIndex={selectedIdx >= 0 ? selectedIdx : undefined}
            total={displayOrder.length}
            onPrev={selectedIdx > 0 ? () => setSelectedObs(displayOrder[selectedIdx - 1]) : undefined}
            onNext={selectedIdx < displayOrder.length - 1 ? () => setSelectedObs(displayOrder[selectedIdx + 1]) : undefined}
            onClose={() => setSelectedObs(null)}
            onUpdated={(updated) => {
              setAllObs((prev) => prev.map((o) => o.id === updated.id ? updated : o));
              setSelectedObs(updated);
            }}
          />
        );
      })()}
    </div>
  );
}
