import type { FieldDailyReportListedItem } from "@/lib/field-daily-report/types";

function locationOutcomeKey(item: FieldDailyReportListedItem): string {
  return `${item.locationLabel}|${item.headline}|${(item.badge ?? "").toUpperCase()}`;
}

/**
 * Collapse duplicate inspection lines in a rollup bucket.
 * Prefers rows with submissionId (form submit) over grid-only activity rows at the same location.
 */
export function dedupeInspectionListedItems(
  items: FieldDailyReportListedItem[],
): FieldDailyReportListedItem[] {
  const submissionByLocation = new Map<string, FieldDailyReportListedItem>();
  for (const item of items) {
    if (!item.submissionId) continue;
    submissionByLocation.set(locationOutcomeKey(item), item);
  }

  const kept: FieldDailyReportListedItem[] = [];
  const seenSubmissionIds = new Set<string>();
  const seenLocationOnly = new Set<string>();

  for (const item of items) {
    if (item.submissionId) {
      if (seenSubmissionIds.has(item.submissionId)) continue;
      seenSubmissionIds.add(item.submissionId);
      kept.push(item);
      continue;
    }

    const locKey = locationOutcomeKey(item);
    if (submissionByLocation.has(locKey)) continue;
    if (seenLocationOnly.has(locKey)) continue;
    seenLocationOnly.add(locKey);
    kept.push(item);
  }

  return kept;
}
