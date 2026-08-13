/** Org timezone for calendar-day boundaries on field daily reports. */
export const FIELD_DAILY_REPORT_TIMEZONE =
  process.env.FIELD_DAILY_REPORT_TIMEZONE?.trim() || "America/Denver";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Parse YYYY-MM-DD into validated date string or null. */
export function parseReportDateParam(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (!DATE_ONLY_RE.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return trimmed;
}

function utcForLocalTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  for (let i = 0; i < 6; i++) {
    const z = zonedParts(new Date(guess), timeZone);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    const actualMs = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second, 0);
    const diff = targetMs - actualMs;
    if (diff === 0) return new Date(guess);
    guess += diff;
  }
  return new Date(guess);
}

/** Start/end instants for a calendar day in the org timezone. */
export function dayBoundsInOrgTz(reportDate: string, timeZone = FIELD_DAILY_REPORT_TIMEZONE): {
  start: Date;
  end: Date;
} {
  const [y, m, d] = reportDate.split("-").map(Number);
  const start = utcForLocalTime(y, m, d, 0, 0, 0, 0, timeZone);
  const end = utcForLocalTime(y, m, d, 23, 59, 59, 999, timeZone);
  return { start, end };
}

/** Today's date as YYYY-MM-DD in org timezone. */
export function todayReportDateInOrgTz(now = new Date(), timeZone = FIELD_DAILY_REPORT_TIMEZONE): string {
  const z = zonedParts(now, timeZone);
  const mm = String(z.month).padStart(2, "0");
  const dd = String(z.day).padStart(2, "0");
  return `${z.year}-${mm}-${dd}`;
}

/** Compare two YYYY-MM-DD strings (-1 | 0 | 1). */
export function compareReportDates(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Shift a YYYY-MM-DD calendar date backward by whole days (UTC date math). */
export function reportDateDaysBefore(reportDate: string, days: number): string {
  const [y, m, d] = reportDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/** Local hour (0–23) for an instant in the org timezone. */
export function zonedHourInOrgTz(
  now = new Date(),
  timeZone = FIELD_DAILY_REPORT_TIMEZONE,
): number {
  return zonedParts(now, timeZone).hour;
}

/** Never allow report dates after today in org timezone. */
export function clampReportDateToToday(
  date: string,
  now = new Date(),
  timeZone = FIELD_DAILY_REPORT_TIMEZONE,
): string {
  const today = todayReportDateInOrgTz(now, timeZone);
  return compareReportDates(date, today) > 0 ? today : date;
}

/** Display label for a YYYY-MM-DD report calendar date (locale month, day, year). */
export function formatFieldDailyReportDateLabel(reportDate: string, locale: string): string {
  if (!DATE_ONLY_RE.test(reportDate)) return reportDate;
  const [y, m, d] = reportDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
