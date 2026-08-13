import { formatReportDateRangeCompact } from "@/lib/format-report-date";
import type {
  PortfolioProjectSnapshot,
  ScopeProgressSnapshot,
} from "@/lib/reports/portfolio-progress-types";

export type ComparePeriodPreset = "1w" | "2w" | "30d" | "all" | "custom";

export interface ComparePeriodState {
  preset: ComparePeriodPreset;
  /** ISO date string YYYY-MM-DD */
  customFrom: string;
  customTo: string;
}

/** YYYY-MM-DD in the user's local timezone (for date inputs — not UTC). */
export function toDateInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultComparePeriod(): ComparePeriodState {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    preset: "1w",
    customFrom: toDateInput(from),
    customTo: toDateInput(to),
  };
}

/** Resolved window for display (wireframe — live API will compute server-side). */
export function resolveComparePeriodRange(period: ComparePeriodState): { from: string; to: string } {
  if (period.preset === "custom") {
    return { from: period.customFrom, to: period.customTo };
  }
  const to = new Date();
  const from = new Date();
  const days =
    period.preset === "1w" ? 7 : period.preset === "2w" ? 14 : period.preset === "30d" ? 30 : 365;
  from.setDate(from.getDate() - days);
  return { from: toDateInput(from), to: toDateInput(to) };
}

function daysInclusive(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  const diff = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff + 1);
}

function scaleDelta(delta: number | null, factor: number): number | null {
  if (delta === null) return null;
  if (factor === 1) return delta;
  const scaled = Math.round(delta * factor);
  return scaled === 0 && delta !== 0 ? (delta > 0 ? 1 : -1) : scaled;
}

function scaleUnitDelta(delta: number | null, factor: number): number | null {
  if (delta === null) return null;
  if (factor === 1) return delta;
  const scaled = Math.round(delta * factor);
  return scaled === 0 && delta !== 0 ? (delta > 0 ? 1 : -1) : scaled;
}

function adjustScope(scope: ScopeProgressSnapshot, period: ComparePeriodState): ScopeProgressSnapshot {
  if (period.preset === "all") {
    if (scope.verifiedDelta !== null || scope.subDelta !== null) return scope;
    if (scope.verifiedPct >= 100) {
      return { ...scope, verifiedDelta: null, subDelta: null, verifiedUnitDelta: null, subUnitDelta: null };
    }
    const verifiedDelta = Math.max(1, Math.round((100 - scope.verifiedPct) * 0.15));
    const subDelta = Math.max(1, Math.round((100 - scope.subPct) * 0.1));
    return {
      ...scope,
      verifiedDelta,
      subDelta,
      verifiedUnitDelta: Math.max(1, Math.round(verifiedDelta * 0.4)),
      subUnitDelta: Math.max(1, Math.round(subDelta * 0.4)),
    };
  }

  const factor =
    period.preset === "1w"
      ? 1
      : period.preset === "2w"
        ? 1.5
        : period.preset === "30d"
          ? 2
          : period.preset === "custom"
            ? (() => {
                const d = daysInclusive(period.customFrom, period.customTo);
                if (d <= 7) return 1;
                if (d <= 14) return 1.5;
                if (d <= 30) return 2;
                return 2.5;
              })()
            : 1;

  return {
    ...scope,
    verifiedDelta: scaleDelta(scope.verifiedDelta, factor),
    subDelta: scaleDelta(scope.subDelta, factor),
    verifiedUnitDelta: scaleUnitDelta(scope.verifiedUnitDelta ?? null, factor),
    subUnitDelta: scaleUnitDelta(scope.subUnitDelta ?? null, factor),
  };
}

