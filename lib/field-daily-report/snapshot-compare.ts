import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

/** Activity-bound progress fields — excludes live % complete metrics. */
function stableProgressForCompare(
  progress: FieldDailyReportProjectSnapshot["progress"],
): FieldDailyReportProjectSnapshot["progress"] {
  return {
    statusChangeCount: progress.statusChangeCount,
    installCompleteCount: progress.installCompleteCount,
    installCompleteQtyToday: progress.installCompleteQtyToday,
    installCompleteVerifiedUnitDelta: progress.installCompleteVerifiedUnitDelta ?? 0,
    inspectionSubmittedCount: progress.inspectionSubmittedCount,
    issuesCreatedCount: progress.issuesCreatedCount,
    issuesResolvedCount: progress.issuesResolvedCount,
    observationsCreatedCount: progress.observationsCreatedCount,
  };
}

/** Snapshot shape used to detect new field activity (ignores live project % metrics). */
export function stableFieldDailySnapshotContent(
  snapshot: FieldDailyReportProjectSnapshot,
): Omit<FieldDailyReportProjectSnapshot, "progress"> & {
  progress: ReturnType<typeof stableProgressForCompare>;
} {
  return {
    progress: stableProgressForCompare(snapshot.progress),
    statusUpdates: snapshot.statusUpdates,
    subcontractors: snapshot.subcontractors,
    teamsOnSite: snapshot.teamsOnSite,
    inspections: snapshot.inspections,
    issues: snapshot.issues,
    observations: snapshot.observations,
  };
}

/** True when regenerated snapshot content matches the saved report body. */
export function fieldDailySnapshotContentEqual(
  previous: FieldDailyReportProjectSnapshot,
  next: FieldDailyReportProjectSnapshot,
): boolean {
  return (
    JSON.stringify(stableFieldDailySnapshotContent(previous)) ===
    JSON.stringify(stableFieldDailySnapshotContent(next))
  );
}

export function shouldBumpFieldDailyGeneratedAt(options: {
  hasExistingReport: boolean;
  contentChanged: boolean;
  bumpGeneratedAt: boolean;
}): boolean {
  if (!options.hasExistingReport) return true;
  return options.bumpGeneratedAt || options.contentChanged;
}
