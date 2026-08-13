"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { FieldDailyReportProjectSection } from "@/components/reports/FieldDailyReportProjectSection";
import { DailyReportHubPreview } from "@/components/reports/DailyReportHubPreview";
import { DailyReportActivityPreviewLine } from "@/components/reports/DailyReportActivityPreviewLine";
import { FieldDailyReportSheet } from "@/components/reports/FieldDailyReportSheet";
import { FieldDailyReportExportButton } from "@/components/reports/FieldDailyReportExportButton";
import { FieldDailyReportSheetSkeleton } from "@/components/reports/FieldDailyReportSheetSkeleton";
import { FieldDailyRunForDateModal } from "@/components/reports/FieldDailyRunForDateModal";
import { PROJECT_HUB_CARD_STYLE, ProjectHubCardHeader } from "@/components/projects/ProjectHubCardHeader";
import type {
  FieldDailyReportDailyManpowerSavePayload,
  FieldDailyReportProjectDto,
  FieldDailyReportSectionNoteDto,
} from "@/lib/field-daily-report/types";
import { sectionNotesToLegacyComments } from "@/lib/field-daily-report/legacy-comments";
import type { ProjectFieldDailyHubPayload } from "@/lib/field-daily-report/project-hub-service";
import {
  defaultFieldDailyHistoryRange,
  FIELD_DAILY_HISTORY_PAGE_SIZE,
  formatFieldDailyReportGeneratedAt,
  type FieldDailyHistoryListEntry,
} from "@/lib/field-daily-report/hub-history";
import { todayReportDateInOrgTz, formatFieldDailyReportDateLabel } from "@/lib/field-daily-report/timezone";
import {
  buildFieldDailyReportSharePayload,
  shareFieldDailyReportPayload,
} from "@/lib/field-daily-report/share-report";
import { buildHubActivityPreviewCounts } from "@/lib/field-daily-report/hub-activity-preview";
import { snapshotHasFieldActivity } from "@/lib/field-daily-report/snapshot-activity";

interface ProjectHubDailyReportCardProps {
  projectId: string;
  projectName: string;
  currentUserId: string;
  currentUserRole: string;
  canViewFieldDailyReport: boolean;
  canGenerateReport: boolean;
}

interface SheetState {
  reportDate: string;
  project: FieldDailyReportProjectDto | null;
  loading: boolean;
}

function applySectionNotesToHub(
  hub: ProjectFieldDailyHubPayload,
  reportDate: string,
  sectionNotes: FieldDailyReportSectionNoteDto[],
): ProjectFieldDailyHubPayload {
  const patchSlice = (slice: FieldDailyReportProjectDto): FieldDailyReportProjectDto => ({
    ...slice,
    sectionNotes,
    comments: sectionNotesToLegacyComments(sectionNotes),
  });

  return {
    ...hub,
    recentWithActivity:
      hub.recentWithActivity?.reportDate === reportDate
        ? {
            reportDate,
            slice: patchSlice(hub.recentWithActivity.slice),
          }
        : hub.recentWithActivity,
  };
}

