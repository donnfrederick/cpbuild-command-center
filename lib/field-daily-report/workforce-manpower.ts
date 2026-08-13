/** IM-entered daily headcount on `FieldDailyReportProject.dailyManpower`. */

export const MAX_DAILY_MANPOWER = 9999;

/** Parses a legacy workforce comment body into a non-negative integer, or null if unset/invalid. */
export function parseWorkforceManpower(body: string | null | undefined): number | null {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value < 0 || value > MAX_DAILY_MANPOWER) return null;
  return value;
}

export function isValidDailyManpower(value: number | null | undefined): value is number | null {
  if (value === null || value === undefined) return true;
  if (!Number.isInteger(value)) return false;
  return value >= 0 && value <= MAX_DAILY_MANPOWER;
}

/** Prefer the DB column; fall back to legacy comment body during migration. */
export function legacyWorkforceCommentBody(
  comments: Array<{ sectionKey: string; itemKey: string; body: string }>,
): string {
  return comments.find((c) => c.sectionKey === "workforce" && c.itemKey === "")?.body ?? "";
}

export function resolveDailyManpower(
  dailyManpower: number | null | undefined,
  legacyCommentBody?: string | null,
): number | null {
  if (typeof dailyManpower === "number") {
    return Number.isFinite(dailyManpower) ? dailyManpower : null;
  }
  return parseWorkforceManpower(legacyCommentBody);
}

export function isDailyManpowerMissing(
  dailyManpower: number | null | undefined,
  legacyCommentBody?: string | null,
): boolean {
  return resolveDailyManpower(dailyManpower, legacyCommentBody) === null;
}

export function formatWorkforceManpowerForPdf(summaryTemplate: string, count: number): string {
  if (!Number.isFinite(count)) {
    return summaryTemplate.replace(/\{count[^}]*\}/g, "—");
  }
  return summaryTemplate.replace(/\{count\}/g, String(count));
}
