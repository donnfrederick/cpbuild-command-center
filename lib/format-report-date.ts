/** Compact date for report grids (e.g. 1/6/25). */
export function formatReportDate(
  iso: string | null | undefined,
  locale: string,
  empty = "—",
): string {
  if (!iso) return empty;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return empty;
  return d.toLocaleDateString(locale, { month: "numeric", day: "numeric", year: "2-digit" });
}

/** Month/day only — for narrow Δ column headers (e.g. 5/27). */
export function formatReportDateMonthDay(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { month: "numeric", day: "numeric" });
}

/** Compact inclusive range for compare-period headers (e.g. 5/27–6/2). */
export function formatReportDateRangeCompact(from: string, to: string, locale: string): string {
  return `${formatReportDateMonthDay(from, locale)}–${formatReportDateMonthDay(to, locale)}`;
}
