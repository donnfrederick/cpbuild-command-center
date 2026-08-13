import type { FieldDailyReportProgressSnapshot } from "@/lib/field-daily-report/types";

export function resolveInstallCompleteVerifiedUnitDelta(
  progress: FieldDailyReportProgressSnapshot,
): number {
  if (typeof progress.installCompleteVerifiedUnitDelta === "number") {
    return progress.installCompleteVerifiedUnitDelta;
  }
  return 0;
}

export function formatInstallCompleteVerifiedUnitDeltaLabel(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return String(delta);
  return "0";
}

export function progressPercentDeltaColor(delta: number): string {
  if (delta > 0) return "var(--success-700)";
  if (delta < 0) return "var(--error-600)";
  return "var(--neutral-400)";
}

export function resolveProgressPercentDelta(progress: FieldDailyReportProgressSnapshot): number {
  return typeof progress.pctCompleteDelta === "number" ? progress.pctCompleteDelta : 0;
}
