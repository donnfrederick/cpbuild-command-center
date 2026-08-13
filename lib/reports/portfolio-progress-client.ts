import {
  isCustomRangeInvalid,
  resolveComparePeriodRange,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";

export function comparePeriodSearchParams(period: ComparePeriodState): URLSearchParams {
  if (isCustomRangeInvalid(period)) {
    return new URLSearchParams({ preset: "custom", from: period.customFrom, to: period.customTo });
  }
  const { from, to } = resolveComparePeriodRange(period);
  const params = new URLSearchParams({ preset: period.preset, from, to });
  return params;
}

export function globalProgressListUrl(period: ComparePeriodState): string {
  return `/api/reports/global-progress?${comparePeriodSearchParams(period).toString()}`;
}

export function globalProgressDetailUrl(projectId: string, period: ComparePeriodState): string {
  return `/api/reports/global-progress/${encodeURIComponent(projectId)}?${comparePeriodSearchParams(period).toString()}`;
}

/** Stable cache key for detail responses (project + compare window). */
export function comparePeriodCacheKey(period: ComparePeriodState): string {
  return comparePeriodSearchParams(period).toString();
}

export function portfolioProgressDetailCacheKey(
  projectId: string,
  period: ComparePeriodState,
): string {
  return `${projectId}|${comparePeriodCacheKey(period)}`;
}
