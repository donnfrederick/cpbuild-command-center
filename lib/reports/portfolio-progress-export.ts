import { formatReportDate, formatReportDateRangeCompact } from "@/lib/format-report-date";
import type { LevelScopeReportData } from "@/lib/level-scope-report";
import { portfolioSnapshotToLevelScopeReport } from "@/lib/reports/portfolio-snapshot-to-grid";
import {
  comparePeriodShortLabel,
  isCustomRangeInvalid,
  resolveComparePeriodRange,
  type ComparePeriodPreset,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";
import { projectVerifiedRollup } from "@/lib/reports/portfolio-progress-rollups";
import type { PortfolioProjectSnapshot, ScopeProgressSnapshot } from "@/lib/reports/portfolio-progress-types";

export interface PortfolioProgressExportScopeSummary {
  scopeName: string;
  verifiedPct: number;
  verifiedDelta: number | null;
  subPct: number;
  subDelta: number | null;
}

export interface PortfolioProgressExportPeriod {
  preset: ComparePeriodPreset;
  presetLabel: string;
  rangeFrom: string;
  rangeTo: string;
  rangeDisplay: string;
  compareLabel: string;
}

export interface PortfolioProgressExportLabels {
  documentTitle: string;
  periodHeading: string;
  compareWindowLabel: string;
  scopeSummaryHeading: string;
  colScope: string;
  colVerified: string;
  colVerifiedChange: string;
  colUnverified: string;
  colUnverifiedChange: string;
  overallVerifiedLabel: string;
  levelDetailHeading: string;
  colBuilding: string;
  colLevel: string;
  colOverall: string;
  colAllLevels: string;
  colBuildingTotal: string;
  colPct: string;
  colChange: string;
  colStart: string;
  colLastUpdated: string;
  colEnd: string;
  unitDetailHeading: string;
  colUnit: string;
  colSubcontractor: string;
  noChange: string;
  confidentialFooter: string;
}

export interface PortfolioProgressExportPayload {
  projectId: string;
  projectName: string;
  locale: string;
  exportedAt: string;
  period: PortfolioProgressExportPeriod;
  overallVerifiedPct: number;
  overallVerifiedDelta: number | null;
  scopeSummaries: PortfolioProgressExportScopeSummary[];
  levelReport: LevelScopeReportData;
  deltaPeriodLabel: string;
  labels: PortfolioProgressExportLabels;
}

export interface BuildPortfolioProgressExportPayloadInput {
  baseProject: PortfolioProjectSnapshot;
  comparePeriod: ComparePeriodState;
  locale: string;
  labels: PortfolioProgressExportLabels;
  periodPresetLabel: string;
  formatWeekOf: (range: string) => string;
  shortAll: string;
  shortCustom: string;
  exportedAt?: Date;
}

function mapScopeSummaries(scopes: ScopeProgressSnapshot[]): PortfolioProgressExportScopeSummary[] {
  return scopes.map((scope) => ({
    scopeName: scope.scopeName,
    verifiedPct: scope.verifiedPct,
    verifiedDelta: scope.verifiedDelta ?? null,
    subPct: scope.subPct,
    subDelta: scope.subDelta ?? null,
  }));
}

/** Assembles the server-side PDF payload for one expanded project export. */
export function buildPortfolioProgressExportPayload(
  input: BuildPortfolioProgressExportPayloadInput,
): PortfolioProgressExportPayload | null {
  const {
    baseProject,
    comparePeriod,
    locale,
    labels,
    periodPresetLabel,
    formatWeekOf,
    shortAll,
    shortCustom,
    exportedAt = new Date(),
  } = input;

  if (isCustomRangeInvalid(comparePeriod)) return null;

  const { levelUnitDetails: _omitUnitAppendix, ...levelReport } =
    portfolioSnapshotToLevelScopeReport(baseProject);

  if (levelReport.levels.length === 0 || levelReport.scopes.length === 0) {
    return null;
  }

  const { from, to } = resolveComparePeriodRange(comparePeriod);
  const rangeDisplay =
    comparePeriod.preset === "all"
      ? shortAll
      : formatReportDateRangeCompact(from, to, locale);

  const deltaPeriodLabel = comparePeriodShortLabel(
    comparePeriod,
    { formatWeekOf, shortAll, shortCustom },
    locale,
  );

  const compareLabel = labels.compareWindowLabel.replace("{period}", deltaPeriodLabel);
  const rollup = projectVerifiedRollup(baseProject);

  return {
    projectId: baseProject.id,
    projectName: baseProject.name,
    locale,
    exportedAt: exportedAt.toISOString(),
    period: {
      preset: comparePeriod.preset,
      presetLabel: periodPresetLabel,
      rangeFrom: from,
      rangeTo: to,
      rangeDisplay,
      compareLabel,
    },
    overallVerifiedPct: rollup.verifiedPct,
    overallVerifiedDelta: rollup.verifiedDelta,
    scopeSummaries: mapScopeSummaries(baseProject.scopeSummaries),
    levelReport,
    deltaPeriodLabel,
    labels,
  };
}
