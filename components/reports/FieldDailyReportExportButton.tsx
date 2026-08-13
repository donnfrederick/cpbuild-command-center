"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  FieldDailyReportPdfExportOverlay,
  type FieldDailyReportPdfExportStep,
} from "@/components/reports/FieldDailyReportPdfExportOverlay";
import { useIsBrowser } from "@/hooks/use-is-browser";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isMobilePdfDelivery,
} from "@/lib/deliver-pdf-blob";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import type { HubActivityPreviewLabelStrings } from "@/lib/field-daily-report/hub-activity-preview";
import { buildHubActivityPreviewCounts } from "@/lib/field-daily-report/hub-activity-preview";
import { fieldDailyReportPdfFilename } from "@/lib/field-daily-report/pdf-export-filename";
import type { FieldDailyReportPdfLabels } from "@/lib/field-daily-report/pdf-export-types";
import type { FieldDailyReportProjectDto } from "@/lib/field-daily-report/types";

interface FieldDailyReportExportButtonProps {
  project: FieldDailyReportProjectDto;
  reportDate: string;
  disabled?: boolean;
  /** Secondary actions on cards use icon-only per mobile-density defaults. */
  iconOnly?: boolean;
}

export function FieldDailyReportExportButton({
  project,
  reportDate,
  disabled = false,
  iconOnly = true,
}: FieldDailyReportExportButtonProps) {
  const t = useTranslations("fieldDailyReport");
  const locale = useLocale();
  const isBrowser = useIsBrowser();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportStep, setExportStep] = useState<FieldDailyReportPdfExportStep | null>(null);
  const [pendingPdf, setPendingPdf] = useState<{ blob: Blob; fileName: string } | null>(null);

  const buildLabels = useCallback((): FieldDailyReportPdfLabels => {
    return {
      documentTitle: t("exportDocumentTitle"),
      reportDateHeading: t("exportReportDateHeading"),
      exportedAtHeading: t("exportExportedAtHeading"),
      filterHeading: t("exportFilterHeading"),
      projectsHeading: t("exportProjectsHeading"),
      sectionProgress: t("sectionProgress"),
      sectionStatus: t("sectionStatus"),
      sectionTeamsOnSite: t("sectionTeamsOnSite"),
      sectionSubcontractors: t("sectionSubcontractors"),
      sectionInspections: t("sectionInspections"),
      sectionIssues: t("sectionIssues"),
      sectionObservations: t("sectionObservations"),
      sectionWorkforce: t("sectionWorkforce"),
      sectionOther: t("sectionOther"),
      notesLabel: t("sectionCommentLabel"),
      workforceDailyManpowerLabel: t("workforceDailyManpowerLabel"),
      missingDailyManpowerAlert: t("missingDailyManpowerAlert"),
      workforceManpowerSummary: t("workforceManpowerSummaryPdf", { count: "{count}" }),
      workforceDailyManpowerHeader: t("workforceDailyManpowerHeader", { count: "{count}" }),
      progressDeltaOnly: t("progressDeltaOnly", { delta: "{delta}" }),
      progressCurrentPct: t("progressCurrentPct", { pct: "{pct}" }),
      progressUnavailable: t("progressUnavailable"),
      noFieldActivity: t("hubHistoryNoActivity"),
      generatedAt: t("exportGeneratedPrefix"),
      confidentialFooter: t("exportConfidentialFooter"),
      locationProjectLevel: t("locationProjectLevel"),
      previewLabels: {
        statusChanges: t("hubPreviewStatusChanges", { count: 0 }),
        inspections: t("hubPreviewInspections", { count: 0 }),
        issuesReported: t("hubPreviewIssuesReported", { count: 0 }),
        otherActivity: t("hubPreviewOtherActivity", { count: 0 }),
      },
    };
  }, [t]);

  const formatPreviewLabel = useCallback(
    (key: keyof HubActivityPreviewLabelStrings, count: number) => {
      const keyMap = {
        statusChanges: "hubPreviewStatusChanges",
        inspections: "hubPreviewInspections",
        issuesReported: "hubPreviewIssuesReported",
        otherActivity: "hubPreviewOtherActivity",
      } as const;
      return t(keyMap[key], { count });
    },
    [t],
  );

  const formatUnitCount = useCallback((count: number) => t("statusUnitsMoved", { count }), [t]);

  const clearExportState = useCallback(() => {
    setExporting(false);
    setExportStep(null);
    setPendingPdf(null);
  }, []);

  const handleSavePendingPdf = useCallback(async () => {
    if (!pendingPdf) return;
    try {
      await deliverPdfBlobOnUserGesture(pendingPdf.blob, pendingPdf.fileName);
      clearExportState();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        clearExportState();
        return;
      }
      setExportError(t("exportPdfOpenFailed"));
      clearExportState();
    }
  }, [clearExportState, pendingPdf, t]);

  const handleExport = useCallback(async () => {
    if (exporting || disabled || exportStep) return;

    setExporting(true);
    setExportError(null);
    setPendingPdf(null);
    setExportStep("preparing");

    const labels = buildLabels();
    const fileName = fieldDailyReportPdfFilename(project.projectName, reportDate);
    const counts = buildHubActivityPreviewCounts(project.snapshot);
    const activityParts = [
      formatPreviewLabel("statusChanges", counts.statusChanges),
      formatPreviewLabel("inspections", counts.inspections),
    ];
    if (counts.issuesReported > 0) {
      activityParts.push(formatPreviewLabel("issuesReported", counts.issuesReported));
    }
    if (counts.otherActivity > 0) {
      activityParts.push(formatPreviewLabel("otherActivity", counts.otherActivity));
    }
    const activitySummary = activityParts.join(" · ");

    try {
      setExportStep("rendering");
      const res = await fetch("/api/reports/field-daily/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.projectId,
          reportDate,
          locale,
          labels,
          filterSummary: "",
          activitySummary,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(formatPdfExportErrorToast(errBody, t("exportPdfFailed")));
      }

      const blob = await res.blob();
      if (!blob.size) {
        throw new Error(t("exportPdfFailed"));
      }

      setExportStep("done");

      if (isMobilePdfDelivery()) {
        setPendingPdf({ blob, fileName });
        setExporting(false);
        return;
      }

      await deliverPdfBlob(blob, fileName);
      window.setTimeout(() => clearExportState(), 1200);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("exportPdfFailed"));
      clearExportState();
    }
  }, [
    buildLabels,
    clearExportState,
    disabled,
    exportStep,
    exporting,
    formatPreviewLabel,
    locale,
    project,
    reportDate,
    t,
  ]);

  const ariaLabel = t("exportPdfAria", { projectName: project.projectName });

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 4,
          flexShrink: 0,
          position: "relative",
        }}
      >
        <button
          type="button"
          aria-label={ariaLabel}
          title={ariaLabel}
          disabled={disabled || exporting || exportStep !== null}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleExport();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: iconOnly ? 0 : 6,
            width: iconOnly ? 36 : undefined,
            height: iconOnly ? 36 : undefined,
            padding: iconOnly ? 0 : "6px 10px",
            borderRadius: "var(--radius-sm)",
            border: iconOnly ? "none" : "1px solid var(--primary-200)",
            backgroundColor: iconOnly
              ? "transparent"
              : exporting
                ? "var(--neutral-100)"
                : "var(--primary-50)",
            color: "var(--primary-700)",
            fontWeight: 600,
            fontSize: "var(--text-caption)",
            cursor: disabled || exporting || exportStep ? "not-allowed" : "pointer",
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {exporting ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <FileDown size={16} aria-hidden />
          )}
          {!iconOnly ? t("exportPdf") : null}
        </button>
        {exportError && !iconOnly ? (
          <p
            role="alert"
            style={{
              margin: 0,
              maxWidth: 240,
              fontSize: 10,
              lineHeight: 1.35,
              color: "var(--error-600)",
              textAlign: "right",
            }}
          >
            {exportError}
          </p>
        ) : null}
      </div>

      {isBrowser && exportStep
        ? createPortal(
            <FieldDailyReportPdfExportOverlay
              step={exportStep}
              projectName={project.projectName}
              reportDate={reportDate}
              showSaveButton={Boolean(pendingPdf)}
              onSavePdf={pendingPdf ? () => void handleSavePendingPdf() : undefined}
            />,
            document.body,
          )
        : null}
    </>
  );
}
