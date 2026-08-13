import { toDateInput } from "@/lib/reports/portfolio-progress-period";

export type InspectionReportPeriodPreset = "all" | "1w" | "30d" | "custom";

export interface InspectionReportPeriodState {
  preset: InspectionReportPeriodPreset;
  /** ISO date YYYY-MM-DD — used when preset is custom. */
  customFrom: string;
  customTo: string;
}

export function defaultInspectionReportPeriod(): InspectionReportPeriodState {
  return { preset: "all", customFrom: "", customTo: "" };
}

export function isInspectionReportCustomRangeInvalid(
  period: InspectionReportPeriodState
): boolean {
  if (period.preset !== "custom") return false;
  if (!period.customFrom.trim() || !period.customTo.trim()) return true;
  return period.customFrom > period.customTo;
}

/** Resolved from/to for the global inspections API. Empty object = all time. */
export function resolveInspectionReportPeriodQuery(
  period: InspectionReportPeriodState
): { from?: string; to?: string } {
  if (period.preset === "all") return {};

  if (period.preset === "custom") {
    if (isInspectionReportCustomRangeInvalid(period)) return {};
    return { from: period.customFrom, to: period.customTo };
  }

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (period.preset === "1w" ? 7 : 30));
  return { from: toDateInput(from), to: toDateInput(to) };
}

export function resolveInspectionReportPeriodRange(
  period: InspectionReportPeriodState
): { from: string; to: string } | null {
  const query = resolveInspectionReportPeriodQuery(period);
  if (!query.from || !query.to) return null;
  return { from: query.from, to: query.to };
}

/** Seeds custom dates from the 1-week window when opening custom for the first time. */
export function inspectionReportPeriodWithPreset(
  period: InspectionReportPeriodState,
  preset: InspectionReportPeriodPreset
): InspectionReportPeriodState {
  const next: InspectionReportPeriodState = { ...period, preset };
  if (preset !== "custom") return next;

  if (period.customFrom.trim() && period.customTo.trim()) return next;

  const seed = resolveInspectionReportPeriodQuery({ preset: "1w", customFrom: "", customTo: "" });
  return {
    ...next,
    customFrom: seed.from ?? toDateInput(new Date()),
    customTo: seed.to ?? toDateInput(new Date()),
  };
}
