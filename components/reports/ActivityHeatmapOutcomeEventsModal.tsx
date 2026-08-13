"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LocationOutcome } from "@/lib/activity/activity-location-schema";
import { formatDistanceFromProjectMeters } from "@/lib/geo/format-capture-proximity";

export interface OutcomeEventRow {
  activityLogId: string;
  summary: string;
  createdAt: string;
  userName: string | null;
  projectName?: string;
  distanceFromProjectMeters?: number | null;
}

type DatePreset = "7d" | "14d" | "30d" | "custom";

export interface ActivityHeatmapOutcomeEventsModalProps {
  open: boolean;
  outcome: LocationOutcome | null;
  outcomeLabel: string;
  totalCount: number;
  scope: "project" | "dashboard";
  projectIds: string[];
  datePreset: DatePreset;
  selectedUserIds: string[];
  onClose: () => void;
}

function presetToRange(preset: DatePreset): { dateFrom?: string; dateTo?: string } {
  if (preset === "custom") return {};
  const days = preset === "7d" ? 7 : preset === "14d" ? 14 : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

export function ActivityHeatmapOutcomeEventsModal({
  open,
  outcome,
  outcomeLabel,
  totalCount,
  scope,
  projectIds,
  datePreset,
  selectedUserIds,
  onClose,
}: ActivityHeatmapOutcomeEventsModalProps) {
  const t = useTranslations("activityHeatmap");
  const [events, setEvents] = useState<OutcomeEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (cursor?: string | null, append = false) => {
      if (!open || !outcome || projectIds.length === 0) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const range = presetToRange(datePreset);
        const params = new URLSearchParams({ outcome, limit: "50" });
        if (range.dateFrom) params.set("dateFrom", range.dateFrom);
        if (range.dateTo) params.set("dateTo", range.dateTo);
        if (selectedUserIds.length > 0) params.set("userIds", selectedUserIds.join(","));
        if (scope === "dashboard") params.set("projectIds", projectIds.join(","));
        if (cursor) params.set("cursor", cursor);

        const base =
          scope === "project" && projectIds.length === 1
            ? `/api/projects/${encodeURIComponent(projectIds[0]!)}/activity/heatmap/missing`
            : "/api/activity/heatmap/missing";

        const res = await fetch(`${base}?${params.toString()}`);
        if (!res.ok) throw new Error("fetch failed");
        const body = (await res.json()) as {
          events: OutcomeEventRow[];
          nextCursor: string | null;
        };
        setEvents((prev) => (append ? [...prev, ...(body.events ?? [])] : body.events ?? []));
        setNextCursor(body.nextCursor ?? null);
      } catch {
        if (!append) setEvents([]);
        setNextCursor(null);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [open, outcome, projectIds, datePreset, selectedUserIds, scope],
  );

  useEffect(() => {
    if (!open || !outcome) {
      setEvents([]);
      setNextCursor(null);
      return;
    }
    void fetchPage(null, false);
  }, [open, outcome, fetchPage]);

  if (!open || !outcome) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label={t("outcomeEventsModalTitle", { reason: outcomeLabel, count: totalCount })}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "var(--overlay-bg, rgba(0,0,0,0.5))",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--neutral-0)",
          borderRadius: "12px 12px 0 0",
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "12px 12px 8px",
            borderBottom: "1px solid var(--neutral-200)",
          }}
        >
          <h3 style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>
            {t("outcomeEventsModalTitle", { reason: outcomeLabel, count: totalCount })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeOutcomeEvents")}
            title={t("closeOutcomeEvents")}
            style={{ border: "none", background: "none", padding: 8, cursor: "pointer", flexShrink: 0 }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px 12px" }}>
          {loading ? (
            <p style={{ fontSize: 12, color: "var(--neutral-600)" }}>{t("loading")}</p>
          ) : events.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--neutral-600)" }}>{t("missingEmpty")}</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {events.map((e) => (
                <li
                  key={e.activityLogId}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid var(--neutral-100)",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontWeight: 500, color: "var(--neutral-900)" }}>{e.summary}</div>
                  <div style={{ marginTop: 4, color: "var(--neutral-600)", fontSize: 11 }}>
                    {[
                      e.userName,
                      e.projectName,
                      e.distanceFromProjectMeters != null
                        ? formatDistanceFromProjectMeters(e.distanceFromProjectMeters)
                        : null,
                      new Date(e.createdAt).toLocaleString(),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {nextCursor ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void fetchPage(nextCursor, true)}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "10px 12px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                border: "1px solid var(--primary-500)",
                background: "var(--primary-50)",
                color: "var(--primary-700)",
                cursor: loadingMore ? "wait" : "pointer",
              }}
            >
              {loadingMore ? t("loading") : t("loadMoreEvents")}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
