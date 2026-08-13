import { parseListLimit } from "@/lib/parse-list-limit";
import {
  clampReportDateToToday,
  compareReportDates,
  FIELD_DAILY_REPORT_TIMEZONE,
  parseReportDateParam,
  reportDateDaysBefore,
  todayReportDateInOrgTz,
} from "@/lib/field-daily-report/timezone";

export const FIELD_DAILY_HISTORY_PAGE_SIZE = 10;
export const FIELD_DAILY_HISTORY_DEFAULT_LOOKBACK_DAYS = 90;

export interface FieldDailyHistoryQuery {
  fromDate: string;
  toDate: string;
  cursor?: string;
  limit: number;
}

import type { HubActivityPreviewCounts } from "@/lib/field-daily-report/hub-activity-preview";

export interface FieldDailyHistoryListEntry {
  reportDate: string;
  generatedAt: string;
  hasActivity: boolean;
  activityPreview: HubActivityPreviewCounts;
}

export interface FieldDailyHistoryPage {
  entries: FieldDailyHistoryListEntry[];
  nextCursor: string | null;
  totalInRange: number;
}

/** Default date range when opening report history (last 90 days through today). */
export function defaultFieldDailyHistoryRange(now = new Date()): { fromDate: string; toDate: string } {
  const toDate = todayReportDateInOrgTz(now);
  const fromDate = reportDateDaysBefore(toDate, FIELD_DAILY_HISTORY_DEFAULT_LOOKBACK_DAYS);
  return { fromDate, toDate };
}

export function parseFieldDailyHistoryQuery(
  searchParams: URLSearchParams,
  now = new Date(),
): FieldDailyHistoryQuery | { error: string } {
  const defaults = defaultFieldDailyHistoryRange(now);
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const fromDate = fromRaw ? parseReportDateParam(fromRaw) : defaults.fromDate;
  const toDate = toRaw ? parseReportDateParam(toRaw) : defaults.toDate;

  if (fromRaw && !fromDate) return { error: "Invalid from date" };
  if (toRaw && !toDate) return { error: "Invalid to date" };

  const clampedTo = clampReportDateToToday(toDate!, now);
  const clampedFrom = fromDate!;
  if (compareReportDates(clampedFrom, clampedTo) > 0) {
    return { error: "from must be on or before to" };
  }

  const cursorRaw = searchParams.get("cursor");
  const cursor = cursorRaw ? parseReportDateParam(cursorRaw) : undefined;
  if (cursorRaw && !cursor) return { error: "Invalid cursor" };

  const limit = parseListLimit(searchParams.get("limit")) ?? FIELD_DAILY_HISTORY_PAGE_SIZE;

  return {
    fromDate: clampedFrom,
    toDate: clampedTo,
    cursor: cursor ?? undefined,
    limit: Math.min(limit, 50),
  };
}

const generatedAtFormat: Intl.DateTimeFormatOptions = {
  timeZone: FIELD_DAILY_REPORT_TIMEZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/** Locale date + time when the report was last generated (org timezone). */
export function formatFieldDailyReportGeneratedAt(generatedAt: string, locale: string): string {
  return new Date(generatedAt).toLocaleString(locale, generatedAtFormat);
}

/** @deprecated Prefer formatFieldDailyReportGeneratedAt with hubHistoryGeneratedAt i18n. */
export function fieldDailyReportHistoryTimeLabel(options: {
  reportDate: string;
  generatedAt: string;
  todayDate: string;
  locale: string;
}): string {
  void options.reportDate;
  void options.todayDate;
  return formatFieldDailyReportGeneratedAt(options.generatedAt, options.locale);
}
