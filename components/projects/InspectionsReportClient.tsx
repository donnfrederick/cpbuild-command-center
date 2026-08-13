"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, startTransition } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck, Download, Eye, FileDown, Filter, FilterX, Loader2, CheckCircle2, CheckSquare, X, XCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { FieldLogExportSelectionBar } from "@/components/projects/FieldLogExportSelectionBar";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isMobilePdfDelivery,
} from "@/lib/deliver-pdf-blob";
import { ToolbarActionButton } from "@/components/shared/ToolbarActionButton";
import {
  BuildingLevelFilterSection,
  type BuildingLevelFilterOptions,
  type BuildingLevelFilterValue,
} from "@/components/shared/BuildingLevelFilterSection";
import { InspectionReportTableSkeleton } from "@/components/reports/InspectionReportTableSkeleton";
import { InspectionFillOverlay } from "@/components/projects/inspections/InspectionFillOverlay";
import { ShareOnlyFailedItemsToggle } from "@/components/projects/inspections/ShareOnlyFailedItemsToggle";
import { get as getInspectionSubmission, type InspectionSubmission } from "@/lib/inspections/submissionsApi";
import { Link } from "@/i18n/navigation";
import { buildInspectionsReportFromGlobalSubmissions } from "@/lib/inspections/build-global-inspections-report-view";
import { deficiencySeverityModifier, type DeficiencySeverity } from "@/components/forms/formTypes";
import {
  inspectionReportEntryTone,
  inspectorDisplayName,
  inspectorInitials,
  mobileInspectionTypeLabel,
  reportRowLocationLabel,
  subcontractorDisplayName,
} from "@/lib/inspections/inspection-report-mobile";
import { filterSubmissionsForFailedOnlyExport } from "@/lib/inspections/inspection-failed-items-export";
import type {
  InspectionsReport,
  SubmissionRow,
  SectionResult,
} from "@/app/api/projects/[id]/inspections-report/route";
import { readSnapshotModule } from "@/lib/offline/snapshot-cache";
import { useRegisterOfflineCacheView } from "@/hooks/use-register-offline-cache-view";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import {
  allInspectionScopeCodes,
  applyInspectionReportClientFilters,
  buildInspectionReportLocationFilterOptions,
  collectCalibrationFilterValues,
  collectInspectionTypeCodes,
  collectSubmissionIMNames,
  collectSubmissionInspectorNames,
  collectSubmissionPMNames,
  computeInspectionReportStats,
  countInspectionReportFilterBadge,
  defaultInspectionReportSortDir,
  flattenInspectionReportSubmissions,
  formatSubmissionLocationSubtext,
  hasActiveInspectionReportLocationFilters,
  hasActiveInspectionReportClientFilters,
  detectInspectionReportQuickFilter,
  inspectionReportQuickFilterPatch,
  INSPECTION_REPORT_RECORD_CALIBRATION,
  inspectionTypeFilterLabel,
  isAllScopeCodesSelected,
  isUnsetOrAllSelected,
  matchesMultiSelectFilter,
  personFilterOptionLabel,
  scopeSelectionLabel,
  sortInspectionReportRows,
  submissionIMName,
  submissionInspectorName,
  submissionInstallerName,
  submissionCalibrationFilterValue,
  submissionPhase,
  submissionPMName,
  type InspectionReportClientFilters,
  type InspectionReportSortDir,
  type InspectionReportSortKey,
  type InspectionReportSubmissionRow,
} from "@/lib/inspections/inspection-report-filters";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateInput(iso: string) { return iso.slice(0, 10); }
function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface InspectionCsvLabels {
  inspNum: string;
  project: string;
  date: string;
  unit: string;
  building: string;
  level: string;
  inspectionType: string;
  attempt: string;
  im: string;
  inspector: string;
  subcontractor: string;
  result: string;
  totalDeficiencies: string;
  section: string;
  question: string;
  deficiency: string;
  count: string;
  severity: string;
  calibration: string;
}

function buildCsv(
  submissions: SubmissionRow[],
  includeProject: boolean,
  labels: InspectionCsvLabels,
  shareOnlyFailedItems: boolean,
): string {
  const HDR = [
    labels.inspNum,
    ...(includeProject ? [labels.project] : []),
    labels.date,
    labels.unit,
    labels.building,
    labels.level,
    labels.inspectionType,
    labels.attempt,
    labels.im,
    labels.inspector,
    labels.subcontractor,
    labels.result,
    labels.totalDeficiencies,
    labels.section,
    labels.question,
    labels.deficiency,
    labels.count,
    labels.severity,
  ];
  const rows: string[][] = [HDR];

  for (const sub of submissions) {
    const inspector = (sub.submittedByName || "").replace(/^\[Seed\]\s*/i, "");
    const installer = (sub.installTeamName ?? "").replace(/^\[SEED\]\s*/i, "");
    const projectName =
      "projectName" in sub && typeof sub.projectName === "string" ? sub.projectName : "";
    const attemptLabel = sub.isCalibration
      ? labels.calibration
      : sub.attemptNumber != null
        ? `#${sub.attemptNumber}`
        : "";
    const base = [
      String(sub.seqNumber),
      ...(includeProject ? [projectName] : []),
      fmt(sub.submittedAt),
      sub.unit, sub.building, sub.level,
      sub.inspectionTypeName || "",
      attemptLabel,
      sub.imName ?? "", inspector, installer, sub.outcome, String(sub.totalDeficiencies),
    ];

    let hadDetailRow = false;
    for (const sec of sub.sections) {
      const questions = shareOnlyFailedItems ? sec.failingQuestions : sec.questions;
      if (questions.length === 0) continue;

      for (const q of questions) {
        if (q.passed) {
          rows.push([...base, sec.sectionTitle, q.questionTitle, "", "", ""]);
          hadDetailRow = true;
          continue;
        }
        if (q.deficiencies.length === 0) {
          rows.push([...base, sec.sectionTitle, q.questionTitle, "", "", ""]);
          hadDetailRow = true;
        } else {
          for (const d of q.deficiencies) {
            rows.push([...base, sec.sectionTitle, q.questionTitle, d.description, String(d.count), d.severity ?? ""]);
            hadDetailRow = true;
          }
        }
      }
    }

    if (!hadDetailRow && !shareOnlyFailedItems) {
      rows.push([...base, "", "", "", "", ""]);
    }
  }

  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function dlCsv(content: string, name: string) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "text/csv" })),
    download: name,
  });
  a.click(); URL.revokeObjectURL(a.href);
}

type InspectionExportStep = "gathering" | "photos" | "rendering" | "finalizing" | "done";

