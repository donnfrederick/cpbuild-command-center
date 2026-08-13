"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Map, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ActivityHeatmapResponse } from "@/lib/activity/heatmap/fetch-activity-heatmap-data";
import type { LocationOutcome } from "@/lib/activity/activity-location-schema";
import { LOCATION_OUTCOME_VALUES } from "@/lib/activity/activity-location-schema";
import { ActivityHeatmapUserFilter } from "@/components/reports/ActivityHeatmapUserFilter";
import { ActivityHeatmapOutcomeEventsModal } from "@/components/reports/ActivityHeatmapOutcomeEventsModal";

const ActivityHeatmapMap = dynamic(() => import("@/components/reports/ActivityHeatmapMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        minHeight: 280,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--neutral-500)",
        fontSize: 13,
      }}
    >
      …
    </div>
  ),
});

type DatePreset = "7d" | "14d" | "30d" | "custom";

export interface ActivityHeatmapModalProps {
  open: boolean;
  onClose: () => void;
  projectIds: string[];
  /** Project-scoped API when length === 1; dashboard API otherwise */
  scope: "project" | "dashboard";
}

function presetToRange(preset: DatePreset): { dateFrom?: string; dateTo?: string } {
  if (preset === "custom") return {};
  const days = preset === "7d" ? 7 : preset === "14d" ? 14 : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

export function ActivityHeatmapModal({
  open,
  onClose,
  projectIds,
  scope,
}: ActivityHeatmapModalProps) {
  const t = useTranslations("activityHeatmap");
  const tCapture = useTranslations("captureMetadata");
  const [tab, setTab] = useState<"map" | "coverage">("map");
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [data, setData] = useState<ActivityHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [outcomeEventsModal, setOutcomeEventsModal] = useState<LocationOutcome | null>(null);

  const outcomeLabel = useCallback(
    (outcome: LocationOutcome): string => {
      if (outcome === "on_map") return t("outcomeOnMap");
      if (outcome === "denied") return tCapture("locationNotRecordedDenied");
      if (outcome === "timeout") return tCapture("locationNotRecordedTimeout");
      if (outcome === "unavailable") return tCapture("locationNotRecordedUnavailable");
      if (outcome === "no_capture") return t("outcomeNoCapture");
      return t("outcomeLegacy");
    },
    [t, tCapture],
  );

  const fetchHeatmap = useCallback(async () => {
    if (!open || projectIds.length === 0) return;
    setLoading(true);
    try {
      const range = presetToRange(datePreset);
      const params = new URLSearchParams();
      if (range.dateFrom) params.set("dateFrom", range.dateFrom);
      if (range.dateTo) params.set("dateTo", range.dateTo);
      if (selectedUserIds.length > 0) params.set("userIds", selectedUserIds.join(","));
      if (scope === "dashboard") params.set("projectIds", projectIds.join(","));

      const base =
        scope === "project" && projectIds.length === 1
          ? `/api/projects/${encodeURIComponent(projectIds[0]!)}/activity/heatmap`
          : "/api/activity/heatmap";

      const res = await fetch(`${base}?${params.toString()}`);
      if (!res.ok) throw new Error("heatmap fetch failed");
      setData((await res.json()) as ActivityHeatmapResponse);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [open, projectIds, datePreset, selectedUserIds, scope]);

  useEffect(() => {
    void fetchHeatmap();
  }, [fetchHeatmap]);

  const openOutcomeEvents = useCallback((outcome: LocationOutcome) => {
    setOutcomeEventsModal(outcome);
  }, []);

  const actorColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of data?.actors ?? []) map[a.id] = a.color;
    return map;
  }, [data?.actors]);

  if (!open) return null;

  const coverage = data?.coverage;
  const headline =
    coverage && coverage.totalActivities > 0
      ? t("coverageHeadline", {
          onMap: coverage.onMapCount,
          total: coverage.totalActivities,
          percent: coverage.coveragePercent,
        })
      : t("coverageEmpty");

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label={t("modalTitle")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--overlay-bg, rgba(0,0,0,0.5))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          marginTop: "auto",
          background: "var(--neutral-0)",
          borderRadius: "12px 12px 0 0",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 12px 8px",
            borderBottom: "1px solid var(--neutral-200)",
          }}
        >
          <h2 style={{ margin: 0, flex: 1, fontSize: 16, fontWeight: 700 }}>{t("modalTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("close")} title={t("close")} style={{ border: "none", background: "none", padding: 8, cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: 8, borderBottom: "1px solid var(--neutral-100)" }}>
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
            aria-label={t("dateRange")}
            style={{ fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--neutral-300)" }}
          >
            <option value="7d">{t("date7d")}</option>
            <option value="14d">{t("date14d")}</option>
            <option value="30d">{t("date30d")}</option>
          </select>
          {data?.actors && data.actors.length > 0 ? (
            <ActivityHeatmapUserFilter
              actors={data.actors}
              selectedUserIds={selectedUserIds}
              onChange={setSelectedUserIds}
            />
          ) : null}
        </div>

        <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--neutral-700)", borderBottom: "1px solid var(--neutral-100)" }}>
          {loading ? t("loading") : headline}
          {coverage ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {LOCATION_OUTCOME_VALUES.filter((o) => (coverage.byOutcome[o] ?? 0) > 0).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => openOutcomeEvents(o)}
                  style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, border: "1px solid var(--neutral-300)", background: "var(--neutral-50)", cursor: "pointer" }}
                >
                  {outcomeLabel(o)} {coverage.byOutcome[o]}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 4, padding: "8px 12px 0" }}>
          <button type="button" onClick={() => setTab("map")} aria-pressed={tab === "map"} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "8px 0", border: "none", borderBottom: tab === "map" ? "2px solid var(--primary-600)" : "2px solid transparent", background: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            <Map size={14} /> {t("tabMap")}
          </button>
          <button type="button" onClick={() => setTab("coverage")} aria-pressed={tab === "coverage"} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "8px 0", border: "none", borderBottom: tab === "coverage" ? "2px solid var(--primary-600)" : "2px solid transparent", background: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            <BarChart3 size={14} /> {t("tabCoverage")}
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 280, overflow: "auto", padding: 12 }}>
          {tab === "map" ? (
            data && (data.coverage.onMapCount > 0 || (data.mapPoints?.length ?? 0) > 0) ? (
              <div style={{ height: 320 }}>
                <ActivityHeatmapMap
                  mapPoints={data.mapPoints ?? []}
                  actorColors={actorColors}
                  projectSite={data.projectSite}
                  mapBounds={data.mapBounds}
                />
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--neutral-600)" }}>{t("mapEmpty")}</p>
            )
          ) : (
            <div>
              {coverage ? (
                <>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: 6 }}>{t("reasonColumn")}</th>
                        <th style={{ textAlign: "right", padding: 6 }}>{t("countColumn")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LOCATION_OUTCOME_VALUES.map((o) => (
                        <tr key={o}>
                          <td style={{ padding: 6 }}>{outcomeLabel(o)}</td>
                          <td style={{ padding: 6, textAlign: "right" }}>
                            {coverage.byOutcome[o] ?? 0}
                            {(coverage.byOutcome[o] ?? 0) > 0 ? (
                              <button type="button" onClick={() => openOutcomeEvents(o)} style={{ marginLeft: 8, fontSize: 11, color: "var(--primary-700)", background: "none", border: "none", cursor: "pointer" }}>
                                {t("viewEvents")}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {coverage.byUser.length > 0 ? (
                    <>
                      <h3 style={{ fontSize: 13, margin: "16px 0 8px" }}>{t("perUserTitle")}</h3>
                      <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: 4 }}>{t("userColumn")}</th>
                            <th style={{ textAlign: "right", padding: 4 }}>{t("coverageColumn")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {coverage.byUser.map((u) => (
                            <tr key={u.userId}>
                              <td style={{ padding: 4 }}>{u.userName}</td>
                              <td style={{ padding: 4, textAlign: "right" }}>{u.coveragePercent}% ({u.onMap}/{u.total})</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <ActivityHeatmapOutcomeEventsModal
        open={outcomeEventsModal != null}
        outcome={outcomeEventsModal}
        outcomeLabel={outcomeEventsModal ? outcomeLabel(outcomeEventsModal) : ""}
        totalCount={outcomeEventsModal ? (coverage?.byOutcome[outcomeEventsModal] ?? 0) : 0}
        scope={scope}
        projectIds={projectIds}
        datePreset={datePreset}
        selectedUserIds={selectedUserIds}
        onClose={() => setOutcomeEventsModal(null)}
      />
    </div>,
    document.body,
  );
}
