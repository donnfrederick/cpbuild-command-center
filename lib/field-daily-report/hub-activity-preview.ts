import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

export interface HubActivityPreviewCounts {
  statusChanges: number;
  inspections: number;
  issuesReported: number;
  otherActivity: number;
}

/** Unit-level status changes from rollup groups (bulk batches count each unit). */
export function countStatusChangesFromSnapshot(snapshot: FieldDailyReportProjectSnapshot): number {
  const fromRollup = snapshot.statusUpdates.summaryGroups.reduce(
    (sum, group) => sum + (group.unitEntries?.length ?? 0),
    0,
  );
  if (fromRollup > 0) return fromRollup;
  return snapshot.progress.statusChangeCount;
}

/** Activity counts for the project hub daily report preview card. */
export function buildHubActivityPreviewCounts(
  snapshot: FieldDailyReportProjectSnapshot,
): HubActivityPreviewCounts {
  const p = snapshot.progress;

  const subcontractorEvents = new Set(
    (snapshot.subcontractors?.summaryGroups ?? []).flatMap((g) => g.sourceActivityLogIds),
  ).size;

  const otherActivity =
    p.observationsCreatedCount + p.issuesResolvedCount + subcontractorEvents;

  return {
    statusChanges: countStatusChangesFromSnapshot(snapshot),
    inspections: p.inspectionSubmittedCount,
    issuesReported: p.issuesCreatedCount,
    otherActivity,
  };
}

export interface HubActivityPreviewLabelStrings {
  statusChanges: string;
  inspections: string;
  issuesReported: string;
  otherActivity: string;
}

/** Plain-text activity summary (matches DailyReportActivityPreviewLine). */
export function formatHubActivityPreviewLine(
  counts: HubActivityPreviewCounts,
  labels: HubActivityPreviewLabelStrings,
): string {
  const parts = [labels.statusChanges, labels.inspections];
  if (counts.issuesReported > 0) parts.push(labels.issuesReported);
  if (counts.otherActivity > 0) parts.push(labels.otherActivity);
  return parts.join(" · ");
}
