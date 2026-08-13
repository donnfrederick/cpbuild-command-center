"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ClipboardCheck,
  FileDown,
  Filter,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { StoredForm } from "@/lib/forms/formsApi";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isMobilePdfDelivery,
} from "@/lib/deliver-pdf-blob";
import { PROJECT_LEVEL_INSPECTION_UNIT_ID } from "@/lib/inspections/unit-inspection-ref";
import {
  buildProjectHubFormsExportFilterSummary,
  countActiveProjectHubFormFilters,
  filterProjectHubFormSubmissions,
  PROJECT_HUB_INITIAL_VISIBLE,
  projectHubFormExportRecords,
  uniqueProjectHubFormNames,
  type ProjectHubFormDatePreset,
} from "@/lib/inspections/project-hub-form-list-filters";
import {
  listByProjectLevel,
  partitionInspectionSubmissionsForPdfExport,
  type InspectionSubmission,
} from "@/lib/inspections/submissionsApi";
import {
  submissionOutcomeIsFail,
  submissionOutcomeIsPass,
} from "@/lib/inspections/scope-inspection-display";
import { isDocumentationSubmission } from "@/lib/forms/form-purpose-rules";
import { StartProjectInspectionSheet } from "@/components/projects/inspections/StartProjectInspectionSheet";
import { InspectionFillOverlay } from "@/components/projects/inspections/InspectionFillOverlay";
import { InspectionPdfExportOverlay } from "@/components/projects/inspections/InspectionPdfExportOverlay";
import { ProjectHubFormsFilterPanel } from "@/components/projects/ProjectHubFormsFilterPanel";
import { PROJECT_HUB_CARD_STYLE, ProjectHubCardHeader } from "@/components/projects/ProjectHubCardHeader";
import { ToolbarActionButton } from "@/components/shared/ToolbarActionButton";
import { formatRelativeTime, describeOutcome } from "@/components/projects/inspections/inspectionSummary";

type ExportStep = "gathering" | "rendering" | "done";

interface ProjectHubInspectionsCardProps {
  projectId: string;
  projectName: string;
  submittedBy?: string;
}

function ProjectFormSubmissionRow({
  sub,
  onReview,
}: {
  sub: InspectionSubmission;
  onReview: () => void;
}) {
  const t = useTranslations("inspections");
  const isDocumentation = isDocumentationSubmission(sub);
  const isFail = !isDocumentation && submissionOutcomeIsFail(sub);
  const isPass = !isDocumentation && submissionOutcomeIsPass(sub);
  const outcomeLabel = isDocumentation
    ? t("documentationSubmittedLabel")
    : isPass
      ? t("passLabel")
      : isFail
        ? t("failLabel")
        : describeOutcome(sub);
  const submitterLabel =
    sub.submittedBy && sub.submittedBy !== "—"
      ? sub.submittedBy
      : t("hubProjectFormsUnknownSubmitter");

  return (
    <button
      type="button"
      onClick={onReview}
      className="inspection-history-row inspection-history-row--first"
      style={{ width: "100%", borderRadius: 8, marginTop: 6 }}
    >
      <div className="inspection-history-row__content">
        <p className="inspection-history-row__scope">{sub.formNameSnapshot || t("untitledForm")}</p>
        <div className="inspection-history-row__meta">
          <span
            className={
              isFail
                ? "inspection-history-row__outcome--fail"
                : isPass
                  ? "inspection-history-row__outcome--pass"
                  : ""
            }
          >
            {outcomeLabel}
          </span>
          <span className="inspection-history-row__dot">·</span>
          <span>{formatRelativeTime(sub.submittedAt)}</span>
          <span className="inspection-history-row__dot">·</span>
          <span>{t("hubProjectFormsSubmittedBy", { name: submitterLabel })}</span>
          {sub._pendingSync && (
            <>
              <span className="inspection-history-row__dot">·</span>
              <span style={{ color: "var(--warning-700)" }}>{t("pendingSyncBadge")}</span>
            </>
          )}
        </div>
      </div>
      <span aria-hidden className="inspection-history-row__view">
        {t("scopeViewRecordAction")}
      </span>
    </button>
  );
}