export function ProjectHubDailyReportCard({
  projectId,
  projectName,
  currentUserId,
  currentUserRole,
  canViewFieldDailyReport,
  canGenerateReport,
}: ProjectHubDailyReportCardProps) {
  const t = useTranslations("fieldDailyReport");
  const locale = useLocale();
  const [hub, setHub] = useState<ProjectFieldDailyHubPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyEntries, setHistoryEntries] = useState<FieldDailyHistoryListEntry[]>([]);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingDate, setGeneratingDate] = useState<string | null>(null);
  const [runForDateOpen, setRunForDateOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const loadHub = useCallback(async () => {
    if (!canViewFieldDailyReport) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/field-daily/hub`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { hub: ProjectFieldDailyHubPayload };
      setHub(data.hub);
    } catch {
      setHub(null);
    } finally {
      setLoading(false);
    }
  }, [canViewFieldDailyReport, projectId]);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const openSheet = async (reportDate: string, fallback?: FieldDailyReportProjectDto) => {
    if (fallback && !snapshotHasFieldActivity(fallback.snapshot)) {
      return;
    }

    setSheet({
      reportDate,
      project: fallback ?? null,
      loading: !fallback,
    });

    try {
      const res = await fetch(
        `/api/projects/${projectId}/field-daily/slice?date=${encodeURIComponent(reportDate)}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as { slice: FieldDailyReportProjectDto };
        if (!snapshotHasFieldActivity(data.slice.snapshot)) {
          setSheet(null);
          return;
        }
        setSheet({ reportDate, project: data.slice, loading: false });
        return;
      }
    } catch {
      // Fall back to cached hub slice when the fresh fetch fails.
    }

    if (fallback) {
      setSheet({ reportDate, project: fallback, loading: false });
      return;
    }

    setSheet(null);
    toast.error(t("loadError"));
  };

  const loadHistoryPage = useCallback(
    async (mode: "reset" | "more", cursor?: string) => {
      if (!historyFrom || !historyTo) return;
      const loadingMore = mode === "more";
      if (loadingMore) setHistoryLoadingMore(true);
      else setHistoryLoading(true);

      try {
        const params = new URLSearchParams({
          from: historyFrom,
          to: historyTo,
          limit: String(FIELD_DAILY_HISTORY_PAGE_SIZE),
        });
        if (loadingMore && cursor) {
          params.set("cursor", cursor);
        }
        const res = await fetch(`/api/projects/${projectId}/field-daily/history?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("history load failed");
        const data = (await res.json()) as {
          history: {
            entries: FieldDailyHistoryListEntry[];
            nextCursor: string | null;
            totalInRange: number;
          };
        };
        setHistoryNextCursor(data.history.nextCursor);
        setHistoryEntries((prev) =>
          loadingMore ? [...prev, ...data.history.entries] : data.history.entries,
        );
      } catch {
        if (!loadingMore) {
          setHistoryEntries([]);
          setHistoryNextCursor(null);
        }
        toast.error(t("hubHistoryLoadError"));
      } finally {
        if (loadingMore) setHistoryLoadingMore(false);
        else setHistoryLoading(false);
      }
    },
    [historyFrom, historyTo, projectId, t],
  );

  useEffect(() => {
    if (!historyExpanded || !historyFrom || !historyTo) return;
    void loadHistoryPage("reset");
  }, [historyExpanded, historyFrom, historyTo, loadHistoryPage]);

  const handleShareReport = useCallback(async () => {
    if (!sheet?.project) return;
    const previewCounts = buildHubActivityPreviewCounts(sheet.project.snapshot);
    try {
      const payload = buildFieldDailyReportSharePayload({
        projectName,
        reportDate: sheet.reportDate,
        updatedTimeLabel: sheet.project.generatedAt
          ? t("hubHistoryGeneratedAt", {
              dateTime: formatFieldDailyReportGeneratedAt(sheet.project.generatedAt, locale),
            })
          : undefined,
        snapshot: sheet.project.snapshot,
        labels: {
          statusChanges: t("hubPreviewStatusChanges", { count: previewCounts.statusChanges }),
          inspections: t("hubPreviewInspections", { count: previewCounts.inspections }),
          issuesReported: t("hubPreviewIssuesReported", { count: previewCounts.issuesReported }),
          otherActivity: t("hubPreviewOtherActivity", { count: previewCounts.otherActivity }),
          updated: t("shareUpdatedLabel"),
        },
        pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
      });
      const result = await shareFieldDailyReportPayload(payload);
      if (result === "copied") toast.success(t("shareCopied"));
    } catch {
      toast.error(t("shareError"));
    }
  }, [sheet, projectName, locale, t]);

  const toggleHistoryExpanded = () => {
    setHistoryExpanded((expanded) => {
      const next = !expanded;
      if (next && !historyFrom) {
        const range = defaultFieldDailyHistoryRange();
        setHistoryFrom(range.fromDate);
        setHistoryTo(hub?.todayDate ?? range.toDate);
      }
      return next;
    });
  };

  const handleSectionNotesChange = useCallback(
    (sectionNotes: FieldDailyReportSectionNoteDto[]) => {
      setSheet((prev) => {
        if (!prev?.project) return prev;
        return {
          ...prev,
          project: {
            ...prev.project,
            sectionNotes,
            comments: sectionNotesToLegacyComments(sectionNotes),
          },
        };
      });
      setHub((prev) => {
        if (!prev) return prev;
        const reportDate = sheet?.reportDate;
        if (!reportDate) return prev;
        return applySectionNotesToHub(prev, reportDate, sectionNotes);
      });
    },
    [sheet?.reportDate],
  );

  const handleDailyManpowerSaved = useCallback((payload: FieldDailyReportDailyManpowerSavePayload) => {
    setSheet((prev) => {
      if (!prev?.project) return prev;
      return {
        ...prev,
        project: {
          ...prev.project,
          dailyManpower: payload.dailyManpower,
          dailyManpowerMeta: payload.dailyManpowerMeta,
        },
      };
    });
  }, []);

  const handleSheetClose = useCallback(() => {
    setSheet(null);
    void loadHub();
  }, [loadHub]);

  const generateForDate = async (
    reportDate: string,
    options?: { bumpGeneratedAt?: boolean; closeRunModal?: boolean },
  ) => {
    if (!canGenerateReport || !reportDate) return;
    const bumpGeneratedAt = options?.bumpGeneratedAt ?? true;
    setGenerating(true);
    setGeneratingDate(reportDate);
    try {
      const res = await fetch(`/api/projects/${projectId}/field-daily/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: reportDate, bumpGeneratedAt }),
      });
      if (!res.ok) throw new Error("generate failed");
      const data = (await res.json()) as {
        slice: FieldDailyReportProjectDto;
        reportDate: string;
        contentChanged?: boolean;
        hadExisting?: boolean;
      };
      const hasActivity = snapshotHasFieldActivity(data.slice.snapshot);
      await loadHub();
      if (historyExpanded) {
        void loadHistoryPage("reset");
      }
      if (hasActivity) {
        void openSheet(data.reportDate, data.slice);
        if (data.hadExisting) {
          toast.success(t("generateSuccessUpdate"));
        } else {
          toast.success(t("generateSuccess"));
        }
      } else {
        toast.success(t("generateSuccessNoActivity"));
      }
      if (options?.closeRunModal) {
        setRunForDateOpen(false);
      }
    } catch {
      toast.error(t("generateError"));
    } finally {
      setGenerating(false);
      setGeneratingDate(null);
    }
  };

  const generateToday = async () => {
    const reportDate = hub?.todayDate ?? todayReportDateInOrgTz();
    await generateForDate(reportDate, { bumpGeneratedAt: true });
  };

  if (!canViewFieldDailyReport) return null;

  const recent = hub?.recentWithActivity;
  const todayDate = hub?.todayDate ?? todayReportDateInOrgTz();

  const historyGeneratedLabel = (generatedAt: string) =>
    t("hubHistoryGeneratedAt", {
      dateTime: formatFieldDailyReportGeneratedAt(generatedAt, locale),
    });

  const reportDateLabel = (reportDate: string) =>
    formatFieldDailyReportDateLabel(reportDate, locale);

  const hubActionsDisabled = loading || generating;

  return (
    <>
      <div style={PROJECT_HUB_CARD_STYLE}>
        <ProjectHubCardHeader
          icon={CalendarCheck}
          title={t("hubTitle")}
          actions={
            canGenerateReport ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setRunForDateOpen(true)}
                  disabled={hubActionsDisabled}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--neutral-300)",
                    background: "var(--neutral-0)",
                    color: "var(--neutral-800)",
                    fontWeight: 600,
                    fontSize: "var(--text-caption)",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    cursor: hubActionsDisabled ? "not-allowed" : "pointer",
                    opacity: hubActionsDisabled ? 0.7 : 1,
                  }}
                >
                  {t("hubRunForSpecificDate")}
                </button>
                <button
                  type="button"
                  onClick={() => void generateToday()}
                  disabled={hubActionsDisabled}
                  aria-label={
                    loading
                      ? t("loading")
                      : hub?.todayReport
                        ? t("hubUpdateToday")
                        : t("hubGenerateToday")
                  }
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "none",
                    backgroundColor: "var(--color-accent)",
                    color: "var(--neutral-0)",
                    fontWeight: 600,
                    fontSize: "var(--text-caption)",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                    cursor: hubActionsDisabled ? "not-allowed" : "pointer",
                    opacity: hubActionsDisabled ? 0.7 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      {t("loading")}
                    </>
                  ) : generating && generatingDate === todayDate ? (
                    <>
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      {t("generating")}
                    </>
                  ) : hub?.todayReport ? (
                    t("hubUpdateToday")
                  ) : (
                    t("hubGenerateToday")
                  )}
                </button>
              </div>
            ) : undefined
          }
        />

        <p
          style={{
            margin: "0 0 10px",
            fontSize: "var(--text-caption)",
            color: "var(--neutral-600)",
            lineHeight: 1.4,
          }}
        >
          {t("livingDocumentHint")}
        </p>

        {loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--neutral-500)",
              fontSize: "var(--text-caption)",
            }}
          >
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {t("loading")}
          </div>
        )}

        {!loading && !recent && (
          <p style={{ margin: "0 0 10px", fontSize: "var(--text-caption)", color: "var(--neutral-600)" }}>
            {t("hubEmpty")}
          </p>
        )}

        {!loading && recent && (
          <button
            type="button"
            onClick={() => void openSheet(recent.reportDate, recent.slice)}
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--blue-50)",
              padding: "10px 12px",
              cursor: "pointer",
              marginBottom: 10,
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                fontSize: "var(--text-caption)",
                fontWeight: 600,
                color: "var(--blue-700)",
              }}
            >
              {t("hubPreviewMostRecent")}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-body)",
                  fontWeight: 600,
                  color: "var(--neutral-900)",
                }}
              >
                {reportDateLabel(recent.reportDate)}
              </span>
              {recent.slice.generatedAt ? (
                <span
                  style={{
                    fontSize: "var(--text-caption)",
                    color: "var(--neutral-500)",
                    flexShrink: 1,
                    textAlign: "right",
                    lineHeight: 1.35,
                    maxWidth: "58%",
                  }}
                >
                  {historyGeneratedLabel(recent.slice.generatedAt ?? "")}
                </span>
              ) : null}
            </div>
            <DailyReportHubPreview snapshot={recent.slice.snapshot} />
          </button>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: recent ? 2 : 0,
            marginBottom: historyExpanded ? 8 : 0,
          }}
        >
          {(hub?.historyCount ?? 0) > 0 && (
            <button
              type="button"
              onClick={toggleHistoryExpanded}
              aria-expanded={historyExpanded}
              style={{
                padding: "4px 0",
                border: "none",
                background: "transparent",
                color: "var(--primary-600)",
                fontWeight: 600,
                fontSize: "var(--text-caption)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              {t("hubHistoryToggle", { count: hub?.historyCount ?? 0 })}
              {historyExpanded ? (
                <ChevronDown size={14} aria-hidden />
              ) : (
                <ChevronRight size={14} aria-hidden />
              )}
            </button>
          )}
        </div>

        {historyExpanded && hub && (
          <div
            style={{
              border: "1px solid var(--neutral-200)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                padding: "10px 12px",
                borderBottom: "1px solid var(--neutral-100)",
                background: "var(--neutral-50)",
              }}
            >
              <input
                type="date"
                value={historyFrom}
                max={historyTo || hub.todayDate}
                onChange={(e) => setHistoryFrom(e.target.value)}
                aria-label={t("hubHistoryDateFromAria")}
                style={{
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  padding: "4px 6px",
                  fontSize: "var(--text-caption)",
                  color: "var(--neutral-900)",
                  background: "var(--neutral-0)",
                }}
              />
              <span style={{ color: "var(--neutral-400)", fontSize: "var(--text-caption)" }}>–</span>
              <input
                type="date"
                value={historyTo}
                min={historyFrom}
                max={hub.todayDate}
                onChange={(e) => setHistoryTo(e.target.value)}
                aria-label={t("hubHistoryDateToAria")}
                style={{
                  border: "1px solid var(--neutral-300)",
                  borderRadius: "var(--radius-sm)",
                  padding: "4px 6px",
                  fontSize: "var(--text-caption)",
                  color: "var(--neutral-900)",
                  background: "var(--neutral-0)",
                }}
              />
            </div>

            {historyLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px",
                  color: "var(--neutral-500)",
                  fontSize: "var(--text-caption)",
                }}
              >
                <Loader2 size={14} className="animate-spin" aria-hidden />
                {t("loading")}
              </div>
            ) : historyEntries.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: "12px",
                  fontSize: "var(--text-caption)",
                  color: "var(--neutral-500)",
                }}
              >
                {t("hubHistoryEmptyInRange")}
              </p>
            ) : (
              <>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {historyEntries.map((entry) => {
                    const rowContent = (
                      <>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontSize: "var(--text-body)",
                              fontWeight: 600,
                              color: entry.hasActivity
                                ? "var(--neutral-900)"
                                : "var(--neutral-700)",
                            }}
                          >
                            {reportDateLabel(entry.reportDate)}
                          </span>
                          <span
                            style={{
                              fontSize: "var(--text-caption)",
                              color: "var(--neutral-500)",
                              flexShrink: 1,
                              textAlign: "right",
                              lineHeight: 1.35,
                              maxWidth: "58%",
                            }}
                          >
                            {historyGeneratedLabel(entry.generatedAt)}
                          </span>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <DailyReportActivityPreviewLine counts={entry.activityPreview} />
                        </div>
                        <div
                          style={{
                            fontSize: "var(--text-caption)",
                            color: "var(--neutral-500)",
                            marginTop: 4,
                            lineHeight: 1.45,
                          }}
                        >
                          {entry.hasActivity
                            ? t("hubHistoryTapToView")
                            : t("hubHistoryNoActivity")}
                        </div>
                      </>
                    );

                    return (
                    <li key={entry.reportDate} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "stretch",
                          background: "var(--color-surface)",
                        }}
                      >
                        {entry.hasActivity ? (
                          <button
                            type="button"
                            onClick={() => void openSheet(entry.reportDate)}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              textAlign: "left",
                              padding: "10px 12px",
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                            }}
                          >
                            {rowContent}
                          </button>
                        ) : (
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              textAlign: "left",
                              padding: "10px 12px",
                            }}
                          >
                            {rowContent}
                          </div>
                        )}
                        {canGenerateReport && (
                          <button
                            type="button"
                            onClick={() => void generateForDate(entry.reportDate)}
                            disabled={generating}
                            aria-label={t("hubHistoryUpdate")}
                            title={t("hubHistoryUpdate")}
                            style={{
                              flexShrink: 0,
                              alignSelf: "center",
                              marginRight: 8,
                              padding: "6px 8px",
                              border: "1px solid var(--neutral-200)",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--neutral-0)",
                              color: "var(--primary-600)",
                              fontWeight: 600,
                              fontSize: "var(--text-caption)",
                              cursor: generating ? "not-allowed" : "pointer",
                              opacity: generating ? 0.6 : 1,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {generating && generatingDate === entry.reportDate ? (
                              <Loader2 size={12} className="animate-spin" aria-hidden />
                            ) : (
                              t("hubHistoryUpdate")
                            )}
                          </button>
                        )}
                      </div>
                    </li>
                    );
                  })}
                </ul>
                {(historyNextCursor || historyLoadingMore) && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      padding: "8px 12px",
                      borderTop: "1px solid var(--neutral-100)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void loadHistoryPage("more", historyNextCursor ?? undefined)}
                      disabled={historyLoadingMore || !historyNextCursor}
                      style={{
                        padding: "6px 10px",
                        border: "none",
                        background: "transparent",
                        color: "var(--primary-600)",
                        fontWeight: 600,
                        fontSize: "var(--text-caption)",
                        cursor: historyLoadingMore || !historyNextCursor ? "not-allowed" : "pointer",
                        opacity: historyLoadingMore || !historyNextCursor ? 0.6 : 1,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {historyLoadingMore ? (
                        <>
                          <Loader2 size={14} className="animate-spin" aria-hidden />
                          {t("hubHistoryLoadingMore")}
                        </>
                      ) : (
                        t("hubHistoryLoadMore")
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {canGenerateReport && (
        <FieldDailyRunForDateModal
          open={runForDateOpen}
          maxDate={todayDate}
          running={generating && runForDateOpen}
          onClose={() => setRunForDateOpen(false)}
          onRun={(reportDate) =>
            void generateForDate(reportDate, { bumpGeneratedAt: true, closeRunModal: true })
          }
        />
      )}

      {sheet && (
        <FieldDailyReportSheet
          projectName={projectName}
          reportDate={sheet.reportDate}
          updatedTimeLabel={
            sheet.project?.generatedAt
              ? historyGeneratedLabel(sheet.project.generatedAt)
              : undefined
          }
          onShare={sheet.project && !sheet.loading ? () => void handleShareReport() : undefined}
          toolbarExtra={
            sheet.project && !sheet.loading ? (
              <FieldDailyReportExportButton
                project={sheet.project}
                reportDate={sheet.reportDate}
              />
            ) : undefined
          }
          onClose={handleSheetClose}
          showSaveStatus={canGenerateReport && Boolean(sheet.project) && !sheet.loading}
        >
          {sheet.loading || !sheet.project ? (
            <FieldDailyReportSheetSkeleton loadingLabel={t("loading")} />
          ) : (
            <FieldDailyReportProjectSection
              project={sheet.project}
              reportDate={sheet.reportDate}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              sheetMode
              editable={canGenerateReport}
              onSectionNotesChange={handleSectionNotesChange}
              onDailyManpowerSaved={handleDailyManpowerSaved}
            />
          )}
        </FieldDailyReportSheet>
      )}
    </>
  );
}
