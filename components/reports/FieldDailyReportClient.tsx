"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FieldDailyReportProjectSection } from "@/components/reports/FieldDailyReportProjectSection";
import { FieldDailyReportSkeleton } from "@/components/reports/FieldDailyReportSkeleton";
import {
  filterFieldDailyReportProjects,
  type FieldDailyReportActivityFilter,
} from "@/lib/field-daily-report/filter-report-projects";
import type {
  FieldDailyReportDailyManpowerSavePayload,
  FieldDailyReportDto,
  FieldDailyReportSectionNoteDto,
} from "@/lib/field-daily-report/types";
import { sectionNotesToLegacyComments } from "@/lib/field-daily-report/legacy-comments";
import {
  clampReportDateToToday,
  compareReportDates,
  todayReportDateInOrgTz,
} from "@/lib/field-daily-report/timezone";

interface FieldDailyReportClientProps {
  currentUserId: string;
  currentUserRole: string;
  canGenerateReport: boolean;
  initialDate?: string;
}

interface BackfillProject {
  id: string;
  projectName: string;
}

function shiftDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function FieldDailyReportClient({
  currentUserId,
  currentUserRole,
  canGenerateReport,
  initialDate,
}: FieldDailyReportClientProps) {
  const t = useTranslations("fieldDailyReport");
  const [reportDate, setReportDate] = useState(() =>
    clampReportDateToToday(initialDate ?? todayReportDateInOrgTz()),
  );
  const [report, setReport] = useState<FieldDailyReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [backfillExpanded, setBackfillExpanded] = useState(false);
  const [backfillProjects, setBackfillProjects] = useState<BackfillProject[]>([]);
  const [backfillProjectsLoading, setBackfillProjectsLoading] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<FieldDailyReportActivityFilter>("withChanges");
  const today = todayReportDateInOrgTz();
  const canGoNext = compareReportDates(reportDate, today) < 0;

  const allProjects = report?.projects ?? [];
  const filteredProjects = useMemo(
    () =>
      filterFieldDailyReportProjects(allProjects, {
        searchQuery,
        activityFilter,
      }),
    [allProjects, searchQuery, activityFilter],
  );
  const filtersActive =
    searchQuery.trim().length > 0 || activityFilter === "withChanges";

  const clearFilters = () => {
    setSearchQuery("");
    setActivityFilter("withChanges");
  };

  const loadReport = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/field-daily?date=${encodeURIComponent(date)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { report: FieldDailyReportDto | null };
      setReport(data.report);
    } catch {
      toast.error(t("loadError"));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadBackfillProjects = useCallback(async (date: string) => {
    setBackfillProjectsLoading(true);
    try {
      const res = await fetch(
        `/api/reports/field-daily/projects?date=${encodeURIComponent(date)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("projects load failed");
      const data = (await res.json()) as { projects: BackfillProject[] };
      setBackfillProjects(data.projects);
      setSelectedProjectIds(new Set());
    } catch {
      setBackfillProjects([]);
      setSelectedProjectIds(new Set());
    } finally {
      setBackfillProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport(reportDate);
  }, [reportDate, loadReport]);

  useEffect(() => {
    if (!canGenerateReport || !backfillExpanded) return;
    void loadBackfillProjects(reportDate);
  }, [canGenerateReport, backfillExpanded, reportDate, loadBackfillProjects]);

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const selectAllProjects = () => {
    setSelectedProjectIds(new Set(backfillProjects.map((p) => p.id)));
  };

  const clearProjectSelection = () => {
    setSelectedProjectIds(new Set());
  };

  const generateReport = async () => {
    if (!canGenerateReport) return;
    const projectIds =
      selectedProjectIds.size > 0 ? Array.from(selectedProjectIds) : undefined;
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/field-daily/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: reportDate, projectIds }),
      });
      if (!res.ok) throw new Error("generate failed");
      const data = (await res.json()) as { report: FieldDailyReportDto | null };
      const hadReport = Boolean(report?.projects.length);
      await loadReport(reportDate);
      const projectCount = data.report?.projects.length ?? 0;
      if (projectCount === 0) {
        toast.success(t("generateSuccessNoActivity"));
      } else if (hadReport) {
        toast.success(t("generateSuccessUpdate"));
      } else {
        toast.success(t("generateSuccess"));
      }
    } catch {
      toast.error(t("generateError"));
    } finally {
      setGenerating(false);
    }
  };

  const generateLabel =
    selectedProjectIds.size > 0
      ? t("backfillGenerateSelected", { count: selectedProjectIds.size })
      : t("backfillGenerateAll");

  const handleDailyManpowerSaved = useCallback(
    (projectId: string, payload: FieldDailyReportDailyManpowerSavePayload) => {
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          projects: prev.projects.map((project) =>
            project.projectId === projectId
              ? {
                  ...project,
                  dailyManpower: payload.dailyManpower,
                  dailyManpowerMeta: payload.dailyManpowerMeta,
                }
              : project,
          ),
        };
      });
    },
    [],
  );

  const handleSectionNotesChange = useCallback(
    (projectId: string, sectionNotes: FieldDailyReportSectionNoteDto[]) => {
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          projects: prev.projects.map((project) =>
            project.projectId === projectId
              ? {
                  ...project,
                  sectionNotes,
                  comments: sectionNotesToLegacyComments(sectionNotes),
                }
              : project,
          ),
        };
      });
    },
    [],
  );

  return (
    <div style={{ padding: "var(--space-3) var(--space-4)", maxWidth: 960, margin: "0 auto" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backgroundColor: "var(--neutral-100)",
          paddingBottom: "var(--space-2)",
          marginBottom: "var(--space-2)",
        }}
      >
        <h1 style={{ margin: "0 0 10px", fontSize: "var(--text-h2)", fontWeight: 700 }}>{t("title")}</h1>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            aria-label={t("prevDay")}
            onClick={() => setReportDate((d) => shiftDate(d, -1))}
            style={{
              width: 36,
              height: 36,
              border: "1px solid var(--neutral-200)",
              borderRadius: "var(--radius-sm)",
              background: "var(--neutral-0)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <input
            type="date"
            value={reportDate}
            max={today}
            onChange={(e) => {
              const next = clampReportDateToToday(e.target.value);
              if (next) setReportDate(next);
            }}
            aria-label={t("pickDateAria")}
            style={{
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 8px",
              fontSize: "var(--text-body)",
              fontWeight: 600,
              color: "var(--neutral-900)",
              background: "var(--neutral-0)",
              minWidth: 140,
            }}
          />
          <button
            type="button"
            aria-label={t("nextDay")}
            disabled={!canGoNext}
            onClick={() => {
              if (!canGoNext) return;
              setReportDate((d) => shiftDate(d, 1));
            }}
            style={{
              width: 36,
              height: 36,
              border: "1px solid var(--neutral-200)",
              borderRadius: "var(--radius-sm)",
              background: "var(--neutral-0)",
              cursor: canGoNext ? "pointer" : "not-allowed",
              opacity: canGoNext ? 1 : 0.4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>

      {canGenerateReport && (
        <div
          style={{
            marginBottom: "var(--space-3)",
            border: "1px solid var(--neutral-200)",
            borderRadius: "var(--radius-md)",
            background: "var(--neutral-0)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            onClick={() => setBackfillExpanded((v) => !v)}
            aria-expanded={backfillExpanded}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div
              style={{
                borderRadius: "var(--radius-sm)",
                padding: 8,
                background: "var(--primary-100)",
                flexShrink: 0,
              }}
            >
              <Sparkles size={14} style={{ color: "var(--primary-600)" }} aria-hidden />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "var(--text-body)", color: "var(--neutral-900)" }}>
                {t("backfillTitle")}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
                {t("backfillDescription")}
              </p>
            </div>
            {backfillExpanded ? (
              <ChevronUp size={18} style={{ color: "var(--neutral-500)", flexShrink: 0 }} aria-hidden />
            ) : (
              <ChevronDown size={18} style={{ color: "var(--neutral-500)", flexShrink: 0 }} aria-hidden />
            )}
          </button>

          {backfillExpanded && (
            <div style={{ padding: "0 12px 12px", borderTop: "1px solid var(--neutral-100)" }}>
              <p
                style={{
                  margin: "10px 0 6px",
                  fontSize: "var(--text-caption)",
                  fontWeight: 600,
                  color: "var(--neutral-700)",
                }}
              >
                {t("backfillSelectProjects")}
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={selectAllProjects}
                  disabled={backfillProjectsLoading || backfillProjects.length === 0}
                  style={{
                    padding: "4px 8px",
                    border: "none",
                    background: "transparent",
                    color: "var(--primary-600)",
                    fontWeight: 600,
                    fontSize: "var(--text-caption)",
                    cursor: "pointer",
                  }}
                >
                  {t("backfillSelectAll")}
                </button>
                <button
                  type="button"
                  onClick={clearProjectSelection}
                  disabled={selectedProjectIds.size === 0}
                  style={{
                    padding: "4px 8px",
                    border: "none",
                    background: "transparent",
                    color: "var(--primary-600)",
                    fontWeight: 600,
                    fontSize: "var(--text-caption)",
                    cursor: "pointer",
                  }}
                >
                  {t("backfillSelectNone")}
                </button>
              </div>

              {backfillProjectsLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--neutral-500)",
                    fontSize: "var(--text-caption)",
                    marginBottom: 10,
                  }}
                >
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  {t("backfillProjectsLoading")}
                </div>
              ) : backfillProjects.length === 0 ? (
                <p style={{ margin: "0 0 10px", fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
                  {t("noActivity")}
                </p>
              ) : (
                <ul
                  style={{
                    margin: "0 0 10px",
                    padding: 0,
                    listStyle: "none",
                    maxHeight: 180,
                    overflowY: "auto",
                    border: "1px solid var(--neutral-100)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  {backfillProjects.map((project) => {
                    const checked = selectedProjectIds.has(project.id);
                    return (
                      <li key={project.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            cursor: "pointer",
                            fontSize: "var(--text-caption)",
                            color: "var(--neutral-800)",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProjectSelection(project.id)}
                          />
                          <span style={{ minWidth: 0 }}>{project.projectName}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              <button
                type="button"
                onClick={() => void generateReport()}
                disabled={generating}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "var(--primary-700)",
                  color: "var(--neutral-0)",
                  fontWeight: 600,
                  fontSize: "var(--text-caption)",
                  cursor: generating ? "not-allowed" : "pointer",
                  opacity: generating ? 0.7 : 1,
                }}
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                    {t("generating")}
                  </>
                ) : (
                  <>
                    <Sparkles size={14} aria-hidden />
                    {generateLabel}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && report && report.projects.length > 0 && (
        <div
          style={{
            marginBottom: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                flex: "1 1 180px",
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                background: "var(--neutral-0)",
              }}
            >
              <Search size={16} style={{ color: "var(--neutral-500)", flexShrink: 0 }} aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("filterSearchPlaceholder")}
                aria-label={t("filterSearchAria")}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: "var(--text-body)",
                  color: "var(--neutral-900)",
                }}
              />
            </div>
            <div
              role="group"
              aria-label={t("filterActivityAria")}
              style={{
                display: "inline-flex",
                border: "1px solid var(--neutral-300)",
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {(["all", "withChanges"] as const).map((value) => {
                const selected = activityFilter === value;
                const label = value === "all" ? t("filterAllProjects") : t("filterWithChanges");
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActivityFilter(value)}
                    style={{
                      padding: "6px 10px",
                      border: "none",
                      borderRight: value === "all" ? "1px solid var(--neutral-300)" : "none",
                      background: selected ? "var(--primary-100)" : "var(--neutral-0)",
                      color: selected ? "var(--primary-700)" : "var(--neutral-700)",
                      fontWeight: 600,
                      fontSize: "var(--text-caption)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {filtersActive && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-caption)",
                  color: "var(--neutral-600)",
                }}
              >
                {t("filterResultsCount", {
                  shown: filteredProjects.length,
                  total: allProjects.length,
                })}
              </p>
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  padding: "2px 0",
                  border: "none",
                  background: "transparent",
                  color: "var(--primary-600)",
                  fontWeight: 600,
                  fontSize: "var(--text-caption)",
                  cursor: "pointer",
                }}
              >
                {t("filterClear")}
              </button>
            </div>
          )}
        </div>
      )}

      {loading && <FieldDailyReportSkeleton loadingLabel={t("loading")} />}

      {!loading && (!report || report.projects.length === 0) && (
        <div style={{ padding: "var(--space-4) 0", color: "var(--neutral-600)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-body)" }}>{t("noReportsGenerated")}</p>
        </div>
      )}

      {!loading && report && report.projects.length > 0 && filteredProjects.length === 0 && (
        <div style={{ padding: "var(--space-3) 0", color: "var(--neutral-600)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-body)" }}>{t("filterNoResults")}</p>
          <button
            type="button"
            onClick={clearFilters}
            style={{
              marginTop: 8,
              padding: "4px 0",
              border: "none",
              background: "transparent",
              color: "var(--primary-600)",
              fontWeight: 600,
              fontSize: "var(--text-caption)",
              cursor: "pointer",
            }}
          >
            {t("filterClear")}
          </button>
        </div>
      )}

      {!loading && report && report.projects.length > 0 && filteredProjects.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredProjects.map((project) => (
            <FieldDailyReportProjectSection
              key={project.projectId}
              project={project}
              reportDate={reportDate}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              editable={canGenerateReport}
              onDailyManpowerSaved={(payload) =>
                handleDailyManpowerSaved(project.projectId, payload)
              }
              onSectionNotesChange={(sectionNotes) =>
                handleSectionNotesChange(project.projectId, sectionNotes)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
