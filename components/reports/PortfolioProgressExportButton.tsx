"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  PortfolioProgressPdfExportOverlay,
  type PortfolioProgressPdfExportStep,
} from "@/components/reports/PortfolioProgressPdfExportOverlay";
import { useIsBrowser } from "@/hooks/use-is-browser";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isMobilePdfDelivery,
} from "@/lib/deliver-pdf-blob";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import {
  buildPortfolioProgressExportPayload,
  type PortfolioProgressExportLabels,
} from "@/lib/reports/portfolio-progress-export";
import type { PortfolioProjectSnapshot } from "@/lib/reports/portfolio-progress-types";
import type { ComparePeriodState } from "@/lib/reports/portfolio-progress-period";

interface PortfolioProgressExportButtonProps {
  baseProject: PortfolioProjectSnapshot;
  comparePeriod: ComparePeriodState;
  locale: string;
  periodPresetLabel: string;
  formatWeekOf: (range: string) => string;
  shortAll: string;
  shortCustom: string;
  className?: string;
}

function portfolioProgressPdfFilename(projectName: string): string {
  const safeName = projectName.replace(/[^\w\-]+/g, "-").slice(0, 48);
  return `progress-detail-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;
}

export function PortfolioProgressExportButton({
  baseProject,
  comparePeriod,
  locale,
  periodPresetLabel,
  formatWeekOf,
  shortAll,
  shortCustom,
  className,
}: PortfolioProgressExportButtonProps) {
  const t = useTranslations("globalReports.portfolioProgress");
  const isBrowser = useIsBrowser();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportStep, setExportStep] = useState<PortfolioProgressPdfExportStep | null>(null);
  const [pendingPdf, setPendingPdf] = useState<{ blob: Blob; fileName: string } | null>(null);

  const buildLabels = useCallback((): PortfolioProgressExportLabels => {
    return {
      documentTitle: t("exportDocumentTitle"),
      periodHeading: t("periodCardLabel"),
      compareWindowLabel: t("deltaVsPeriod", { period: "{period}" }),
      scopeSummaryHeading: t("exportScopeSummaryHeading"),
      colScope: t("colScope"),
      colVerified: t("verifiedShort"),
      colVerifiedChange: t("exportVerifiedChange"),
      colUnverified: t("unverifiedShort"),
      colUnverifiedChange: t("exportUnverifiedChange"),
      overallVerifiedLabel: t("overallVerifiedLabel"),
      levelDetailHeading: t("exportLevelDetailHeading"),
      colBuilding: t("exportColBuilding"),
      colLevel: t("exportColLevel"),
      colOverall: t("exportColOverall"),
      colAllLevels: t("exportColAllLevels"),
      colBuildingTotal: t("exportColBuildingTotal"),
      colPct: t("exportColPct"),
      colChange: t("exportColChange"),
      colStart: t("exportColStart"),
      colLastUpdated: t("exportColLastUpdated"),
      colEnd: t("exportColEnd"),
      unitDetailHeading: t("exportUnitDetailHeading"),
      colUnit: t("exportColUnit"),
      colSubcontractor: t("exportColSubcontractor"),
      noChange: t("noChange"),
      confidentialFooter: t("exportConfidentialFooter"),
    };
  }, [t]);

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
    if (exporting || exportStep) return;

    setExporting(true);
    setExportError(null);
    setPendingPdf(null);
    setExportStep("preparing");

    const labels = buildLabels();
    const payload = buildPortfolioProgressExportPayload({
      baseProject,
      comparePeriod,
      locale,
      labels,
      periodPresetLabel,
      formatWeekOf,
      shortAll,
      shortCustom,
    });

    if (!payload) {
      setExportError(t("exportInvalidPeriod"));
      clearExportState();
      return;
    }

    const deltaPeriodLabel = payload.deltaPeriodLabel;
    payload.labels.compareWindowLabel = t("deltaVsPeriod", { period: deltaPeriodLabel });
    payload.period.compareLabel = payload.labels.compareWindowLabel;

    const fileName = portfolioProgressPdfFilename(baseProject.name);

    try {
      setExportStep("rendering");
      const res = await fetch("/api/reports/global-progress/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(formatPdfExportErrorToast(errBody, t("exportFailed")));
      }

      const blob = await res.blob();
      if (!blob.size) {
        throw new Error(t("exportFailed"));
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
      setExportError(err instanceof Error ? err.message : t("exportFailed"));
      clearExportState();
    }
  }, [
    baseProject,
    buildLabels,
    clearExportState,
    comparePeriod,
    exportStep,
    exporting,
    formatWeekOf,
    locale,
    periodPresetLabel,
    shortAll,
    shortCustom,
    t,
  ]);

  return (
    <>
      <div className="portfolio-progress-export-button-wrap">
        <button
          type="button"
          className={className ?? "portfolio-progress-export-button"}
          aria-label={t("exportPdf")}
          title={t("exportPdf")}
          disabled={exporting || exportStep !== null}
          onClick={() => void handleExport()}
        >
          {exporting ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <FileDown size={16} aria-hidden />
          )}
        </button>
        {exportError && (
          <p role="alert" className="portfolio-progress-export-button-error">
            {exportError}
          </p>
        )}
      </div>

      {isBrowser && exportStep
        ? createPortal(
            <PortfolioProgressPdfExportOverlay
              step={exportStep}
              projectName={baseProject.name}
              periodLabel={periodPresetLabel}
              showSaveButton={Boolean(pendingPdf)}
              onSavePdf={pendingPdf ? () => void handleSavePendingPdf() : undefined}
            />,
            document.body,
          )
        : null}
    </>
  );
}
