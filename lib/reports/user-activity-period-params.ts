import {
  copyComparePeriod,
  defaultComparePeriod,
  isCustomRangeInvalid,
  resolveComparePeriodRange,
  type ComparePeriodPreset,
  type ComparePeriodState,
} from "@/lib/reports/portfolio-progress-period";

const VALID_PRESETS: ComparePeriodPreset[] = ["1w", "2w", "30d", "all", "custom"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isPreset(value: string): value is ComparePeriodPreset {
  return (VALID_PRESETS as string[]).includes(value);
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  const [y, m, day] = value.split("-").map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() === m - 1 && d.getUTCDate() === day;
}

/** Parse compare period from `/reports/activity/by-user` search params. */
export function parseUserActivityPeriodFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): ComparePeriodState {
  const base = defaultComparePeriod();
  const rawPreset = typeof params.preset === "string" ? params.preset : undefined;
  if (!rawPreset || !isPreset(rawPreset)) {
    return base;
  }

  const period: ComparePeriodState = { ...base, preset: rawPreset };
  if (rawPreset === "custom") {
    const from = typeof params.from === "string" ? params.from : base.customFrom;
    const to = typeof params.to === "string" ? params.to : base.customTo;
    const candidate: ComparePeriodState = { ...period, customFrom: from, customTo: to };
    if (
      !isValidIsoDate(from)
      || !isValidIsoDate(to)
      || isCustomRangeInvalid(candidate)
    ) {
      return base;
    }
    return candidate;
  }
  const range = resolveComparePeriodRange(period);
  return { ...period, customFrom: range.from, customTo: range.to };
}

export function userActivityPeriodToSearchParams(period: ComparePeriodState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("preset", period.preset);
  if (period.preset === "custom") {
    p.set("from", period.customFrom);
    p.set("to", period.customTo);
  }
  return p;
}

export function userActivityPeriodQueryString(period: ComparePeriodState): string {
  return userActivityPeriodToSearchParams(period).toString();
}

export function periodsEqual(a: ComparePeriodState, b: ComparePeriodState): boolean {
  return copyComparePeriod(a).preset === b.preset
    && copyComparePeriod(a).customFrom === b.customFrom
    && copyComparePeriod(a).customTo === b.customTo;
}