export function ProjectHubInspectionsCard({
  projectId,
  projectName,
  submittedBy,
}: ProjectHubInspectionsCardProps) {
  const t = useTranslations("inspections");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<StoredForm | null>(null);
  const [submissions, setSubmissions] = useState<InspectionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [datePreset, setDatePreset] = useState<ProjectHubFormDatePreset>("all");
  const [selectedFormNames, setSelectedFormNames] = useState<Set<string>>(() => new Set());
  const [reviewSubmission, setReviewSubmission] = useState<InspectionSubmission | null>(null);
  const [exportStep, setExportStep] = useState<ExportStep | null>(null);
  const [pendingPdf, setPendingPdf] = useState<{ blob: Blob; fileName: string } | null>(null);

  const formNameOptions = useMemo(
    () => uniqueProjectHubFormNames(submissions),
    [submissions],
  );

  useEffect(() => {
    setSelectedFormNames((prev) => {
      if (formNameOptions.length === 0) return new Set();
      if (prev.size === 0) return new Set(formNameOptions);
      const next = new Set([...prev].filter((name) => formNameOptions.includes(name)));
      return next.size > 0 ? next : new Set(formNameOptions);
    });
  }, [formNameOptions]);

  const filterInput = useMemo(
    () => ({
      selectedFormNames,
      allFormNames: formNameOptions,
      fromDate,
      toDate,
    }),
    [selectedFormNames, formNameOptions, fromDate, toDate],
  );

  const filteredSubmissions = useMemo(
    () => filterProjectHubFormSubmissions(submissions, filterInput),
    [submissions, filterInput],
  );

  const activeFilterCount = useMemo(
    () => countActiveProjectHubFormFilters(filterInput),
    [filterInput],
  );

  useEffect(() => {
    setExpanded(false);
  }, [fromDate, toDate, selectedFormNames]);

  const clearAllFilters = useCallback(() => {
    setFromDate("");
    setToDate("");
    setDatePreset("all");
    setSelectedFormNames(new Set(formNameOptions));
  }, [formNameOptions]);

  const visibleSubmissions = expanded
    ? filteredSubmissions
    : filteredSubmissions.slice(0, PROJECT_HUB_INITIAL_VISIBLE);
  const hiddenCount = Math.max(0, filteredSubmissions.length - PROJECT_HUB_INITIAL_VISIBLE);
  const showToolbar = submissions.length > 0;

  const loadSubmissions = useCallback(async () => {
    try {
      const subs = await listByProjectLevel(projectId);
      setSubmissions(subs);
      setError(null);
    } catch {
      setError(t("hubProjectFormsLoadError"));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    function handleUpdate(e: Event) {
      const detail = (e as CustomEvent<{ unitId?: string; projectId?: string }>).detail;
      if (detail.unitId !== PROJECT_LEVEL_INSPECTION_UNIT_ID) return;
      void loadSubmissions();
    }
    window.addEventListener("inspections:updated", handleUpdate);
    return () => window.removeEventListener("inspections:updated", handleUpdate);
  }, [loadSubmissions]);

  const reviewIndex = reviewSubmission
    ? filteredSubmissions.findIndex((s) => s.id === reviewSubmission.id)
    : -1;

  const exportPdf = useCallback(async () => {
    if (exportStep || filteredSubmissions.length === 0) return;

    const { exportable, pendingCount } = partitionInspectionSubmissionsForPdfExport(
      filteredSubmissions,
    );

    if (exportable.length === 0) {
      toast.error(t("hubProjectFormsExportPendingSync"));
      return;
    }

    setExportStep("gathering");
    const records = projectHubFormExportRecords(exportable);
    const filterSummary = buildProjectHubFormsExportFilterSummary(
      filterInput,
      exportable.length,
    );

    try {
      setExportStep("rendering");
      const res = await fetch(`/api/projects/${projectId}/inspections-report/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionIds: records.map((r) => r.submissionId),
          records,
          projectName,
          filterSummary: `Project forms — ${filterSummary}`,
          reportKind: "project_forms",
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(formatPdfExportErrorToast(errBody, t("hubProjectFormsExportFailed")));
        setExportStep(null);
        return;
      }

      setExportStep("done");
      const blob = await res.blob();
      const fileName = `project-forms-${new Date().toISOString().slice(0, 10)}.pdf`;

      if (pendingCount > 0) {
        toast.message(
          t("hubProjectFormsExportPartialPending", {
            exported: exportable.length,
            pending: pendingCount,
          }),
        );
      }

      if (isMobilePdfDelivery()) {
        setPendingPdf({ blob, fileName });
        return;
      }

      await deliverPdfBlob(blob, fileName);
      setTimeout(() => setExportStep(null), 1200);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(t("reportExportSaveFailed"));
      }
      setExportStep(null);
      setPendingPdf(null);
    }
  }, [exportStep, filteredSubmissions, filterInput, projectId, projectName, t]);

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

  const exportDisabled =
    loading || filteredSubmissions.length === 0 || exportStep !== null;

  return (
    <>
      <div
        style={{
          ...PROJECT_HUB_CARD_STYLE,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <ProjectHubCardHeader
          icon={ClipboardCheck}
          title={t("hubProjectFormsTitle")}
          marginBottom={2}
          actions={
            <>
              {showToolbar && (
                <>
                  <ToolbarActionButton
                    variant="filter-surface"
                    icon={<Filter size={16} aria-hidden />}
                    badge={activeFilterCount}
                    onClick={() => setFiltersOpen(true)}
                    ariaLabel={t("hubProjectFormsFilterAria")}
                  />
                  <ToolbarActionButton
                    variant="default"
                    icon={<FileDown size={16} aria-hidden />}
                    onClick={() => void exportPdf()}
                    disabled={exportDisabled}
                    ariaLabel={t("hubProjectFormsExportAria")}
                    tooltip={t("hubProjectFormsExportAria")}
                  />
                </>
              )}
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-label={t("hubStartProjectForm")}
                title={t("hubStartProjectForm")}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  backgroundColor: "var(--control-bg)",
                  color: "var(--color-accent-hover)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Plus size={16} aria-hidden />
              </button>
            </>
          }
        />

        {loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
              color: "var(--neutral-500)",
              fontSize: 12,
            }}
          >
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {t("hubProjectFormsLoading")}
          </div>
        ) : error ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--error-600)",
                fontSize: 12,
              }}
            >
              <AlertTriangle size={14} aria-hidden />
              {error}
            </div>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void loadSubmissions();
              }}
              style={{
                alignSelf: "flex-start",
                fontSize: 12,
                color: "var(--primary-700)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              {t("hubProjectFormsRetry")}
            </button>
          </div>
        ) : submissions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-500)" }}>
            {t("hubProjectFormsEmpty")}
          </p>
        ) : filteredSubmissions.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--neutral-500)" }}>
            {t("hubProjectFormsNoMatches")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {visibleSubmissions.map((sub) => (
              <ProjectFormSubmissionRow
                key={sub._localId ?? sub.id}
                sub={sub}
                onReview={() => setReviewSubmission(sub)}
              />
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 4,
                  padding: "4px 0",
                  fontSize: 12,
                  color: "var(--primary-700)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {expanded
                  ? t("hubProjectFormsShowLess")
                  : t("hubProjectFormsShowMore", { count: hiddenCount })}
              </button>
            )}
          </div>
        )}
      </div>

      {filtersOpen && (
        <ProjectHubFormsFilterPanel
          onClose={() => setFiltersOpen(false)}
          onClearFilters={clearAllFilters}
          activeFilterCount={activeFilterCount}
          formNameOptions={formNameOptions}
          selectedFormNames={selectedFormNames}
          onChangeFormNames={setSelectedFormNames}
          fromDate={fromDate}
          toDate={toDate}
          onChangeFromDate={setFromDate}
          onChangeToDate={setToDate}
          datePreset={datePreset}
          onChangeDatePreset={setDatePreset}
        />
      )}

      {exportStep && (
        <InspectionPdfExportOverlay
          step={exportStep === "done" ? "done" : "working"}
          recordCount={filteredSubmissions.length}
          onSavePdf={pendingPdf ? () => void handleSavePendingPdf() : undefined}
          savePdfLabel={pendingPdf ? t("reportExportSavePdf") : undefined}
        />
      )}

      {sheetOpen && (
        <StartProjectInspectionSheet
          projectId={projectId}
          onStartFill={(form) => {
            setSheetOpen(false);
            setActiveForm(form);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {activeForm && (
        <InspectionFillOverlay
          mode="live"
          form={activeForm}
          projectId={projectId}
          projectName={projectName}
          unitId={PROJECT_LEVEL_INSPECTION_UNIT_ID}
          submittedBy={submittedBy}
          onClose={() => setActiveForm(null)}
          onSubmitted={() => {
            void loadSubmissions();
          }}
        />
      )}

      {reviewSubmission && reviewIndex >= 0 && (
        <InspectionFillOverlay
          mode="readonly"
          submission={filteredSubmissions[reviewIndex]}
          projectId={projectId}
          projectName={projectName}
          unitId={PROJECT_LEVEL_INSPECTION_UNIT_ID}
          recordIndex={reviewIndex + 1}
          recordTotal={filteredSubmissions.length}
          onPrev={
            reviewIndex > 0
              ? () => setReviewSubmission(filteredSubmissions[reviewIndex - 1]!)
              : undefined
          }
          onNext={
            reviewIndex < filteredSubmissions.length - 1
              ? () => setReviewSubmission(filteredSubmissions[reviewIndex + 1]!)
              : undefined
          }
          onClose={() => setReviewSubmission(null)}
        />
      )}
    </>
  );
}