/** Applies the selected compare window to wireframe fixtures (deltas + change flags). */
export function applyComparePeriodToProject(
  project: PortfolioProjectSnapshot,
  period: ComparePeriodState,
): PortfolioProjectSnapshot {
  const scopeSummaries = project.scopeSummaries.map((s) => adjustScope(s, period));
  const buildings = project.buildings.map((building) => ({
    ...building,
    levels: building.levels.map((level) => ({
      ...level,
      cells: level.cells.map((cell) => adjustScope(cell, period)),
    })),
  }));

  const hasChangesInPeriod = scopeSummaries.some(
    (s) => s.verifiedDelta !== null || s.subDelta !== null,
  );

  return {
    ...project,
    hasChangesInPeriod,
    scopeSummaries,
    buildings,
  };
}

export function isCustomRangeInvalid(period: ComparePeriodState): boolean {
  if (period.preset !== "custom") return false;
  if (!period.customFrom.trim() || !period.customTo.trim()) return true;
  return period.customFrom > period.customTo;
}

export function copyComparePeriod(period: ComparePeriodState): ComparePeriodState {
  return { ...period };
}

export function comparePeriodStatesEqual(a: ComparePeriodState, b: ComparePeriodState): boolean {
  return a.preset === b.preset && a.customFrom === b.customFrom && a.customTo === b.customTo;
}

export interface ComparePeriodShortLabels {
  /** Shown for "all time" preset only. */
  shortAll: string;
  /** Fallback when custom range is invalid. */
  shortCustom: string;
  /** 1-week preset — e.g. "week of 5/27–6/3". */
  formatWeekOf: (range: string) => string;
}

/** Compact label shown beside % change deltas (actual compare window dates). */
export function comparePeriodShortLabel(
  period: ComparePeriodState,
  labels: ComparePeriodShortLabels,
  locale: string,
): string {
  if (period.preset === "all") {
    return labels.shortAll;
  }

  if (period.preset === "custom" && isCustomRangeInvalid(period)) {
    return labels.shortCustom;
  }

  const { from, to } = resolveComparePeriodRange(period);
  const rangeLabel = formatReportDateRangeCompact(from, to, locale);

  if (period.preset === "1w") {
    return labels.formatWeekOf(rangeLabel);
  }

  return rangeLabel;
}

export interface ComparePeriodHeaderLabels {
  weekOf: string;
  preset2w: string;
  preset30d: string;
  presetAll: string;
  presetCustom: string;
  /** Shown when custom range is invalid. */
  shortCustom: string;
}

/** Two-line Δ column header: preset label on top, compact date range below (when applicable). */
export function comparePeriodHeaderLines(
  period: ComparePeriodState,
  labels: ComparePeriodHeaderLabels,
  locale: string,
): { timeframe: string; dates: string | null } {
  if (period.preset === "all") {
    return { timeframe: labels.presetAll, dates: null };
  }

  if (period.preset === "custom" && isCustomRangeInvalid(period)) {
    return { timeframe: labels.shortCustom, dates: null };
  }

  const { from, to } = resolveComparePeriodRange(period);
  const dates = formatReportDateRangeCompact(from, to, locale);

  if (period.preset === "custom") {
    return { timeframe: labels.presetCustom, dates };
  }

  switch (period.preset) {
    case "1w":
      return { timeframe: labels.weekOf, dates };
    case "2w":
      return { timeframe: labels.preset2w, dates };
    case "30d":
      return { timeframe: labels.preset30d, dates };
    default:
      return { timeframe: labels.presetAll, dates: null };
  }
}

/** Split a compact compare label into header lines (timeframe above, dates below). */
export function parseComparePeriodShortLabelForHeader(
  label: string,
  weekOfPrefix: string,
): { timeframe: string; dates: string | null } {
  const prefix = weekOfPrefix.trim();
  const prefixWithSpace = `${prefix} `;
  if (prefix && label.startsWith(prefixWithSpace)) {
    const dates = label.slice(prefixWithSpace.length).trim();
    return { timeframe: prefix, dates: dates || null };
  }
  return { timeframe: label, dates: null };
}