function InspectionExportProgressOverlay({
  step,
  recordCount,
  onSavePdf,
  savePdfLabel,
  savePdfHint,
  onCancel,
  cancelLabel,
}: {
  step: InspectionExportStep;
  recordCount: number;
  /** Mobile: fresh tap to share/open after async generation (iOS requires user gesture). */
  onSavePdf?: () => void;
  savePdfLabel?: string;
  savePdfHint?: string;
  /** Abort an in-progress export (hidden when PDF is ready). */
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const t = useTranslations("inspections");
  const exportSteps: Array<{ id: InspectionExportStep; label: string; detail: string }> = [
    {
      id: "gathering",
      label: t("reportExportStepGatheringLabel"),
      detail: t("reportExportStepGatheringDetail"),
    },
    {
      id: "photos",
      label: t("reportExportStepPhotosLabel"),
      detail: t("reportExportStepPhotosDetail"),
    },
    {
      id: "rendering",
      label: t("reportExportStepRenderingLabel"),
      detail: t("reportExportStepRenderingDetail"),
    },
    {
      id: "finalizing",
      label: t("reportExportStepFinalizingLabel"),
      detail: t("reportExportStepFinalizingDetail"),
    },
    {
      id: "done",
      label: t("reportExportStepDoneLabel"),
      detail: t("reportExportStepDoneDetail"),
    },
  ];
  const stepOrder: InspectionExportStep[] = ["gathering", "photos", "rendering", "finalizing", "done"];
  const currentIdx = stepOrder.indexOf(step);
  const isDone = step === "done";
  const current = exportSteps.find((s) => s.id === step)!;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t("reportExportPdfBusyAria")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.55))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--neutral-0)",
          borderRadius: 16,
          padding: "32px 28px",
          maxWidth: 400,
          width: "100%",
          boxShadow: "var(--shadow-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {isDone ? (
            <CheckCircle2 size={28} style={{ color: "var(--success-600, #16a34a)", flexShrink: 0 }} />
          ) : (
            <Loader2 size={28} className="animate-spin" style={{ color: "var(--primary-600)", flexShrink: 0 }} />
          )}
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)" }}>
              {current.label}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--neutral-500)" }}>
              {t("reportExportRecordCount", { count: recordCount })}
            </p>
          </div>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--neutral-600)", lineHeight: 1.5 }}>
          {isDone && onSavePdf && savePdfHint ? savePdfHint : current.detail}
        </p>
        {isDone && onSavePdf && savePdfLabel && (
          <button
            type="button"
            onClick={onSavePdf}
            style={{
              width: "100%",
              marginBottom: 16,
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
        <div style={{ display: "flex", gap: 6 }}>
          {stepOrder.slice(0, -1).map((s, i) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background:
                  i < currentIdx
                    ? "var(--primary-600)"
                    : i === currentIdx
                      ? "var(--primary-400)"
                      : "var(--neutral-200)",
              }}
            />
          ))}
        </div>
        {!isDone && onCancel && cancelLabel ? (
          <button
            type="button"
            onClick={onCancel}
            style={{
              width: "100%",
              marginTop: 16,
              padding: "10px 12px",
              border: "1.5px solid var(--neutral-300)",
              borderRadius: 8,
              background: "var(--neutral-0)",
              color: "var(--neutral-700)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function InspectionReportExportMenu({
  disabled,
  pdfDisabled = false,
  onExportCsv,
  onExportPdf,
  shareOnlyFailedItems,
  onShareOnlyFailedItemsChange,
  compact = false,
}: {
  disabled: boolean;
  pdfDisabled?: boolean;
  onExportCsv: () => void;
  onExportPdf: () => void;
  shareOnlyFailedItems: boolean;
  onShareOnlyFailedItemsChange: (checked: boolean) => void;
  /** Icon-only trigger for mobile toolbar (menu items keep labels). */
  compact?: boolean;
}) {
  const t = useTranslations("inspections");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "10px 14px",
    border: "none",
    background: "none",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--neutral-800)",
    cursor: disabled ? "not-allowed" : "pointer",
    textAlign: "left",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={compact ? t("reportExportMenuAria") : undefined}
        title={compact ? t("reportExportMenu") : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: compact ? 0 : 5,
          padding: compact ? "8px 10px" : "6px 13px",
          background: "var(--neutral-900)",
          color: "var(--neutral-0)",
          border: "none",
          borderRadius: 7,
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          whiteSpace: "nowrap",
          minWidth: compact ? 40 : undefined,
          minHeight: compact ? 40 : undefined,
        }}
      >
        <Download size={compact ? 16 : 13} aria-hidden />
        {!compact && (
          <>
            {t("reportExportMenu")}
            <ChevronDown size={13} aria-hidden />
          </>
        )}
      </button>
      {open && !disabled && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 180,
            background: "var(--neutral-0)",
            border: "1px solid var(--neutral-200)",
            borderRadius: 10,
            boxShadow: "var(--shadow-2)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div style={{ borderBottom: "1px solid var(--neutral-100)" }}>
            <ShareOnlyFailedItemsToggle
              id={compact ? "inspections-report-share-failed-mobile" : "inspections-report-share-failed"}
              checked={shareOnlyFailedItems}
              onChange={onShareOnlyFailedItemsChange}
            />
          </div>
          <button
            type="button"
            role="menuitem"
            style={itemStyle}
            onClick={() => {
              setOpen(false);
              onExportCsv();
            }}
          >
            <FileDown size={14} aria-hidden />
            {t("reportExportCsv")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={disabled || pdfDisabled}
            style={{
              ...itemStyle,
              borderTop: "1px solid var(--neutral-100)",
              opacity: disabled || pdfDisabled ? 0.5 : 1,
            }}
            onClick={() => {
              if (disabled || pdfDisabled) return;
              setOpen(false);
              onExportPdf();
            }}
          >
            <FileDown size={14} aria-hidden />
            {t("reportExportPdf")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Outcome badge ────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome, compact = false }: { outcome: string; compact?: boolean }) {
  const t = useTranslations("inspections");
  const pass = outcome === "PASS";
  const iconSize = compact ? 11 : 12;
  return (
    <span
      className={compact ? "inspection-report-entry__outcome" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 3 : 5,
        padding: compact ? "2px 7px" : "3px 10px",
        borderRadius: 999,
        fontSize: compact ? 11 : 12,
        fontWeight: 700,
        lineHeight: 1.2,
        background: pass ? "var(--inspection-pass-bg)" : "var(--inspection-fail-bg)",
        color: pass ? "var(--inspection-pass-fg)" : "var(--inspection-fail-fg)",
        border: `1px solid ${pass ? "var(--success-200, #bbf7d0)" : "var(--error-200, #fecaca)"}`,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {pass ? <CheckCircle2 size={iconSize} aria-hidden /> : <XCircle size={iconSize} aria-hidden />}
      {outcome === "PASS" ? t("headerOutcomePassed") : outcome === "FAIL" ? t("headerOutcomeFailed") : t("recordOutcomeHeading")}
    </span>
  );
}

// ── Section detail (shown when a row is expanded) ────────────────────────────

function SectionDetail({ sections, colSpan }: { sections: SectionResult[]; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <div style={{ background: "#f8faff", borderTop: "1px solid #dbeafe", borderBottom: "2px solid #dbeafe" }}>
          {sections.map((sec, si) => (
            <div
              key={sec.sectionTitle}
              style={{
                borderBottom: si < sections.length - 1 ? "1px solid #e0eaff" : "none",
              }}
            >
              {/* Section header row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 110px 120px",
                alignItems: "center",
                padding: "9px 20px 9px 56px",
                background: sec.passed ? "#f0fdf4" : "#fff7f7",
              }}>
                <span>
                  {sec.passed
                    ? <CheckCircle2 size={15} style={{ color: "#16a34a" }} />
                    : <XCircle size={15} style={{ color: "#dc2626" }} />}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--neutral-800)", letterSpacing: "0.01em" }}>
                  {sec.sectionTitle.trim() || "General"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: sec.passed ? "#15803d" : "#dc2626" }}>
                  {sec.passed ? "Passed" : "Failed"}
                </span>
                <span style={{ fontSize: 12, color: "var(--neutral-500)", textAlign: "right" }}>
                  {sec.totalOccurrences > 0
                    ? <strong style={{ color: "var(--neutral-800)" }}>{sec.totalOccurrences}</strong>
                    : "—"}{" "}
                  {sec.totalOccurrences > 0 ? (sec.totalOccurrences === 1 ? "deficiency" : "deficiencies") : ""}
                </span>
              </div>

              {/* Failing questions within this section */}
              {sec.failingQuestions.map((q, qi) => (
                <div
                  key={qi}
                  style={{
                    padding: "8px 20px 8px 84px",
                    borderTop: "1px solid #fee2e2",
                    background: "#fff5f5",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, whiteSpace: "nowrap", paddingTop: 1 }}>
                      ✗ {q.totalOccurrences} {q.totalOccurrences === 1 ? "occurrence" : "occurrences"}
                    </span>
                    <span
                      title={q.questionTitle}
                      style={{ fontSize: 13, color: "var(--neutral-700)", flex: 1 }}
                    >
                      {q.questionTitle.length > 100 ? q.questionTitle.slice(0, 100) + "…" : q.questionTitle}
                    </span>
                  </div>

                  {/* Deficiency items */}
                  {q.deficiencies.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4, paddingLeft: 80 }}>
                      {q.deficiencies.map((d, di) => (
                        <div key={di} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: d.description.trim() ? "var(--neutral-700)" : "var(--neutral-400)", fontStyle: d.description.trim() ? "normal" : "italic" }}>
                            {d.description.trim() || "No description entered"}
                          </span>
                          {d.count > 1 && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--neutral-500)" }}>×{d.count}</span>
                          )}
                          {d.severity && (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                              background: d.severity === "Critical" ? "#fef2f2" : d.severity === "Major" ? "#fffbeb" : "var(--neutral-100)",
                              color: d.severity === "Critical" ? "#991b1b" : d.severity === "Major" ? "#92400e" : "var(--neutral-600)",
                            }}>
                              {d.severity}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

function MobileSectionDetail({ sections }: { sections: SectionResult[] }) {
  const t = useTranslations("inspections");
  return (
    <div className="ir-mobile-sections">
      {sections.map((sec) => (
        <div
          key={sec.sectionTitle}
          className={`ir-mobile-section ${sec.passed ? "ir-mobile-section--pass" : "ir-mobile-section--fail"}`}
        >
          <div className="ir-mobile-section__head">
            {sec.passed ? <CheckCircle2 size={15} aria-hidden /> : <XCircle size={15} aria-hidden />}
            <span className="ir-mobile-section__title">{sec.sectionTitle.trim() || t("sectionFallbackRecord")}</span>
            <span className="ir-mobile-section__count">
              {sec.totalOccurrences > 0
                ? t("deficiencyCountDisplay", { count: sec.totalOccurrences })
                : t("headerOutcomePassed")}
            </span>
          </div>
          {sec.failingQuestions.length > 0 && (
            <div className="ir-mobile-questions">
              {sec.failingQuestions.map((q, qi) => (
                <div key={qi} className="ir-mobile-question">
                  <p className="ir-mobile-question__title">{q.questionTitle}</p>
                  <p className="ir-mobile-question__meta">
                    {t("deficiencyCountDisplay", { count: q.totalOccurrences })}
                  </p>
                  {q.deficiencies.length > 0 && (
                    <div className="ir-mobile-deficiencies">
                      {q.deficiencies.map((d, di) => (
                        <span key={di} className="ir-mobile-deficiency">
                          {d.description.trim() || t("noDescriptionRecorded")}
                          {d.count > 1 ? ` ×${d.count}` : ""}
                          {d.severity ? (
                            <>
                              {" "}
                              <span
                                className={`deficiency-severity-pill deficiency-severity-pill--${deficiencySeverityModifier(d.severity as DeficiencySeverity)}`}
                              >
                                {d.severity}
                              </span>
                            </>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function InspectionSelectIndicator({ selected }: { selected: boolean }) {
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
      }}
    >
      {selected ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 5L4 7L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

function InspectionsMobileCardList({
  submissions,
  onViewRecord,
  loadingSubmissionId,
  mode = "global",
  selectMode = false,
  selectedIds,
  onToggleSelect,
}: {
  submissions: InspectionReportSubmissionRow[];
  onViewRecord: (submissionId: string) => void;
  loadingSubmissionId: string | null;
  mode?: "global" | "project";
  selectMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (submissionId: string) => void;
}) {
  const t = useTranslations("inspections");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (submissions.length === 0) {
    return (
      <p className="ir-mobile-count" data-testid="inspection-report-mobile-empty">
        {t("reportNoMatch")}
      </p>
    );
  }

  return (
    <div className="ir-mobile-list" data-testid="inspection-report-mobile-list">
      {submissions.map((sub) => {
        const open = expanded.has(sub.submissionId);
        const tone = inspectionReportEntryTone(sub.outcome, sub.isCalibration);
        const recordLoading = loadingSubmissionId === sub.submissionId;
        const locationSubtext = formatSubmissionLocationSubtext(sub);
        const inspectorName = inspectorDisplayName(sub.submittedByName);
        const hasInspector = Boolean(inspectorName);
        const subcontractor = subcontractorDisplayName(sub.installTeamName);
        const typeLabel = mobileInspectionTypeLabel(
          sub.inspectionTypeName,
          sub.inspectionTypeCode,
          t("reportMobileTypeClearInsp"),
        );
        const attemptDate = fmt(sub.submittedAt);
        const attemptPill = sub.isCalibration
          ? t("reportMobileCalibrationPill")
          : sub.attemptNumber != null
            ? t("reportMobileAttemptPill", { number: sub.attemptNumber })
            : null;
        const selected = selectMode && selectedIds?.has(sub.submissionId);

        return (
          <article
            key={sub.submissionId}
            className={`inspection-report-entry inspection-report-entry--${tone}${selected ? " inspection-report-entry--selected" : ""}`}
            data-testid="inspection-report-mobile-card"
            onClick={
              selectMode && onToggleSelect
                ? () => onToggleSelect(sub.submissionId)
                : undefined
            }
            style={selectMode ? { cursor: "pointer" } : undefined}
          >
            <div className="inspection-report-entry__rail" aria-hidden />
            <div className="inspection-report-entry__body">
              {selectMode ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                  <InspectionSelectIndicator selected={Boolean(selected)} />
                </div>
              ) : null}
              <div className="inspection-report-entry__top">
                <div className="inspection-report-entry__identity">
                  <span className="inspection-report-entry__unit">{sub.unit || "—"}</span>
                  {sub.scopeTypeCode ? (
                    <span className="inspection-report-entry__scope">{sub.scopeTypeCode.toUpperCase()}</span>
                  ) : null}
                </div>
                <div className="inspection-report-entry__result-row">
                  <span className="inspection-report-entry__type">{typeLabel}</span>
                  <OutcomeBadge outcome={sub.outcome} compact />
                </div>
              </div>

              {sub.outcome === "FAIL" && sub.totalDeficiencies > 0 ? (
                <p className="inspection-report-entry__deficiencies">
                  {t("reportDeficienciesCount", { count: sub.totalDeficiencies })}
                </p>
              ) : null}

              {locationSubtext ? (
                <p className="inspection-report-entry__location">{locationSubtext}</p>
              ) : null}

              {(attemptPill || attemptDate) ? (
                <div className="inspection-report-entry__attempt-row">
                  {attemptPill ? (
                    <span className="inspection-report-entry__attempt-pill">{attemptPill}</span>
                  ) : null}
                  {attemptDate ? (
                    <span className="inspection-report-entry__attempt-date">{attemptDate}</span>
                  ) : null}
                </div>
              ) : null}

              <div className="inspection-report-entry__footer">
                <div className="inspection-report-entry__inspector">
                  {mode === "project" && !hasInspector ? (
                    <span className="inspection-report-entry__inspector-name inspection-report-entry__inspector-name--muted">
                      {t("reportInspectorUnknown")}
                    </span>
                  ) : (
                    <>
                      <span className="inspection-report-entry__avatar" aria-hidden>
                        {inspectorInitials(sub.submittedByName)}
                      </span>
                      <span className="inspection-report-entry__inspector-name">
                        {inspectorName || "—"}
                      </span>
                    </>
                  )}
                </div>
                <div className="inspection-report-entry__sub-col">
                  <span className="inspection-report-entry__sub">
                    {subcontractor || t("reportNoSubcontractor")}
                  </span>
                  {!selectMode ? (
                  <div className="inspection-report-entry__actions">
                    <button
                      type="button"
                      className="inspection-report-entry__view-record"
                      data-testid="inspection-report-view-record"
                      aria-label={t("scopeViewRecordAria")}
                      disabled={recordLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewRecord(sub.submissionId);
                      }}
                    >
                      {recordLoading ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden />
                      ) : (
                        <Eye size={16} aria-hidden />
                      )}
                      <span className="inspection-report-entry__view-record-label">
                        {t("reportViewFullRecord")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`inspection-report-entry__expand${open ? " inspection-report-entry__expand--open" : ""}`}
                      aria-expanded={open}
                      aria-label={open ? t("reportCollapseDetails") : t("reportExpandDetails")}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(sub.submissionId);
                      }}
                    >
                      <ChevronDown size={16} aria-hidden />
                    </button>
                  </div>
                  ) : null}
                </div>
              </div>

              {!selectMode && open ? (
                <div className="inspection-report-entry__details">
                  <MobileSectionDetail sections={sub.sections} />
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ── Inspections table ─────────────────────────────────────────────────────────

function SortIcon({
  col,
  sortKey,
  sortDir,
}: {
  col: InspectionReportSortKey;
  sortKey: InspectionReportSortKey;
  sortDir: InspectionReportSortDir;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 12,
        flexShrink: 0,
        fontSize: 10,
        opacity: col !== sortKey ? 0.3 : 1,
      }}
    >
      {col !== sortKey ? "↕" : sortDir === "asc" ? "↑" : "↓"}
    </span>
  );
}

function InspectionsTable({ submissions, sortKey, sortDir, onSort, showProjectColumn = false, showImColumn = true, projectColumnLabel, onViewRecord, loadingSubmissionId, selectMode = false, selectedIds, onToggleSelect }: {
  submissions: InspectionReportSubmissionRow[];
  sortKey: InspectionReportSortKey;
  sortDir: InspectionReportSortDir;
  onSort: (col: InspectionReportSortKey) => void;
  showProjectColumn?: boolean;
  showImColumn?: boolean;
  projectColumnLabel?: string;
  onViewRecord: (submissionId: string) => void;
  loadingSubmissionId: string | null;
  selectMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (submissionId: string) => void;
}) {
  const t = useTranslations("inspections");
  const projectHeader = projectColumnLabel ?? t("reportTableColProject");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tableColSpan =
    11 + (showProjectColumn ? 1 : 0) + (showImColumn ? 1 : 0) + (selectMode ? 1 : 0);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const cellPad = "11px 14px";
  const TH: React.CSSProperties = {
    textAlign: "left",
    verticalAlign: "middle",
  };
  const THBtn: React.CSSProperties = {
    margin: 0,
    padding: cellPad,
    border: "none",
    background: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    width: "100%",
    boxSizing: "border-box",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)",
    whiteSpace: "nowrap",
    userSelect: "none",
    textAlign: "inherit",
  };

  return (
    <table style={{ width: "100%", minWidth: showProjectColumn ? (showImColumn ? 1160 : 1060) : showImColumn ? 1060 : 960, borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr style={{ background: "var(--neutral-900)" }}>
          {selectMode ? (
            <th style={{ ...TH, width: 36 }} aria-hidden="true" />
          ) : null}
          <th style={{ ...TH, width: 44 }}>
            <button type="button" style={THBtn} onClick={() => onSort("seqNumber")}>{t("reportTableColSeq")}<SortIcon col="seqNumber" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          {showProjectColumn && (
            <th style={TH}>
              <button type="button" style={THBtn} onClick={() => onSort("project")}>{projectHeader}<SortIcon col="project" sortKey={sortKey} sortDir={sortDir} /></button>
            </th>
          )}
          <th style={TH}>
            <button type="button" style={THBtn} onClick={() => onSort("unit")}>{t("reportTableColUnit")}<SortIcon col="unit" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          <th style={TH}>
            <button type="button" style={THBtn} onClick={() => onSort("attempt")}>{t("reportTableColAttempt")}<SortIcon col="attempt" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          <th style={TH}>
            <button type="button" style={THBtn} onClick={() => onSort("inspectionType")}>{t("reportTableInspectionType")}<SortIcon col="inspectionType" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          <th style={TH}>
            <button type="button" style={THBtn} onClick={() => onSort("scope")}>{t("reportTableColScope")}<SortIcon col="scope" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          {showImColumn ? (
            <th style={TH}>
              <button type="button" style={THBtn} onClick={() => onSort("im")}>{t("reportTableColIm")}<SortIcon col="im" sortKey={sortKey} sortDir={sortDir} /></button>
            </th>
          ) : null}
          <th style={TH}>
            <button type="button" style={THBtn} onClick={() => onSort("inspector")}>{t("reportTableColInspector")}<SortIcon col="inspector" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          <th style={TH}>
            <button type="button" style={THBtn} onClick={() => onSort("subcontractor")}>{t("reportTableColSubcontractor")}<SortIcon col="subcontractor" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          <th style={TH}>
            <button type="button" style={THBtn} onClick={() => onSort("submittedAt")}>{t("reportTableColDate")}<SortIcon col="submittedAt" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          <th style={{ ...TH, textAlign: "center" as const }}>
            <button type="button" style={{ ...THBtn, justifyContent: "center" }} onClick={() => onSort("outcome")}>{t("reportTableColResult")}<SortIcon col="outcome" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          <th style={{ ...TH, textAlign: "right" as const }}>
            <button type="button" style={{ ...THBtn, justifyContent: "flex-end" }} onClick={() => onSort("totalDeficiencies")}>{t("reportTableColDeficiencies")}<SortIcon col="totalDeficiencies" sortKey={sortKey} sortDir={sortDir} /></button>
          </th>
          <th style={{ ...TH, width: 72 }} aria-hidden="true"></th>
        </tr>
      </thead>
      <tbody>
        {submissions.length === 0 && (
          <tr><td colSpan={tableColSpan} style={{ padding: "40px 20px", textAlign: "center", color: "var(--neutral-400)", fontSize: 14 }}>{t("reportNoMatch")}</td></tr>
        )}
        {submissions.map((sub, i) => {
          const open = expanded.has(sub.submissionId);
          const isLast = i === submissions.length - 1;
          const locationSubtext = formatSubmissionLocationSubtext(sub);
          const selected = selectMode && selectedIds?.has(sub.submissionId);
          const TD: React.CSSProperties = {
            padding: cellPad,
            borderBottom: open && !selectMode ? "none" : isLast ? "none" : "1px solid var(--neutral-100)",
            verticalAlign: "middle",
          };
          return (
            <React.Fragment key={sub.submissionId}>
              <tr
                onClick={() => {
                  if (selectMode && onToggleSelect) {
                    onToggleSelect(sub.submissionId);
                    return;
                  }
                  toggle(sub.submissionId);
                }}
                style={{
                  cursor: "pointer",
                  background: selected
                    ? "var(--primary-50)"
                    : open && !selectMode
                      ? "#eef3ff"
                      : i % 2 === 0
                        ? "white"
                        : "var(--neutral-50, #fafafa)",
                  transition: "background 0.1s",
                }}
              >
                {selectMode ? (
                  <td style={TD}>
                    <InspectionSelectIndicator selected={Boolean(selected)} />
                  </td>
                ) : null}
                {/* # */}
                <td style={{ ...TD, color: "var(--neutral-400)", fontWeight: 600, fontSize: 13 }}>
                  {sub.seqNumber}
                </td>

                {showProjectColumn && (
                  <td style={TD}>
                    {sub.projectId ? (
                      <Link
                        href={`/projects/${sub.projectId}/log/inspections`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontWeight: 600, color: "var(--primary-700)", textDecoration: "none" }}
                      >
                        {sub.projectName || "—"}
                      </Link>
                    ) : (
                      sub.projectName || "—"
                    )}
                  </td>
                )}

                {/* Unit */}
                <td style={TD}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, color: "var(--neutral-900)", fontSize: 15 }}>
                        {sub.unit || "—"}
                      </span>
                      {sub.isCalibration && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--primary-700)", background: "var(--primary-50)", borderRadius: 4, padding: "2px 5px", lineHeight: 1.4 }}>
                          {t("reportTableCalibrationAbbrev")}
                        </span>
                      )}
                    </div>
                    {locationSubtext && (
                      <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>
                        {locationSubtext}
                      </span>
                    )}
                  </div>
                </td>

                {/* Attempt */}
                <td style={{ ...TD, whiteSpace: "nowrap" }}>
                  {sub.isCalibration ? (
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#7c3aed", background: "#ede9fe", borderRadius: 4, padding: "2px 6px", lineHeight: 1.4 }}>
                      Calibration
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--neutral-500)" }}>
                      {sub.attemptNumber != null ? `#${sub.attemptNumber}` : "—"}
                    </span>
                  )}
                </td>

                {/* Inspection type */}
                <td style={{ ...TD, color: "var(--neutral-700)", fontSize: 13 }}>
                  {sub.inspectionTypeName || "—"}
                </td>

                {/* Scope */}
                <td style={{ ...TD, color: "var(--neutral-600)", fontSize: 13 }}>{sub.scopeTypeName || "—"}</td>

                {showImColumn ? (
                  <td style={{ ...TD, color: "var(--neutral-600)" }}>{sub.imName || "—"}</td>
                ) : null}

                {/* Inspector */}
                <td style={{ ...TD, color: "var(--neutral-700)" }}>{(sub.submittedByName || "").replace(/^\[Seed\]\s*/i, "") || "—"}</td>

                {/* Installer */}
                <td style={{ ...TD, color: "var(--neutral-600)" }}>{(sub.installTeamName ?? "").replace(/^\[SEED\]\s*/i, "") || "—"}</td>

                {/* Date */}
                <td style={{ ...TD, color: "var(--neutral-500)", whiteSpace: "nowrap" }}>{fmt(sub.submittedAt)}</td>

                {/* Result */}
                <td style={{ ...TD, textAlign: "center" }}>
                  <OutcomeBadge outcome={sub.outcome} />
                </td>

                {/* Deficiencies */}
                <td style={{ ...TD, textAlign: "right" }}>
                  {sub.totalDeficiencies > 0 ? (
                    <span style={{ fontWeight: 800, fontSize: 18, color: sub.outcome === "FAIL" ? "#dc2626" : "var(--neutral-900)" }}>
                      {sub.totalDeficiencies}
                    </span>
                  ) : (
                    <span style={{ color: "var(--neutral-300)", fontSize: 14 }}>—</span>
                  )}
                </td>

                {/* View record + expand */}
                {!selectMode ? (
                <td style={{ ...TD, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <button
                      type="button"
                      data-testid="inspection-report-view-record"
                      aria-label={t("scopeViewRecordAria")}
                      disabled={loadingSubmissionId === sub.submissionId}
                      onClick={() => onViewRecord(sub.submissionId)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                        height: 32,
                        padding: "0 8px 0 6px",
                        border: "none",
                        background: "transparent",
                        color: "var(--primary-700)",
                        cursor: loadingSubmissionId === sub.submissionId ? "wait" : "pointer",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {loadingSubmissionId === sub.submissionId ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden />
                      ) : (
                        <Eye size={16} aria-hidden />
                      )}
                      <span>{t("reportViewFullRecord")}</span>
                    </button>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={open ? t("reportCollapseDetails") : t("reportExpandDetails")}
                      onClick={() => toggle(sub.submissionId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        color: "var(--neutral-400)",
                        cursor: "pointer",
                      }}
                    >
                      {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                    </button>
                  </div>
                </td>
                ) : (
                  <td style={TD} aria-hidden="true" />
                )}
              </tr>

              {!selectMode && open ? <SectionDetail sections={sub.sections} colSpan={tableColSpan} /> : null}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

const IS: React.CSSProperties = {
  padding: "6px 9px",
  fontSize: 13,
  border: "1px solid var(--neutral-200)",
  borderRadius: 7,
  background: "var(--neutral-0)",
  color: "var(--neutral-800)",
};
const DIVIDER = <span style={{ width: 1, height: 20, background: "var(--neutral-200)", flexShrink: 0 }} />;

// ── Filter panel helpers (matches InspectionsLog / ObservationsLog panels) ───

interface MultiSelectFilterOption {
  value: string;
  label: string;
  count: number;
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        border: active ? "2px solid var(--primary-500)" : "1.5px solid var(--neutral-300)",
        backgroundColor: active ? "var(--primary-50)" : "var(--neutral-0)",
        color: active ? "var(--primary-700)" : "var(--neutral-700)",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  );
}

function ReportFilterToggleButton({
  activeFilterCount,
  onClick,
}: {
  activeFilterCount: number;
  onClick: () => void;
}) {
  const t = useTranslations("inspections");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("reportFilterAria")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 34,
        width: 34,
        borderRadius: "var(--radius-sm, 8px)",
        border: activeFilterCount > 0 ? "1.5px solid var(--primary-500)" : "1px solid var(--neutral-300)",
        backgroundColor: activeFilterCount > 0 ? "var(--primary-500)" : "var(--neutral-0)",
        color: activeFilterCount > 0 ? "var(--neutral-0)" : "var(--neutral-700)",
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        transition: "all 0.12s",
      }}
    >
      <Filter size={14} aria-hidden />
      {activeFilterCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            minWidth: 16,
            height: 16,
            borderRadius: 99,
            backgroundColor: "var(--error-600)",
            color: "var(--neutral-0)",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
          }}
        >
          {activeFilterCount}
        </span>
      )}
    </button>
  );
}

function InspectionReportClearFiltersButton({
  onClick,
  variant = "icon",
}: {
  onClick: () => void;
  variant?: "icon" | "text";
}) {
  const t = useTranslations("inspections");

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          marginTop: 10,
          padding: 0,
          border: "none",
          background: "none",
          color: "var(--primary-700)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {t("reportFilterClearAll")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("reportFilterClearAllAria")}
      title={t("reportFilterClearAll")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 34,
        width: 34,
        borderRadius: 14,
        border: "none",
        backgroundColor: "var(--neutral-100)",
        color: "var(--neutral-600)",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <FilterX size={14} aria-hidden />
    </button>
  );
}

function FilterSheetSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--neutral-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {title}
      </p>
      {children}
    </section>
  );
}

function FilterSheetCheckboxList({
  hintWhenAll,
  options,
  selectedValues,
  onChange,
  clearSelectionLabel,
  scrollable = false,
  maxHeight = 220,
}: {
  hintWhenAll: string;
  options: readonly { value: string; label: string; count: number }[];
  selectedValues: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  clearSelectionLabel: string;
  scrollable?: boolean;
  maxHeight?: number;
}) {
  const allValues = options.map((option) => option.value);
  const isNarrowed =
    selectedValues.size > 0 && !isUnsetOrAllSelected(selectedValues, allValues);

  if (options.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {!isNarrowed && (
        <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--neutral-500)" }}>
          {hintWhenAll}
        </p>
      )}
      {isNarrowed && (
        <button
          type="button"
          onClick={() => onChange(new Set())}
          style={{
            alignSelf: "flex-start",
            marginBottom: 4,
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid var(--neutral-300)",
            background: "var(--neutral-0)",
            color: "var(--neutral-700)",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {clearSelectionLabel}
        </button>
      )}
      <div
        style={
          scrollable
            ? {
                maxHeight,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                paddingRight: 2,
              }
            : { display: "flex", flexDirection: "column", gap: 4 }
        }
      >
      {options.map((option) => {
        const checked = selectedValues.has(option.value);
        return (
          <label
            key={option.value || "__unassigned__"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              border: checked ? "1px solid var(--primary-200)" : "1px solid var(--neutral-200)",
              background: checked ? "var(--primary-50)" : "var(--neutral-0)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                const next = new Set(selectedValues);
                if (next.has(option.value)) next.delete(option.value);
                else next.add(option.value);
                onChange(next);
              }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>{option.label}</span>
            <span style={{ color: "var(--neutral-500)", flexShrink: 0 }}>({option.count})</span>
          </label>
        );
      })}
      </div>
    </div>
  );
}

function InspectionReportFilterPanel({
  onClose,
  onClearFilters,
  activeFilterCount,
  canClearFilters,
  fromDate,
  toDate,
  onChangeFromDate,
  onChangeToDate,
  onDateRangeApply,
  filterResult,
  onChangeFilterResult,
  report,
  showProjectFilter,
  projectOptions,
  selectedProjectIds,
  onChangeProjectIds,
  scopeOptions,
  selectedScopeCodes,
  onChangeScopeCodes,
  showImPmFilters,
  imOptions,
  selectedIMs,
  onChangeIMs,
  pmOptions,
  selectedPMs,
  onChangePMs,
  showInspectorFilter,
  inspectorOptions,
  selectedInspectors,
  onChangeInspectors,
  installerOptions,
  selectedInstallers,
  onChangeInstallers,
  selectedInspectionTypeCodes,
  onChangeInspectionTypeCodes,
  inspectionTypeOptions,
  selectedCalibrationModes,
  onChangeCalibrationModes,
  calibrationOptions,
  locationFilterOptions,
  locationFilterValue,
  onChangeLocationFilter,
}: {
  onClose: () => void;
  onClearFilters: () => void;
  activeFilterCount: number;
  canClearFilters: boolean;
  fromDate: string;
  toDate: string;
  onChangeFromDate: (value: string) => void;
  onChangeToDate: (value: string) => void;
  onDateRangeApply: (from: string, to: string) => void;
  filterResult: "all" | "PASS" | "FAIL";
  onChangeFilterResult: (next: "all" | "PASS" | "FAIL") => void;
  report: InspectionsReport | null;
  showProjectFilter: boolean;
  projectOptions: MultiSelectFilterOption[];
  selectedProjectIds: ReadonlySet<string>;
  onChangeProjectIds: (next: Set<string>) => void;
  scopeOptions: MultiSelectFilterOption[];
  selectedScopeCodes: ReadonlySet<string>;
  onChangeScopeCodes: (next: Set<string>) => void;
  showImPmFilters: boolean;
  imOptions: MultiSelectFilterOption[];
  selectedIMs: ReadonlySet<string>;
  onChangeIMs: (next: Set<string>) => void;
  pmOptions: MultiSelectFilterOption[];
  selectedPMs: ReadonlySet<string>;
  onChangePMs: (next: Set<string>) => void;
  showInspectorFilter: boolean;
  inspectorOptions: MultiSelectFilterOption[];
  selectedInspectors: ReadonlySet<string>;
  onChangeInspectors: (next: Set<string>) => void;
  installerOptions: MultiSelectFilterOption[];
  selectedInstallers: ReadonlySet<string>;
  onChangeInstallers: (next: Set<string>) => void;
  selectedInspectionTypeCodes: ReadonlySet<string>;
  onChangeInspectionTypeCodes: (next: Set<string>) => void;
  inspectionTypeOptions: MultiSelectFilterOption[];
  selectedCalibrationModes: ReadonlySet<string>;
  onChangeCalibrationModes: (next: Set<string>) => void;
  calibrationOptions: MultiSelectFilterOption[];
  locationFilterOptions: BuildingLevelFilterOptions;
  locationFilterValue: BuildingLevelFilterValue;
  onChangeLocationFilter: (next: BuildingLevelFilterValue) => void;
}) {
  const t = useTranslations("inspections");
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    closeTimerRef.current = setTimeout(onClose, 260);
  }, [onClose]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, [close]);

  return createPortal(
    <>
      <style>{`
        .irfp-backdrop {
          position: fixed; inset: 0; z-index: 300;
          display: flex; align-items: flex-end;
          transition: background-color 0.26s ease;
        }
        .irfp-sheet {
          width: 100%; max-height: 90vh;
          border-radius: 16px 16px 0 0;
          background: var(--neutral-0);
          transform: translateY(100%);
          transition: transform 0.3s cubic-bezier(0.32,0.72,0,1);
          display: flex; flex-direction: column;
          box-shadow: 0 -4px 32px rgba(0,0,0,0.14);
        }
        .irfp-sheet.irfp-visible { transform: translateY(0); }
        .irfp-handle { display: block; width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 0; flex-shrink: 0; }
        @media (min-width: 640px) {
          .irfp-backdrop { align-items: stretch; justify-content: flex-end; pointer-events: none; }
          .irfp-sheet {
            width: min(420px, 100vw); height: 100%; max-height: 100%;
            border-radius: 0;
            transform: translateX(100%);
            box-shadow: -4px 0 32px rgba(0,0,0,0.12);
            pointer-events: all;
          }
          .irfp-sheet.irfp-visible { transform: translateX(0); }
          .irfp-handle { display: none; }
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("reportFilterAria")}
        className="irfp-backdrop"
        style={{ backgroundColor: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)" }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div
          role="document"
          className={`irfp-sheet${visible ? " irfp-visible" : ""}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="irfp-handle" aria-hidden="true" />

          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--neutral-200)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--neutral-900)" }}>
                  {t("reportFilterTitle")}
                </h2>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--neutral-500)" }}>
                  {t("reportFilterSubtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t("reportFilterCloseAria")}
                style={{ padding: 4, borderRadius: 6, border: "none", backgroundColor: "transparent", cursor: "pointer", color: "var(--neutral-500)" }}
              >
                <X size={18} />
              </button>
            </div>
            {canClearFilters ? (
              <InspectionReportClearFiltersButton onClick={onClearFilters} variant="text" />
            ) : null}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <FilterSheetSection title={t("reportFilterDateTitle")}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      onChangeFromDate(e.target.value);
                      onDateRangeApply(e.target.value, toDate);
                    }}
                    style={{ ...IS, flex: 1, minWidth: 0, boxSizing: "border-box" }}
                    aria-label={t("reportFilterDateFromAria")}
                  />
                  <span style={{ fontSize: 12, color: "var(--neutral-400)", flexShrink: 0 }}>→</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      onChangeToDate(e.target.value);
                      onDateRangeApply(fromDate, e.target.value);
                    }}
                    style={{ ...IS, flex: 1, minWidth: 0, boxSizing: "border-box" }}
                    aria-label={t("reportFilterDateToAria")}
                  />
                </div>
              </FilterSheetSection>

              <FilterSheetSection title={t("reportFilterResultTitle")}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <FilterChip label={t("reportFilterResultAll")} active={filterResult === "all"} onClick={() => onChangeFilterResult("all")} />
                  <FilterChip label={t("headerOutcomePassed")} active={filterResult === "PASS"} onClick={() => onChangeFilterResult("PASS")} />
                  <FilterChip label={t("headerOutcomeFailed")} active={filterResult === "FAIL"} onClick={() => onChangeFilterResult("FAIL")} />
                </div>
              </FilterSheetSection>

              {showProjectFilter && projectOptions.length > 0 && (
                <FilterSheetSection title={t("reportFilterProjectTitle")}>
                  <FilterSheetCheckboxList
                    hintWhenAll={t("reportFilterProjectHint")}
                    clearSelectionLabel={t("reportFilterClearSelection")}
                    options={projectOptions}
                    selectedValues={selectedProjectIds}
                    onChange={onChangeProjectIds}
                    scrollable
                  />
                </FilterSheetSection>
              )}
              {report && scopeOptions.length > 0 && (
                <FilterSheetSection title={t("reportFilterScopeTitle")}>
                  <FilterSheetCheckboxList
                    hintWhenAll={t("reportFilterScopeHint")}
                    clearSelectionLabel={t("reportFilterClearSelection")}
                    options={scopeOptions}
                    selectedValues={selectedScopeCodes}
                    onChange={onChangeScopeCodes}
                  />
                </FilterSheetSection>
              )}
              {locationFilterOptions.buildings.length > 0 && (
                <FilterSheetSection title={t("reportFilterLocationTitle")}>
                  <p
                    style={{
                      margin: "0 0 10px",
                      fontSize: 13,
                      color: "var(--neutral-500)",
                      lineHeight: 1.4,
                    }}
                  >
                    {t("reportFilterLocationHint")}
                  </p>
                  <BuildingLevelFilterSection
                    bare
                    options={locationFilterOptions}
                    value={locationFilterValue}
                    onChange={onChangeLocationFilter}
                  />
                </FilterSheetSection>
              )}
              {showImPmFilters && imOptions.length > 0 && (
                <FilterSheetSection title={t("reportFilterIMTitle")}>
                  <FilterSheetCheckboxList
                    hintWhenAll={t("reportFilterIMHint")}
                    clearSelectionLabel={t("reportFilterClearSelection")}
                    options={imOptions}
                    selectedValues={selectedIMs}
                    onChange={onChangeIMs}
                    scrollable
                  />
                </FilterSheetSection>
              )}
              {showImPmFilters && pmOptions.length > 0 && (
                <FilterSheetSection title={t("reportFilterPMTitle")}>
                  <FilterSheetCheckboxList
                    hintWhenAll={t("reportFilterPMHint")}
                    clearSelectionLabel={t("reportFilterClearSelection")}
                    options={pmOptions}
                    selectedValues={selectedPMs}
                    onChange={onChangePMs}
                    scrollable
                  />
                </FilterSheetSection>
              )}
              {showInspectorFilter && inspectorOptions.length > 0 && (
                <FilterSheetSection title={t("reportFilterInspectorTitle")}>
                  <FilterSheetCheckboxList
                    hintWhenAll={t("reportFilterInspectorHint")}
                    clearSelectionLabel={t("reportFilterClearSelection")}
                    options={inspectorOptions}
                    selectedValues={selectedInspectors}
                    onChange={onChangeInspectors}
                    scrollable
                  />
                </FilterSheetSection>
              )}
              {installerOptions.length > 0 && (
                <FilterSheetSection title={t("reportFilterSubcontractorTitle")}>
                  <FilterSheetCheckboxList
                    hintWhenAll={t("reportFilterSubcontractorHint")}
                    clearSelectionLabel={t("reportFilterClearSelection")}
                    options={installerOptions}
                    selectedValues={selectedInstallers}
                    onChange={onChangeInstallers}
                  />
                </FilterSheetSection>
              )}
              {inspectionTypeOptions.length > 0 && (
                <FilterSheetSection title={t("reportFilterInspectionTypeTitle")}>
                  <FilterSheetCheckboxList
                    hintWhenAll={t("reportFilterInspectionTypeHint")}
                    clearSelectionLabel={t("reportFilterClearSelection")}
                    options={inspectionTypeOptions}
                    selectedValues={selectedInspectionTypeCodes}
                    onChange={onChangeInspectionTypeCodes}
                  />
                </FilterSheetSection>
              )}
              {calibrationOptions.length > 0 && (
                <FilterSheetSection title={t("reportFilterCalibrationTitle")}>
                  <FilterSheetCheckboxList
                    hintWhenAll={t("reportFilterCalibrationHint")}
                    clearSelectionLabel={t("reportFilterClearSelection")}
                    options={calibrationOptions}
                    selectedValues={selectedCalibrationModes}
                    onChange={onChangeCalibrationModes}
                  />
                </FilterSheetSection>
              )}
            </div>
          </div>

          <div style={{ padding: "12px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", borderTop: "1px solid var(--neutral-200)", display: "flex", gap: 10, flexShrink: 0 }}>
            <button
              type="button"
              onClick={onClearFilters}
              disabled={!canClearFilters}
              style={{
                flex: 1,
                height: 40,
                borderRadius: "var(--radius-sm, 8px)",
                border: "1px solid var(--neutral-300)",
                backgroundColor: "var(--neutral-0)",
                color: !canClearFilters ? "var(--neutral-400)" : "var(--neutral-700)",
                fontSize: 14,
                fontWeight: 500,
                cursor: !canClearFilters ? "default" : "pointer",
              }}
            >
              {t("reportFilterClearAll")}
            </button>
            <button
              type="button"
              onClick={close}
              style={{
                flex: 2,
                height: 40,
                borderRadius: "var(--radius-sm, 8px)",
                border: "none",
                backgroundColor: "var(--primary-700)",
                color: "var(--neutral-0)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("reportFilterShowResults")}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ── Quick-filter summary pills (tap to filter pass / fail / calibration) ───────

function inspectionReportQuickFilterPillStyle(
  active: boolean,
  tone: "neutral" | "success" | "error" | "info",
): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    margin: 0,
    minHeight: 32,
    padding: "6px 12px",
    borderRadius: "var(--radius-pill)",
    borderWidth: 1,
    borderStyle: "solid",
    font: "inherit",
    fontSize: 12,
    fontWeight: active ? 700 : 600,
    lineHeight: 1.2,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "background-color 0.15s, border-color 0.15s",
    boxSizing: "border-box",
  };

  if (tone === "success") {
    return {
      ...base,
      borderColor: active ? "var(--success-600)" : "var(--success-300)",
      backgroundColor: active ? "var(--success-100)" : "var(--success-50)",
      color: "var(--success-700)",
    };
  }

  if (tone === "error") {
    return {
      ...base,
      borderColor: active ? "var(--error-600)" : "var(--error-300)",
      backgroundColor: active ? "var(--error-100)" : "var(--error-50)",
      color: "var(--error-700)",
    };
  }

  if (tone === "info") {
    return {
      ...base,
      borderColor: active ? "var(--blue-600)" : "var(--blue-200)",
      backgroundColor: active ? "var(--blue-100)" : "var(--blue-50)",
      color: "var(--blue-700)",
    };
  }

  return {
    ...base,
    borderColor: active ? "var(--neutral-700)" : "var(--neutral-300)",
    backgroundColor: active ? "var(--neutral-100)" : "var(--neutral-0)",
    color: active ? "var(--neutral-900)" : "var(--neutral-700)",
  };
}

function InspectionReportQuickFilterPill({
  label,
  active,
  tone = "neutral",
  onClick,
  ariaLabel,
}: {
  label: string;
  active: boolean;
  tone?: "neutral" | "success" | "error" | "info";
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      style={inspectionReportQuickFilterPillStyle(active, tone)}
    >
      {label}
    </button>
  );
}

function InspectionReportQuickFiltersStrip({
  children,
  statusLabel,
  showClear,
  onClearFilters,
}: {
  children: React.ReactNode;
  statusLabel: string | null;
  showClear: boolean;
  onClearFilters: () => void;
}) {
  const t = useTranslations("inspections");

  return (
    <div className="irf-quick-filters-strip">
      {showClear && statusLabel ? (
        <div className="irf-filter-status-row">
          <span className="irf-filter-status-row__label">{statusLabel}</span>
          <button
            type="button"
            className="irf-filter-status-row__clear"
            onClick={onClearFilters}
            aria-label={t("reportFilterClearAllAria")}
            data-testid="inspection-report-clear-filters-strip"
          >
            {t("reportFilterClearAll")}
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function InspectionReportCountLine({
  stats,
  activeQuickFilter,
  onQuickFilter,
}: {
  stats: ReturnType<typeof computeInspectionReportStats>;
  activeQuickFilter: ReturnType<typeof detectInspectionReportQuickFilter>;
  onQuickFilter: (kind: "all" | "passed" | "failed" | "calibration") => void;
}) {
  const t = useTranslations("inspections");

  function handleQuickFilter(kind: "all" | "passed" | "failed" | "calibration") {
    if (activeQuickFilter === kind) {
      onQuickFilter("all");
      return;
    }
    onQuickFilter(kind);
  }

  if (stats.total === 0) {
    return (
      <p
        className="irf-count-line"
        style={{
          margin: "0 0 10px",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--neutral-500)",
        }}
      >
        {t("reportNoMatch")}
      </p>
    );
  }

  return (
    <div
      className="irf-count-line"
      role="group"
      aria-label={t("reportFilterResultTitle")}
      style={{
        margin: "0 0 10px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
      }}
    >
      <InspectionReportQuickFilterPill
        label={t("reportSummaryAll", { count: stats.total })}
        active={activeQuickFilter === "all"}
        onClick={() => handleQuickFilter("all")}
        ariaLabel={t("reportQuickFilterAllAria", { count: stats.total })}
      />
      <InspectionReportQuickFilterPill
        label={t("reportSummaryPassed", { count: stats.passed })}
        active={activeQuickFilter === "passed"}
        tone="success"
        onClick={() => handleQuickFilter("passed")}
        ariaLabel={t("reportQuickFilterPassedAria", { count: stats.passed })}
      />
      <InspectionReportQuickFilterPill
        label={t("reportSummaryFailed", { count: stats.failed })}
        active={activeQuickFilter === "failed"}
        tone="error"
        onClick={() => handleQuickFilter("failed")}
        ariaLabel={t("reportQuickFilterFailedAria", { count: stats.failed })}
      />
      {stats.calibrations > 0 && (
        <InspectionReportQuickFilterPill
          label={t("reportSummaryCalibrationsShort", { count: stats.calibrations })}
          active={activeQuickFilter === "calibration"}
          tone="info"
          onClick={() => handleQuickFilter("calibration")}
          ariaLabel={t("reportQuickFilterCalibrationAria", { count: stats.calibrations })}
        />
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function InspectionsReportClient(
  props:
    | {
        mode?: "project";
        projectId: string;
        projectName: string;
        projectStartedAt?: string;
      }
    | {
        mode: "global";
        pageTitle: string;
        pageSubtitle: string;
        projectColumnLabel: string;
      }
) {
  const isGlobal = props.mode === "global";
  const projectId = isGlobal ? "" : props.projectId;
  const projectName = isGlobal ? "Global Inspections" : props.projectName;
  const projectStartedAt = isGlobal ? undefined : props.projectStartedAt;
  const t = useTranslations("inspections");
  const tProjects = useTranslations("projects");
  const tUnits = useTranslations("units");
  const tOffline = useTranslations("offlineIndicator");
  const { isOnline } = useOfflineStatus();
  const [report, setReport] = useState<InspectionsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheDate, setCacheDate] = useState<string | null>(null);
  useRegisterOfflineCacheView(isFromCache, cacheDate);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedScopeCodes, setSelectedScopeCodes] = useState<Set<string>>(() => new Set());
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(() => new Set());
  const [selectedIMs, setSelectedIMs] = useState<Set<string>>(() => new Set());
  const [selectedPMs, setSelectedPMs] = useState<Set<string>>(() => new Set());
  const [selectedInspectors, setSelectedInspectors] = useState<Set<string>>(() => new Set());
  const [selectedInstallers, setSelectedInstallers] = useState<Set<string>>(() => new Set());
  const [selectedLocationBuildings, setSelectedLocationBuildings] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedLocationLevels, setSelectedLocationLevels] = useState<Set<string>>(
    () => new Set(),
  );

  // Client-side table filters
  const [filterLocation, setFilterLocation] = useState("");
  const [filterResult, setFilterResult] = useState<"all" | "PASS" | "FAIL">("all");
  const [selectedInspectionTypeCodes, setSelectedInspectionTypeCodes] = useState<Set<string>>(() => new Set());
  const [selectedCalibrationModes, setSelectedCalibrationModes] = useState<Set<string>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportStep, setExportStep] = useState<InspectionExportStep | null>(null);
  const [exportProgressCount, setExportProgressCount] = useState(0);
  const [shareOnlyFailedItems, setShareOnlyFailedItems] = useState(false);
  const [pendingPdf, setPendingPdf] = useState<{ blob: Blob; fileName: string } | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(() => new Set());
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const exporting = exportStep !== null;

  const loadReportRef = useRef<(p: { from?: string; to?: string }) => void>(() => {});
  const mountedRef = useRef(true);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadReport(p: { from?: string; to?: string } = {}) {
      if (!mountedRef.current || cancelled) return;
      setLoading(true);
      setError(null);
      setIsFromCache(false);
      setCacheDate(null);
      try {
        const qs = new URLSearchParams();
        if (p.from) qs.set("from", p.from);
        if (p.to) qs.set("to", p.to);
        const query = qs.toString();
        const url = isGlobal
          ? `/api/reports/global-inspections${query ? `?${query}` : ""}`
          : `/api/projects/${projectId}/inspections-report${query ? `?${query}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load report");
        if (cancelled || !mountedRef.current) return;
        if (isGlobal) {
          const payload = (await res.json()) as {
            submissions: Array<InspectionReportSubmissionRow & { projectId: string; projectName: string }>;
          };
          const data = buildInspectionsReportFromGlobalSubmissions(payload.submissions);
          setReport(data);
        } else {
          const data = (await res.json()) as InspectionsReport;
          setReport(data);
          setSelectedScopeCodes((prev) => {
            const all = new Set(data.scopeTypes.map((scopeType) => scopeType.scopeTypeCode));
            if (prev.size === 0) return all;
            const next = new Set([...prev].filter((code) => all.has(code)));
            return next.size > 0 ? next : all;
          });
        }
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        if (!isGlobal) {
          const cached = await readSnapshotModule<Record<string, InspectionsReport>>(
            "inspections-reports",
            projectId,
          );
          if (cancelled || !mountedRef.current) return;
          const offlineReport = cached?.data?.[projectId];
          if (offlineReport && !p.from && !p.to) {
            setReport(offlineReport);
            setIsFromCache(true);
            setCacheDate(cached.generatedAt);
            setSelectedScopeCodes((prev) => {
              const all = new Set(offlineReport.scopeTypes.map((scopeType) => scopeType.scopeTypeCode));
              if (prev.size === 0) return all;
              const next = new Set([...prev].filter((code) => all.has(code)));
              return next.size > 0 ? next : all;
            });
            return;
          }
        }
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false);
      }
    }

    loadReportRef.current = (p) => {
      void loadReport(p);
    };

    void loadReport({});

    return () => {
      cancelled = true;
    };
  }, [projectId, isGlobal]);

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function trigger(from: string, to: string) {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(
      () => loadReportRef.current({ ...(from ? { from } : {}), ...(to ? { to } : {}) }),
      400,
    );
  }

  const showingAllScopes = useMemo(() => {
    if (!report) return true;
    return isAllScopeCodesSelected(selectedScopeCodes, allInspectionScopeCodes(report.scopeTypes));
  }, [report, selectedScopeCodes]);

  const availableProjects = useMemo(() => {
    if (!isGlobal || !report) return [];
    const map = new Map<string, string>();
    for (const scopeType of report.scopeTypes) {
      for (const submission of scopeType.submissions) {
        const row = submission as InspectionReportSubmissionRow;
        if (row.projectId && row.projectName) {
          map.set(row.projectId, row.projectName);
        }
      }
    }
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, name }));
  }, [isGlobal, report]);

  const allProjectIds = useMemo(
    () => availableProjects.map((project) => project.id),
    [availableProjects]
  );

  const scopeFilteredSubmissions = useMemo(() => {
    if (!report) return [] as InspectionReportSubmissionRow[];
    const allScopeCodes = allInspectionScopeCodes(report.scopeTypes);
    const scopeTypes = isUnsetOrAllSelected(selectedScopeCodes, allScopeCodes)
      ? report.scopeTypes
      : report.scopeTypes.filter((scopeType) => selectedScopeCodes.has(scopeType.scopeTypeCode));
    return scopeTypes.flatMap((scopeType) =>
      scopeType.submissions.map((submission) => ({
        ...(submission as InspectionReportSubmissionRow),
        scopeTypeName: scopeType.scopeTypeName,
        scopeTypeCode: scopeType.scopeTypeCode,
      }))
    );
  }, [report, selectedScopeCodes]);

  const filterSourceSubmissions = useMemo(() => {
    if (allProjectIds.length === 0) return scopeFilteredSubmissions;
    return scopeFilteredSubmissions.filter((submission) =>
      matchesMultiSelectFilter(submission.projectId ?? "", selectedProjectIds, allProjectIds)
    );
  }, [scopeFilteredSubmissions, selectedProjectIds, allProjectIds]);

  const allReportSubmissions = useMemo(() => {
    if (!report) return [] as SubmissionRow[];
    return report.scopeTypes.flatMap((scopeType) => scopeType.submissions);
  }, [report]);

  const locationFilterOptions = useMemo(
    (): BuildingLevelFilterOptions =>
      buildInspectionReportLocationFilterOptions(allReportSubmissions),
    [allReportSubmissions],
  );

  const locationFilterValue = useMemo(
    (): BuildingLevelFilterValue => ({
      buildings: [...selectedLocationBuildings],
      levels: [...selectedLocationLevels],
    }),
    [selectedLocationBuildings, selectedLocationLevels],
  );

  const handleLocationFilterChange = useCallback((next: BuildingLevelFilterValue) => {
    setSelectedLocationBuildings(new Set(next.buildings));
    setSelectedLocationLevels(new Set(next.levels));
  }, []);

  const availableIMs = useMemo(
    () => collectSubmissionIMNames(filterSourceSubmissions),
    [filterSourceSubmissions]
  );

  const availablePMs = useMemo(
    () => collectSubmissionPMNames(filterSourceSubmissions),
    [filterSourceSubmissions]
  );

  const availableInspectors = useMemo(
    () => collectSubmissionInspectorNames(filterSourceSubmissions),
    [filterSourceSubmissions]
  );

  const availableInstallerNames = useMemo(() => {
    const names = new Set(
      filterSourceSubmissions
        .map((submission) => submissionInstallerName(submission))
        .filter(Boolean)
    );
    return [...names].sort();
  }, [filterSourceSubmissions]);

  const availableInspectionTypeCodes = useMemo(
    () => collectInspectionTypeCodes(filterSourceSubmissions),
    [filterSourceSubmissions]
  );

  const availableCalibrationModes = useMemo(
    () => collectCalibrationFilterValues(filterSourceSubmissions),
    [filterSourceSubmissions]
  );

  useEffect(() => {
    setSelectedInspectionTypeCodes((prev) => {
      if (prev.size === 0) return prev;
      return new Set([...prev].filter((code) => availableInspectionTypeCodes.includes(code)));
    });
  }, [availableInspectionTypeCodes]);

  useEffect(() => {
    setSelectedCalibrationModes((prev) => {
      if (prev.size === 0) return prev;
      return new Set([...prev].filter((mode) => availableCalibrationModes.includes(mode)));
    });
  }, [availableCalibrationModes]);

  useEffect(() => {
    setSelectedIMs((prev) => {
      if (prev.size === 0) return prev;
      return new Set([...prev].filter((name) => availableIMs.includes(name)));
    });
  }, [availableIMs]);

  useEffect(() => {
    setSelectedPMs((prev) => {
      if (prev.size === 0) return prev;
      return new Set([...prev].filter((name) => availablePMs.includes(name)));
    });
  }, [availablePMs]);

  useEffect(() => {
    setSelectedInspectors((prev) => {
      if (prev.size === 0) return prev;
      return new Set([...prev].filter((name) => availableInspectors.includes(name)));
    });
  }, [availableInspectors]);

  useEffect(() => {
    setSelectedInstallers((prev) => {
      if (prev.size === 0) return prev;
      return new Set([...prev].filter((name) => availableInstallerNames.includes(name)));
    });
  }, [availableInstallerNames]);

  useEffect(() => {
    setSelectedProjectIds((prev) => {
      if (prev.size === 0) return prev;
      return new Set([...prev].filter((id) => allProjectIds.includes(id)));
    });
  }, [allProjectIds]);

  useEffect(() => {
    setSelectedScopeCodes((prev) => {
      if (!report || prev.size === 0) return prev;
      const allCodes = allInspectionScopeCodes(report.scopeTypes);
      return new Set([...prev].filter((code) => allCodes.includes(code)));
    });
  }, [report]);

  useEffect(() => {
    setSelectedLocationBuildings((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(locationFilterOptions.buildings);
      return new Set([...prev].filter((building) => valid.has(building)));
    });
    setSelectedLocationLevels((prev) => {
      if (prev.size === 0) return prev;
      const validKeys = new Set<string>();
      for (const [building, levels] of Object.entries(locationFilterOptions.buildingLevels)) {
        for (const level of levels) {
          validKeys.add(`${building}::${level}`);
        }
      }
      return new Set([...prev].filter((key) => validKeys.has(key)));
    });
  }, [locationFilterOptions]);

  const clientFilters: InspectionReportClientFilters = useMemo(
    () => ({
      filterResult,
      selectedIMs: isGlobal ? selectedIMs : new Set<string>(),
      allIMs: isGlobal ? availableIMs : [],
      selectedPMs: isGlobal ? selectedPMs : new Set<string>(),
      allPMs: isGlobal ? availablePMs : [],
      selectedInspectors: isGlobal ? new Set<string>() : selectedInspectors,
      allInspectors: isGlobal ? [] : availableInspectors,
      selectedInstallers,
      allInstallers: availableInstallerNames,
      filterLocation,
      selectedBuildings: selectedLocationBuildings,
      selectedLevels: selectedLocationLevels,
      selectedInspectionTypeCodes,
      allInspectionTypeCodes: availableInspectionTypeCodes,
      selectedCalibrationModes,
      allCalibrationModes: availableCalibrationModes,
    }),
    [
      isGlobal,
      filterResult,
      selectedIMs,
      availableIMs,
      selectedPMs,
      availablePMs,
      selectedInspectors,
      availableInspectors,
      selectedInstallers,
      availableInstallerNames,
      filterLocation,
      selectedLocationBuildings,
      selectedLocationLevels,
      selectedInspectionTypeCodes,
      availableInspectionTypeCodes,
      selectedCalibrationModes,
      availableCalibrationModes,
    ]
  );

  const clientFiltersActive = hasActiveInspectionReportClientFilters(clientFilters);

  const filteredCountByScope = useMemo(() => {
    if (!report) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const scopeType of report.scopeTypes) {
      counts.set(
        scopeType.scopeTypeCode,
        applyInspectionReportClientFilters(scopeType.submissions, clientFilters).length
      );
    }
    return counts;
  }, [report, clientFilters]);

  const filteredSubmissions = useMemo(() => {
    if (!report) return [];
    return flattenInspectionReportSubmissions(
      report.scopeTypes,
      clientFilters,
      selectedScopeCodes,
      selectedProjectIds,
      allProjectIds
    );
  }, [report, clientFilters, selectedScopeCodes, selectedProjectIds, allProjectIds]);

  const modalClientFilters: InspectionReportClientFilters = useMemo(
    () => ({
      filterResult: "all",
      selectedIMs: isGlobal ? selectedIMs : new Set<string>(),
      allIMs: isGlobal ? availableIMs : [],
      selectedPMs: isGlobal ? selectedPMs : new Set<string>(),
      allPMs: isGlobal ? availablePMs : [],
      selectedInspectors: isGlobal ? new Set<string>() : selectedInspectors,
      allInspectors: isGlobal ? [] : availableInspectors,
      selectedInstallers,
      allInstallers: availableInstallerNames,
      filterLocation,
      selectedBuildings: selectedLocationBuildings,
      selectedLevels: selectedLocationLevels,
      selectedInspectionTypeCodes,
      allInspectionTypeCodes: availableInspectionTypeCodes,
      selectedCalibrationModes: new Set<string>(),
      allCalibrationModes: availableCalibrationModes,
    }),
    [
      isGlobal,
      selectedIMs,
      availableIMs,
      selectedPMs,
      availablePMs,
      selectedInspectors,
      availableInspectors,
      selectedInstallers,
      availableInstallerNames,
      filterLocation,
      selectedLocationBuildings,
      selectedLocationLevels,
      selectedInspectionTypeCodes,
      availableInspectionTypeCodes,
      availableCalibrationModes,
    ]
  );

  const summarySubmissions = useMemo(() => {
    if (!report) return [];
    return flattenInspectionReportSubmissions(
      report.scopeTypes,
      modalClientFilters,
      selectedScopeCodes,
      selectedProjectIds,
      allProjectIds
    );
  }, [report, modalClientFilters, selectedScopeCodes, selectedProjectIds, allProjectIds]);

  const summaryStats = useMemo(
    () => computeInspectionReportStats(summarySubmissions),
    [summarySubmissions]
  );

  const activeQuickFilter = useMemo(
    () =>
      detectInspectionReportQuickFilter(
        filterResult,
        selectedCalibrationModes,
        availableCalibrationModes
      ),
    [filterResult, selectedCalibrationModes, availableCalibrationModes]
  );

  const applyQuickFilter = useCallback(
    (kind: "all" | "passed" | "failed" | "calibration") => {
      const patch = inspectionReportQuickFilterPatch(kind, availableCalibrationModes);
      setFilterResult(patch.filterResult);
      setSelectedCalibrationModes(patch.selectedCalibrationModes);
    },
    [availableCalibrationModes]
  );

  const scopeSummaryLabel = useMemo(() => {
    if (!report) return undefined;
    return scopeSelectionLabel(report.scopeTypes, selectedScopeCodes);
  }, [report, selectedScopeCodes]);

  const submissionsForProjectCounts = useMemo(
    () =>
      applyInspectionReportClientFilters(
        scopeFilteredSubmissions,
        clientFilters
      ) as InspectionReportSubmissionRow[],
    [scopeFilteredSubmissions, clientFilters]
  );

  const submissionsForIMCounts = useMemo(
    () => applyInspectionReportClientFilters(filterSourceSubmissions, clientFilters, ["im"]),
    [filterSourceSubmissions, clientFilters]
  );

  const submissionsForPMCounts = useMemo(
    () => applyInspectionReportClientFilters(filterSourceSubmissions, clientFilters, ["pm"]),
    [filterSourceSubmissions, clientFilters]
  );

  const submissionsForInspectorCounts = useMemo(
    () => applyInspectionReportClientFilters(filterSourceSubmissions, clientFilters, ["inspector"]),
    [filterSourceSubmissions, clientFilters]
  );

  const submissionsForInstallerCounts = useMemo(
    () => applyInspectionReportClientFilters(filterSourceSubmissions, clientFilters, ["installer"]),
    [filterSourceSubmissions, clientFilters]
  );

  const filteredCountByIM = useMemo(() => {
    const counts = new Map<string, number>();
    for (const submission of submissionsForIMCounts) {
      const name = submissionIMName(submission);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [submissionsForIMCounts]);

  const filteredCountByPM = useMemo(() => {
    const counts = new Map<string, number>();
    for (const submission of submissionsForPMCounts) {
      const name = submissionPMName(submission);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [submissionsForPMCounts]);

  const filteredCountByInspector = useMemo(() => {
    const counts = new Map<string, number>();
    for (const submission of submissionsForInspectorCounts) {
      const name = submissionInspectorName(submission);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [submissionsForInspectorCounts]);

  const filteredCountByInstaller = useMemo(() => {
    const counts = new Map<string, number>();
    for (const submission of submissionsForInstallerCounts) {
      const name = submissionInstallerName(submission);
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [submissionsForInstallerCounts]);

  const filteredCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const submission of submissionsForProjectCounts) {
      const id = submission.projectId ?? "";
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [submissionsForProjectCounts]);

  const projectOptions = useMemo(
    () =>
      availableProjects.map((project) => ({
        value: project.id,
        label: project.name,
        count: filteredCountByProject.get(project.id) ?? 0,
      })),
    [availableProjects, filteredCountByProject]
  );

  const imOptions = useMemo(
    () =>
      availableIMs.map((name) => ({
        value: name,
        label: personFilterOptionLabel(name, t("reportFilterUnassigned")),
        count: filteredCountByIM.get(name) ?? 0,
      })),
    [availableIMs, filteredCountByIM, t]
  );

  const pmOptions = useMemo(
    () =>
      availablePMs.map((name) => ({
        value: name,
        label: personFilterOptionLabel(name, t("reportFilterUnassigned")),
        count: filteredCountByPM.get(name) ?? 0,
      })),
    [availablePMs, filteredCountByPM, t]
  );

  const inspectorOptions = useMemo(
    () =>
      availableInspectors.map((name) => ({
        value: name,
        label: personFilterOptionLabel(name, t("reportFilterUnassigned")),
        count: filteredCountByInspector.get(name) ?? 0,
      })),
    [availableInspectors, filteredCountByInspector, t]
  );

  const installerOptions = useMemo(
    () =>
      availableInstallerNames.map((name) => ({
        value: name,
        label: name,
        count: filteredCountByInstaller.get(name) ?? 0,
      })),
    [availableInstallerNames, filteredCountByInstaller]
  );

  const scopeOptions = useMemo(
    () =>
      (report?.scopeTypes ?? []).map((scopeType) => ({
        value: scopeType.scopeTypeCode,
        label: scopeType.scopeTypeName,
        count: filteredCountByScope.get(scopeType.scopeTypeCode) ?? 0,
      })),
    [report, filteredCountByScope]
  );

  const activeFilterBadgeCount = useMemo(() => {
    if (!report) return 0;
    return countInspectionReportFilterBadge(
      clientFilters,
      selectedScopeCodes,
      allInspectionScopeCodes(report.scopeTypes),
      selectedProjectIds,
      allProjectIds
    );
  }, [report, clientFilters, selectedScopeCodes, selectedProjectIds, allProjectIds]);

  const hasAppliedInspectionFilters = useMemo(
    () =>
      activeFilterBadgeCount > 0
      || Boolean(fromDate)
      || Boolean(toDate)
      || filterLocation.trim().length > 0,
    [activeFilterBadgeCount, fromDate, toDate, filterLocation],
  );

  const submissionsForInspectionTypeCounts = useMemo(
    () =>
      applyInspectionReportClientFilters(filterSourceSubmissions, clientFilters, [
        "inspectionType",
      ]),
    [filterSourceSubmissions, clientFilters]
  );

  const filteredCountByInspectionType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const submission of submissionsForInspectionTypeCounts) {
      const code = submission.inspectionTypeCode;
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }, [submissionsForInspectionTypeCounts]);

  const inspectionTypeOptions = useMemo(
    () =>
      availableInspectionTypeCodes.map((code) => ({
        value: code,
        label: inspectionTypeFilterLabel(code),
        count: filteredCountByInspectionType.get(code) ?? 0,
      })),
    [availableInspectionTypeCodes, filteredCountByInspectionType]
  );

  const submissionsForCalibrationCounts = useMemo(
    () =>
      applyInspectionReportClientFilters(filterSourceSubmissions, clientFilters, [
        "calibration",
      ]),
    [filterSourceSubmissions, clientFilters]
  );

  const filteredCountByCalibrationMode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const submission of submissionsForCalibrationCounts) {
      const mode = submissionCalibrationFilterValue(submission);
      counts.set(mode, (counts.get(mode) ?? 0) + 1);
    }
    return counts;
  }, [submissionsForCalibrationCounts]);

  const calibrationOptions = useMemo(
    () =>
      availableCalibrationModes.map((mode) => ({
        value: mode,
        label:
          mode === INSPECTION_REPORT_RECORD_CALIBRATION
            ? t("reportFilterCalibrationOptionCalibration")
            : t("reportFilterCalibrationOptionInspection"),
        count: filteredCountByCalibrationMode.get(mode) ?? 0,
      })),
    [availableCalibrationModes, filteredCountByCalibrationMode, t]
  );

  const [sortKey, setSortKey] = useState<InspectionReportSortKey>("submittedAt");
  const [sortDir, setSortDir] = useState<InspectionReportSortDir>("desc");

  function cycleSort(col: InspectionReportSortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(defaultInspectionReportSortDir(col));
    }
  }

  const sortedFilteredSubmissions = useMemo(
    () => sortInspectionReportRows(filteredSubmissions, sortKey, sortDir),
    [filteredSubmissions, sortKey, sortDir]
  );

  const sortedSubmissionIdSet = useMemo(
    () => new Set(sortedFilteredSubmissions.map((s) => s.submissionId)),
    [sortedFilteredSubmissions],
  );

  const effectiveSelectedIds = useMemo(
    () => new Set([...selectedSubmissionIds].filter((id) => sortedSubmissionIdSet.has(id))),
    [selectedSubmissionIds, sortedSubmissionIdSet],
  );

  const toggleSelect = useCallback((submissionId: string) => {
    setSelectedSubmissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedSubmissionIds((prev) => {
      const next = new Set(prev);
      for (const sub of sortedFilteredSubmissions) next.add(sub.submissionId);
      return next;
    });
  }, [sortedFilteredSubmissions]);

  const deselectAll = useCallback(() => {
    setSelectedSubmissionIds(new Set());
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedSubmissionIds(new Set());
  }, []);

  const enterSelectMode = useCallback(() => {
    setIsSelectMode(true);
  }, []);

  const [reviewState, setReviewState] = useState<{
    submission: InspectionSubmission;
    index: number;
  } | null>(null);
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);

  const openReviewRecord = useCallback(
    async (submissionId: string) => {
      const index = sortedFilteredSubmissions.findIndex((s) => s.submissionId === submissionId);
      if (index < 0) return;
      startTransition(() => setReviewLoadingId(submissionId));
      try {
        const submission = await getInspectionSubmission(submissionId);
        if (!mountedRef.current) return;
        if (!submission) {
          toast.error(t("reportRecordLoadError"));
          return;
        }
        startTransition(() => setReviewState({ submission, index }));
      } catch {
        if (!mountedRef.current) return;
        toast.error(t("reportRecordLoadError"));
      } finally {
        if (mountedRef.current) {
          startTransition(() => setReviewLoadingId(null));
        }
      }
    },
    [sortedFilteredSubmissions, t],
  );

  const navigateReviewRecord = useCallback(
    async (nextIndex: number) => {
      const row = sortedFilteredSubmissions[nextIndex];
      if (!row) return;
      startTransition(() => setReviewLoadingId(row.submissionId));
      try {
        const submission = await getInspectionSubmission(row.submissionId);
        if (!mountedRef.current) return;
        if (!submission) {
          toast.error(t("reportRecordLoadError"));
          return;
        }
        startTransition(() => setReviewState({ submission, index: nextIndex }));
      } catch {
        if (!mountedRef.current) return;
        toast.error(t("reportRecordLoadError"));
      } finally {
        if (mountedRef.current) {
          startTransition(() => setReviewLoadingId(null));
        }
      }
    },
    [sortedFilteredSubmissions, t],
  );

  const reviewRow = reviewState
    ? sortedFilteredSubmissions[reviewState.index]
    : undefined;

  const clearAllFilters = useCallback(() => {
    setFilterResult("all");
    setFilterLocation("");
    setFromDate("");
    setToDate("");
    setSelectedScopeCodes(new Set());
    setSelectedProjectIds(new Set());
    setSelectedIMs(new Set());
    setSelectedPMs(new Set());
    setSelectedInspectors(new Set());
    setSelectedInstallers(new Set());
    setSelectedLocationBuildings(new Set());
    setSelectedLocationLevels(new Set());
    setSelectedInspectionTypeCodes(new Set());
    setSelectedCalibrationModes(new Set());
    if (debRef.current) clearTimeout(debRef.current);
    loadReportRef.current({});
  }, []);

  const exportCsv = useCallback(() => {
    if (!report || sortedFilteredSubmissions.length === 0) return;
    const submissionsForExport = filterSubmissionsForFailedOnlyExport(
      sortedFilteredSubmissions,
      shareOnlyFailedItems,
    );
    if (submissionsForExport.length === 0) {
      toast.error(t("reportExportNoFailedItems"));
      return;
    }
    const csvLabels: InspectionCsvLabels = {
      inspNum: t("reportCsvColInspNum"),
      project: t("reportTableColProject"),
      date: t("reportTableColDate"),
      unit: t("reportTableColUnit"),
      building: t("reportCsvColBuilding"),
      level: t("reportCsvColLevel"),
      inspectionType: t("reportCsvColInspectionType"),
      attempt: t("reportTableColAttempt"),
      im: t("reportTableColIm"),
      inspector: t("reportTableColInspector"),
      subcontractor: t("reportTableColSubcontractor"),
      result: t("reportCsvColInspResult"),
      totalDeficiencies: t("reportCsvColTotalDeficiencies"),
      section: t("reportCsvColSection"),
      question: t("reportCsvColQuestion"),
      deficiency: t("reportCsvColDeficiency"),
      count: t("reportCsvColCount"),
      severity: t("reportCsvColSeverity"),
      calibration: t("reportFilterCalibrationOptionCalibration"),
    };
    dlCsv(
      buildCsv(submissionsForExport, isGlobal, csvLabels, shareOnlyFailedItems),
      `${projectName.replace(/\s+/g, "_")}_inspections_${toDate || toDateInput(new Date().toISOString())}.csv`
    );
  }, [report, sortedFilteredSubmissions, projectName, toDate, isGlobal, shareOnlyFailedItems, t]);

  const exportFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filterResult !== "all") parts.push(filterResult === "PASS" ? "Passed only" : "Failed only");
    if (fromDate || toDate) {
      parts.push(`${fromDate || "…"} → ${toDate || "…"}`);
    }
    if (filterLocation.trim()) parts.push(`Search: ${filterLocation.trim()}`);
    if (hasActiveInspectionReportLocationFilters(selectedLocationBuildings, selectedLocationLevels)) {
      const locationParts: string[] = [];
      if (selectedLocationBuildings.size > 0) {
        locationParts.push(
          `${selectedLocationBuildings.size} building${selectedLocationBuildings.size === 1 ? "" : "s"}`,
        );
      }
      if (selectedLocationLevels.size > 0) {
        locationParts.push(
          `${selectedLocationLevels.size} level${selectedLocationLevels.size === 1 ? "" : "s"}`,
        );
      }
      parts.push(`Location: ${locationParts.join(", ")}`);
    }
    if (scopeSummaryLabel && !showingAllScopes) parts.push(`Scopes: ${scopeSummaryLabel}`);
    if (isGlobal && !isUnsetOrAllSelected(selectedProjectIds, allProjectIds)) {
      parts.push(`${selectedProjectIds.size} project${selectedProjectIds.size === 1 ? "" : "s"}`);
    }
    if (isGlobal && !isUnsetOrAllSelected(selectedIMs, availableIMs)) {
      parts.push(`${selectedIMs.size} IM${selectedIMs.size === 1 ? "" : "s"}`);
    }
    if (isGlobal && !isUnsetOrAllSelected(selectedPMs, availablePMs)) {
      parts.push(`${selectedPMs.size} PM${selectedPMs.size === 1 ? "" : "s"}`);
    }
    if (!isGlobal && !isUnsetOrAllSelected(selectedInspectors, availableInspectors)) {
      parts.push(
        `${selectedInspectors.size} inspector${selectedInspectors.size === 1 ? "" : "s"}`
      );
    }
    if (!isUnsetOrAllSelected(selectedInstallers, availableInstallerNames)) {
      parts.push(`${selectedInstallers.size} subcontractor${selectedInstallers.size === 1 ? "" : "s"}`);
    }
    if (!isUnsetOrAllSelected(selectedInspectionTypeCodes, availableInspectionTypeCodes)) {
      parts.push("Filtered by inspection type");
    }
    if (!isUnsetOrAllSelected(selectedCalibrationModes, availableCalibrationModes)) {
      parts.push("Filtered by calibration");
    }
    return parts.join(" · ") || "All inspections in view";
  }, [
    filterResult,
    fromDate,
    toDate,
    filterLocation,
    selectedLocationBuildings,
    selectedLocationLevels,
    scopeSummaryLabel,
    showingAllScopes,
    isGlobal,
    selectedProjectIds,
    allProjectIds,
    selectedIMs,
    availableIMs,
    selectedPMs,
    availablePMs,
    selectedInspectors,
    availableInspectors,
    selectedInstallers,
    availableInstallerNames,
    selectedInspectionTypeCodes,
    availableInspectionTypeCodes,
    selectedCalibrationModes,
    availableCalibrationModes,
  ]);

  const clearExportTimers = useCallback(() => {
    exportTimersRef.current.forEach(clearTimeout);
    exportTimersRef.current = [];
  }, []);

  const handleCancelExport = useCallback(() => {
    clearExportTimers();
    exportAbortRef.current?.abort();
    exportAbortRef.current = null;
    setExportStep(null);
    setPendingPdf(null);
  }, [clearExportTimers]);

  const exportPdf = useCallback(async (selectedIds?: string[]) => {
    if (exportStep) return;

    const isSelectionExport = selectedIds !== undefined;
    if (isSelectionExport && selectedIds.length === 0) {
      toast.error(t("reportExportSelectedNone"));
      return;
    }

    const sourceSubmissions = isSelectionExport
      ? sortedFilteredSubmissions.filter((s) => selectedIds.includes(s.submissionId))
      : sortedFilteredSubmissions;

    if (sourceSubmissions.length === 0) return;
    if (!isOnline) {
      toast.error(tOffline("offlineActionUnavailable"));
      return;
    }

    const submissionsForExport = filterSubmissionsForFailedOnlyExport(
      sourceSubmissions,
      shareOnlyFailedItems,
    );
    if (submissionsForExport.length === 0) {
      toast.error(t("reportExportNoFailedItems"));
      return;
    }

    setExportProgressCount(submissionsForExport.length);
    setExportStep("gathering");
    setPendingPdf(null);

    exportAbortRef.current?.abort();
    const abortController = new AbortController();
    exportAbortRef.current = abortController;

    clearExportTimers();
    exportTimersRef.current.push(setTimeout(() => setExportStep("photos"), 3_000));
    exportTimersRef.current.push(setTimeout(() => setExportStep("rendering"), 10_000));
    exportTimersRef.current.push(setTimeout(() => setExportStep("finalizing"), 22_000));

    const records = submissionsForExport.map((sub) => ({
      submissionId: sub.submissionId,
      seqNumber: sub.seqNumber,
      scopeTypeName: sub.scopeTypeName,
      unit: sub.unit,
      building: sub.building,
      level: sub.level,
      area: sub.area,
      phase: submissionPhase(sub),
      imName: sub.imName,
      installTeamName: sub.installTeamName,
      inspectionTypeName: sub.inspectionTypeName,
      attemptLabel: sub.isCalibration
        ? "Calibration"
        : sub.attemptNumber === 1
          ? "1st attempt"
          : sub.attemptNumber === 2
            ? "2nd attempt"
            : sub.attemptNumber === 3
              ? "3rd attempt"
              : sub.attemptNumber != null
                ? `Attempt #${sub.attemptNumber}`
                : "Inspection",
      totalDeficiencies: sub.totalDeficiencies,
    }));

    const filterSummary = isSelectionExport
      ? shareOnlyFailedItems
        ? `${t("reportExportSelectedSummary", { count: selectedIds.length })} · ${t("shareOnlyFailedItemsSummary")}`
        : t("reportExportSelectedSummary", { count: selectedIds.length })
      : shareOnlyFailedItems
        ? `${exportFilterSummary} · ${t("shareOnlyFailedItemsSummary")}`
        : exportFilterSummary;

    try {
      const res = await fetch(`/api/projects/${projectId}/inspections-report/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionIds: records.map((r) => r.submissionId),
          records,
          projectName,
          filterSummary,
          shareOnlyFailedItems,
        }),
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) return;

      clearExportTimers();

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(formatPdfExportErrorToast(errBody, "Export failed."));
        setExportStep(null);
        return;
      }

      setExportStep("done");
      const blob = await res.blob();
      if (abortController.signal.aborted) return;

      const fileName = `inspections-report-${new Date().toISOString().slice(0, 10)}.pdf`;

      if (isMobilePdfDelivery()) {
        setPendingPdf({ blob, fileName });
        return;
      }

      await deliverPdfBlob(blob, fileName);
      setTimeout(() => setExportStep(null), 1_200);
    } catch (err) {
      clearExportTimers();
      if ((err as Error).name === "AbortError") {
        return;
      }
      toast.error(t("reportExportSaveFailed"));
      setExportStep(null);
      setPendingPdf(null);
    } finally {
      if (exportAbortRef.current === abortController) {
        exportAbortRef.current = null;
      }
    }
  }, [
    exportStep,
    sortedFilteredSubmissions,
    projectId,
    projectName,
    exportFilterSummary,
    shareOnlyFailedItems,
    t,
    isOnline,
    tOffline,
    clearExportTimers,
  ]);

  const handleExportSelected = useCallback(() => {
    const ids = sortedFilteredSubmissions
      .filter((sub) => effectiveSelectedIds.has(sub.submissionId))
      .map((sub) => sub.submissionId);
    void exportPdf(ids);
  }, [sortedFilteredSubmissions, effectiveSelectedIds, exportPdf]);

  const handleSavePendingPdf = useCallback(async () => {
    if (!pendingPdf) return;
    try {
      await deliverPdfBlobOnUserGesture(pendingPdf.blob, pendingPdf.fileName);
      setPendingPdf(null);
      setExportStep(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(t("reportExportSaveFailed"));
      }
    }
  }, [pendingPdf, t]);

  const exportDisabled = loading || !report || sortedFilteredSubmissions.length === 0 || exporting;

  const selectModeProps = !isGlobal
    ? {
        selectMode: isSelectMode,
        selectedIds: effectiveSelectedIds,
        onToggleSelect: toggleSelect,
      }
    : {
        selectMode: false as const,
        selectedIds: undefined,
        onToggleSelect: undefined,
      };

  const selectModeExportOption = (mobile: boolean) => (
    <ShareOnlyFailedItemsToggle
      id={
        mobile
          ? "inspections-report-select-share-failed-mobile"
          : "inspections-report-select-share-failed"
      }
      checked={shareOnlyFailedItems}
      onChange={setShareOnlyFailedItems}
      variant={mobile ? "onDark" : "default"}
      compact={mobile}
    />
  );

  const quickFilterBar =
    !loading && report && report.scopeTypes.length > 0 ? (
      <InspectionReportCountLine
        stats={summaryStats}
        activeQuickFilter={activeQuickFilter}
        onQuickFilter={applyQuickFilter}
      />
    ) : null;

  const inspectionFilterStatusLabel = useMemo(() => {
    if (!hasAppliedInspectionFilters) return null;
    if (activeFilterBadgeCount > 0) {
      return t("reportFiltersAppliedCount", { count: activeFilterBadgeCount });
    }
    return t("reportFiltersAppliedGeneric");
  }, [hasAppliedInspectionFilters, activeFilterBadgeCount, t]);

  const quickFiltersStrip =
    quickFilterBar ? (
      <InspectionReportQuickFiltersStrip
        statusLabel={inspectionFilterStatusLabel}
        showClear={hasAppliedInspectionFilters}
        onClearFilters={clearAllFilters}
      >
        {quickFilterBar}
      </InspectionReportQuickFiltersStrip>
    ) : null;

  const reportBody = (
    <div
      className={isGlobal ? "irf-root irf-root--global" : "irf-root irf-root--embedded"}
      style={{
        padding: "0 var(--page-padding-x) 48px",
        width: "100%",
        boxSizing: "border-box",
        ...(isGlobal
          ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" as const }
          : { maxWidth: 1400, margin: "0 auto" }),
      }}
    >

      {isGlobal && (
        <div className="irf-global-header" style={{ padding: "10px 0 12px" }}>
          <div className="irf-global-header-top">
            <h1 className="irf-global-header-title">{props.pageTitle}</h1>
            <div className="irf-global-header-actions mobile-only">
              <ToolbarActionButton
                variant="filter"
                icon={<Filter size={16} aria-hidden />}
                badge={activeFilterBadgeCount}
                onClick={() => setFiltersOpen(true)}
                ariaLabel={t("reportFilterAria")}
              />
              <InspectionReportExportMenu
                compact
                disabled={exportDisabled}
                pdfDisabled={isGlobal}
                onExportCsv={exportCsv}
                onExportPdf={() => void exportPdf()}
                shareOnlyFailedItems={shareOnlyFailedItems}
                onShareOnlyFailedItemsChange={setShareOnlyFailedItems}
              />
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--neutral-500)" }}>{props.pageSubtitle}</p>
        </div>
      )}

      {/* ── Desktop toolbar ── */}
      <div className="irf-desktop-only">
        <div className="irf-desktop-row">
          <div className="irf-search-wrap">
            <Search size={12} style={{ position: "absolute", left: 8, color: "var(--neutral-400)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder={t("reportFilterSearchPlaceholder")}
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              style={{ ...IS, paddingLeft: 26, width: "100%" }}
            />
          </div>
          {DIVIDER}
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); trigger(e.target.value, toDate); }} style={IS} aria-label={t("reportFilterDateFromAria")} />
          <span style={{ fontSize: 12, color: "var(--neutral-400)" }}>→</span>
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); trigger(fromDate, e.target.value); }} style={IS} aria-label={t("reportFilterDateToAria")} />
          {isGlobal ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <ReportFilterToggleButton
              activeFilterCount={activeFilterBadgeCount}
              onClick={() => setFiltersOpen(true)}
            />
            <InspectionReportExportMenu
              disabled={exportDisabled}
              pdfDisabled={isGlobal}
              onExportCsv={exportCsv}
              onExportPdf={() => void exportPdf()}
              shareOnlyFailedItems={shareOnlyFailedItems}
              onShareOnlyFailedItemsChange={setShareOnlyFailedItems}
            />
          </div>
          ) : null}
        </div>
      </div>

      {exportStep && (
        <InspectionExportProgressOverlay
          step={exportStep}
          recordCount={exportProgressCount}
          onSavePdf={pendingPdf ? () => void handleSavePendingPdf() : undefined}
          savePdfLabel={pendingPdf ? t("reportExportSavePdf") : undefined}
          savePdfHint={pendingPdf ? t("reportExportSavePdfHint") : undefined}
          onCancel={exportStep !== "done" ? handleCancelExport : undefined}
          cancelLabel={t("reportExportCancel")}
        />
      )}

      {filtersOpen && (
        <InspectionReportFilterPanel
          onClose={() => setFiltersOpen(false)}
          onClearFilters={clearAllFilters}
          activeFilterCount={activeFilterBadgeCount}
          canClearFilters={hasAppliedInspectionFilters}
          fromDate={fromDate}
          toDate={toDate}
          onChangeFromDate={setFromDate}
          onChangeToDate={setToDate}
          onDateRangeApply={trigger}
          filterResult={filterResult}
          onChangeFilterResult={setFilterResult}
          report={report}
          showProjectFilter={isGlobal}
          projectOptions={projectOptions}
          selectedProjectIds={selectedProjectIds}
          onChangeProjectIds={setSelectedProjectIds}
          scopeOptions={scopeOptions}
          selectedScopeCodes={selectedScopeCodes}
          onChangeScopeCodes={setSelectedScopeCodes}
          showImPmFilters={isGlobal}
          imOptions={imOptions}
          selectedIMs={selectedIMs}
          onChangeIMs={setSelectedIMs}
          pmOptions={pmOptions}
          selectedPMs={selectedPMs}
          onChangePMs={setSelectedPMs}
          showInspectorFilter={!isGlobal}
          inspectorOptions={inspectorOptions}
          selectedInspectors={selectedInspectors}
          onChangeInspectors={setSelectedInspectors}
          installerOptions={installerOptions}
          selectedInstallers={selectedInstallers}
          onChangeInstallers={setSelectedInstallers}
          selectedInspectionTypeCodes={selectedInspectionTypeCodes}
          onChangeInspectionTypeCodes={setSelectedInspectionTypeCodes}
          inspectionTypeOptions={inspectionTypeOptions}
          selectedCalibrationModes={selectedCalibrationModes}
          onChangeCalibrationModes={setSelectedCalibrationModes}
          calibrationOptions={calibrationOptions}
          locationFilterOptions={locationFilterOptions}
          locationFilterValue={locationFilterValue}
          onChangeLocationFilter={handleLocationFilterChange}
        />
      )}

      {reviewState && reviewRow && (
        <InspectionFillOverlay
          mode="readonly"
          panelMode
          submission={reviewState.submission}
          attemptNumber={reviewRow.attemptNumber ?? undefined}
          projectId={reviewState.submission.projectId}
          unitId={reviewState.submission.unitId}
          projectName={isGlobal ? reviewRow.projectName : projectName}
          locationLabel={reportRowLocationLabel(reviewRow)}
          locationParts={{
            building: reviewRow.building || null,
            level: reviewRow.level || null,
            unit: reviewRow.unit || null,
          }}
          recordIndex={reviewState.index + 1}
          recordTotal={sortedFilteredSubmissions.length}
          onPrev={
            reviewState.index > 0
              ? () => void navigateReviewRecord(reviewState.index - 1)
              : undefined
          }
          onNext={
            reviewState.index < sortedFilteredSubmissions.length - 1
              ? () => void navigateReviewRecord(reviewState.index + 1)
              : undefined
          }
          onClose={() => setReviewState(null)}
        />
      )}

      {loading && (
        <InspectionReportTableSkeleton
          showProjectColumn={isGlobal}
          showImColumn={isGlobal}
          showQuickFilters={isGlobal}
          projectColumnLabel={isGlobal ? props.projectColumnLabel : undefined}
        />
      )}

      {!loading && error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 20, background: "var(--error-100)", border: "1px solid var(--error-200)", borderRadius: 8, color: "var(--error-700)", fontSize: 14 }}>
          <AlertTriangle size={16} aria-hidden />{error}
        </div>
      )}

      {!loading && report && (
        report.scopeTypes.length === 0
          ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--neutral-400)", fontSize: 15 }}>{t("reportEmpty")}</div>
          : (
              <>
                {isGlobal ? quickFiltersStrip : null}
                <div
                  className="irf-desktop-table"
                  style={{
                    flex: isGlobal ? 1 : undefined,
                    minHeight: isGlobal ? 240 : undefined,
                    display: isGlobal ? "flex" : undefined,
                    flexDirection: isGlobal ? "column" : undefined,
                    border: "1px solid var(--neutral-200)",
                    borderRadius: 10,
                    overflowX: "auto",
                  }}
                >
                  <InspectionsTable
                    submissions={sortedFilteredSubmissions}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={cycleSort}
                    showProjectColumn={isGlobal}
                    showImColumn={isGlobal}
                    projectColumnLabel={isGlobal ? props.projectColumnLabel : t("reportTableColProject")}
                    onViewRecord={(id) => void openReviewRecord(id)}
                    loadingSubmissionId={reviewLoadingId}
                    {...selectModeProps}
                  />
                </div>
                <div className="irf-mobile-cards">
                  <InspectionsMobileCardList
                    submissions={sortedFilteredSubmissions}
                    onViewRecord={(id) => void openReviewRecord(id)}
                    loadingSubmissionId={reviewLoadingId}
                    mode={isGlobal ? "global" : "project"}
                    {...selectModeProps}
                  />
                </div>
              </>
            )
      )}

      <style>{`
        .irf-root { overflow-x: hidden; max-width: 100%; }
        .irf-root--global { flex: 1; min-height: 0; }
        .irf-root--embedded { padding-top: 8px !important; }
        .irf-global-header-top {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .irf-global-header-title {
          margin: 0;
          flex: 1;
          min-width: 0;
          font-size: var(--text-heading, 20px);
          font-weight: 700;
          color: var(--neutral-900);
        }
        .irf-global-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .irf-desktop-only { display: none !important; }
        .irf-project-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px var(--page-padding-x, 12px);
          border-bottom: 1px solid var(--neutral-200);
          background: var(--neutral-0);
          flex-shrink: 0;
        }
        .irf-project-header-title {
          margin: 0;
          flex: 1;
          min-width: 0;
          font-size: 16px;
          font-weight: 700;
          color: var(--neutral-900);
        }
        .irf-project-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          margin-left: 12px;
          padding-left: 4px;
        }
        .irf-quick-filters-strip {
          flex-shrink: 0;
          padding: 8px var(--page-padding-x, 12px) 10px;
          border-bottom: 1px solid var(--neutral-200);
          background: var(--neutral-0);
        }
        .irf-filter-status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
          min-height: 28px;
        }
        .irf-filter-status-row__label {
          font-size: 12px;
          font-weight: 600;
          color: var(--neutral-600);
          min-width: 0;
        }
        .irf-filter-status-row__clear {
          padding: 4px 0;
          border: none;
          background: none;
          color: var(--primary-700);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
          text-underlineOffset: 2px;
          flex-shrink: 0;
        }
        .irf-count-line {
          margin: 0 !important;
          flex-wrap: nowrap !important;
          overflow-x: auto;
          overflow-y: visible;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          padding: 2px 1px 4px;
          gap: 6px;
        }
        .irf-count-line::-webkit-scrollbar {
          display: none;
        }
        .inspection-report-entry--selected {
          outline: 2px solid var(--primary-500);
          outline-offset: -2px;
        }
        @media (min-width: 640px) {
          .irf-count-line {
            flex-wrap: wrap !important;
            overflow-x: visible;
            padding-bottom: 0;
          }
          .irf-desktop-only { display: block !important; }
          .irf-mobile-only { display: none !important; }
          .irf-desktop-row {
            display: flex; flex-wrap: wrap; align-items: center; gap: 7px;
            padding: 10px 0 6px;
          }
          .irf-search-wrap {
            position: relative; display: flex; align-items: center;
            flex: 1 1 180px; min-width: 0; max-width: 280px;
          }
          .irf-root--global .irf-search-wrap {
            flex: 1 1 240px;
            max-width: none;
          }
          .irf-root--global .irf-desktop-table table {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );

  if (isGlobal) return reportBody;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <div className="irf-project-header">
        <ClipboardCheck size={17} style={{ color: "var(--neutral-600)", flexShrink: 0 }} aria-hidden />
        <h1 className="irf-project-header-title">{tProjects("tabInspectionsShort")}</h1>
        <div className="irf-project-header-actions">
          <ToolbarActionButton
            variant="filter"
            icon={<Filter size={16} aria-hidden />}
            badge={activeFilterBadgeCount}
            onClick={() => setFiltersOpen(true)}
            ariaLabel={t("reportFilterAria")}
          />
          <button
            type="button"
            onClick={() => (isSelectMode ? exitSelectMode() : enterSelectMode())}
            aria-label={tUnits("selectMode")}
            aria-pressed={isSelectMode}
            title={tUnits("selectMode")}
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
          {!isSelectMode ? (
            <InspectionReportExportMenu
              compact
              disabled={exportDisabled}
              pdfDisabled={false}
              onExportCsv={exportCsv}
              onExportPdf={() => void exportPdf()}
              shareOnlyFailedItems={shareOnlyFailedItems}
              onShareOnlyFailedItemsChange={setShareOnlyFailedItems}
            />
          ) : null}
        </div>
      </div>
      {isSelectMode && !isMobileViewport ? (
        <FieldLogExportSelectionBar
          selectedCount={effectiveSelectedIds.size}
          totalVisible={sortedFilteredSubmissions.length}
          onSelectAll={selectAllVisible}
          onDeselectAll={deselectAll}
          onExport={handleExportSelected}
          onCancel={exitSelectMode}
          exporting={exporting}
          mobile={false}
          exportButtonLabel={t("reportExportSelectedPdf")}
          exportAriaLabel={t("reportExportSelectedAria")}
          exportOption={selectModeExportOption(false)}
        />
      ) : null}
      {quickFiltersStrip}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          paddingBottom: isSelectMode && isMobileViewport ? 132 : undefined,
        }}
      >
        {reportBody}
      </div>
      {isSelectMode && isMobileViewport ? (
        <FieldLogExportSelectionBar
          selectedCount={effectiveSelectedIds.size}
          totalVisible={sortedFilteredSubmissions.length}
          onSelectAll={selectAllVisible}
          onDeselectAll={deselectAll}
          onExport={handleExportSelected}
          onCancel={exitSelectMode}
          exporting={exporting}
          mobile
          exportButtonLabel={t("reportExportSelectedPdf")}
          exportAriaLabel={t("reportExportSelectedAria")}
          exportOption={selectModeExportOption(true)}
        />
      ) : null}
    </div>
  );
}
