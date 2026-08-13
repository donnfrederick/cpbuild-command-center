import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

/** Empty snapshot stored when a day has no field activity for this project. */
export function emptyProjectSnapshot(): FieldDailyReportProjectSnapshot {
  return {
    progress: {
      statusChangeCount: 0,
      installCompleteCount: 0,
      installCompleteQtyToday: 0,
      installCompleteVerifiedUnitDelta: 0,
      inspectionSubmittedCount: 0,
      issuesCreatedCount: 0,
      issuesResolvedCount: 0,
      observationsCreatedCount: 0,
      pctCompleteDelta: 0,
    },
    statusUpdates: { summaryGroups: [], sourceEvents: [] },
    subcontractors: { summaryGroups: [] },
    teamsOnSite: { summaryGroups: [] },
    inspections: { summaryGroups: [] },
    issues: { items: [] },
    observations: { items: [] },
  };
}

/** True when the snapshot captured any field activity for the report day. */
export function snapshotHasFieldActivity(snapshot: FieldDailyReportProjectSnapshot): boolean {
  const p = snapshot.progress;
  if (
    p.statusChangeCount > 0 ||
    p.installCompleteCount > 0 ||
    p.inspectionSubmittedCount > 0 ||
    p.issuesCreatedCount > 0 ||
    p.issuesResolvedCount > 0 ||
    p.observationsCreatedCount > 0
  ) {
    return true;
  }
  if (snapshot.statusUpdates.summaryGroups.length > 0) return true;
  if ((snapshot.subcontractors?.summaryGroups.length ?? 0) > 0) return true;
  if ((snapshot.teamsOnSite?.summaryGroups.length ?? 0) > 0) return true;
  if (snapshot.inspections.summaryGroups.length > 0) return true;
  if (snapshot.issues.items.length > 0) return true;
  if (snapshot.observations.items.length > 0) return true;
  return false;
}
