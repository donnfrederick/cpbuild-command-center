"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LevelScopeReportGrid } from "@/components/projects/LevelScopeReportGrid";
import { ComparePeriodDropdown } from "@/components/reports/ComparePeriodDropdown";
import { PortfolioProgressExportButton } from "@/components/reports/PortfolioProgressExportButton";
import { PortfolioProgressLevelBreakdownSkeleton } from "@/components/reports/PortfolioProgressLevelBreakdownSkeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  comparePeriodShortLabel,
  isCustomRangeInvalid,
  type ComparePeriodPreset,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";
import { portfolioSnapshotToLevelScopeReport } from "@/lib/reports/portfolio-snapshot-to-grid";
import type {
  PortfolioProjectListItem,
  PortfolioProjectSnapshot,
} from "@/lib/reports/portfolio-progress-types";

function periodShortForState(
  period: ComparePeriodState,
  locale: string,
  formatWeekOf: (range: string) => string,
  shortAll: string,
  shortCustom: string,
): string {
  return comparePeriodShortLabel(period, { formatWeekOf, shortAll, shortCustom }, locale);
}

export function PortfolioProgressLevelBreakdownModal({
  open,
  onClose,
  listItem,
  detailProject,
  detailLoading,
  detailPeriod,
  onDetailPeriodChange,
  levelReportLabel,
  detailLoadingLabel,
  periodPresets,
  periodPickerLabels,
}: {
  open: boolean;
  onClose: () => void;
  listItem: PortfolioProjectListItem;
  detailProject: PortfolioProjectSnapshot | null;
  detailLoading: boolean;
  detailPeriod: ComparePeriodState;
  onDetailPeriodChange: (period: ComparePeriodState) => void;
  levelReportLabel: string;
  detailLoadingLabel: string;
  periodPresets: { id: ComparePeriodPreset; label: string }[];
  periodPickerLabels: {
    projectPeriodLabel: string;
    customFromLabel: string;
    customToLabel: string;
    customRangeError: string;
    periodRangeSummary: (from: string, to: string) => string;
    shortAll: string;
    shortCustom: string;
    formatWeekOf: (range: string) => string;
  };
}) {
  const locale = useLocale();
  const tLevelScope = useTranslations("levelScopeReport");
  const activeCustomInvalid = isCustomRangeInvalid(detailPeriod);

  const rollupSource: PortfolioProjectSnapshot = {
    id: listItem.id,
    name: listItem.name,
    unifierPid: listItem.unifierPid,
    projectManagerName: listItem.projectManagerName,
    installManagerName: listItem.installManagerName,
    hasChangesInPeriod: listItem.hasChangesInPeriod,
    scopeSummaries: detailProject?.scopeSummaries ?? listItem.scopeSummaries,
    buildings: detailProject?.buildings ?? [],
  };

  const levelReport = useMemo(
    () =>
      detailProject && !activeCustomInvalid
        ? portfolioSnapshotToLevelScopeReport(detailProject)
        : null,
    [detailProject, activeCustomInvalid],
  );

  const exportProject = detailProject ?? rollupSource;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className="portfolio-progress-level-breakdown-modal top-[4dvh] left-1/2 translate-none sm:max-w-none"
        showCloseButton
      >
        <div className="portfolio-progress-level-breakdown-modal-topbar">
          <div className="portfolio-progress-level-breakdown-modal-topbar-main">
            <DialogHeader className="portfolio-progress-level-breakdown-modal-header">
              <div className="portfolio-progress-level-breakdown-modal-title-row">
                <DialogTitle className="portfolio-progress-level-breakdown-modal-title">
                  {listItem.name}
                </DialogTitle>
                {levelReport ? (
                  <div
                    className="portfolio-progress-level-breakdown-overall"
                    aria-label={tLevelScope("overallLabel")}
                  >
                    <span
                      className="portfolio-progress-level-breakdown-overall-pct"
                      style={{
                        color:
                          levelReport.grandTotalPct > 0
                            ? "var(--success-600)"
                            : "var(--neutral-300)",
                      }}
                    >
                      {levelReport.grandTotalPct}%
                    </span>
                    <span className="portfolio-progress-level-breakdown-overall-label">
                      {tLevelScope("overallLabel")}
                    </span>
                  </div>
                ) : null}
                <ComparePeriodDropdown
                  idPrefix={`project-${listItem.id}-period`}
                  ariaLabel={periodPickerLabels.projectPeriodLabel}
                  comparePeriod={detailPeriod}
                  onComparePeriodChange={onDetailPeriodChange}
                  periodPresets={periodPresets}
                  locale={locale}
                  customFromLabel={periodPickerLabels.customFromLabel}
                  customToLabel={periodPickerLabels.customToLabel}
                  customRangeError={periodPickerLabels.customRangeError}
                  periodRangeSummary={periodPickerLabels.periodRangeSummary}
                  disabled={detailLoading && !levelReport}
                />
              </div>
              <p className="portfolio-progress-level-breakdown-modal-subtitle">{levelReportLabel}</p>
            </DialogHeader>
          </div>
          <div className="portfolio-progress-level-breakdown-modal-actions">
            <PortfolioProgressExportButton
              baseProject={exportProject}
              comparePeriod={detailPeriod}
              locale={locale}
              periodPresetLabel={
                periodPresets.find((p) => p.id === detailPeriod.preset)?.label ??
                periodPresets[0]?.label ??
                ""
              }
              formatWeekOf={periodPickerLabels.formatWeekOf}
              shortAll={periodPickerLabels.shortAll}
              shortCustom={periodPickerLabels.shortCustom}
            />
          </div>
        </div>

        <div className="portfolio-progress-level-breakdown-modal-body">
          {detailLoading && !levelReport ? (
            <PortfolioProgressLevelBreakdownSkeleton loadingLabel={detailLoadingLabel} />
          ) : null}

          {levelReport ? (
            <div
              className={`portfolio-project-card-level-scroll${
                detailLoading ? " portfolio-project-card-level-scroll--loading" : ""
              }`}
              aria-busy={detailLoading}
            >
              {detailLoading && (
                <div className="portfolio-project-card-level-loading-badge" aria-live="polite">
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  {detailLoadingLabel}
                </div>
              )}
              <LevelScopeReportGrid
                report={levelReport}
                showGrandTotal={false}
                scrollContext="modal"
                comparePeriod={detailPeriod}
                enableLevelUnitExpand={false}
                showUnitCounts
                showScopeDates
                showScopeDeltas
                deltaPeriodLabel={periodShortForState(
                  detailPeriod,
                  locale,
                  periodPickerLabels.formatWeekOf,
                  periodPickerLabels.shortAll,
                  periodPickerLabels.shortCustom,
                )}
              />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
