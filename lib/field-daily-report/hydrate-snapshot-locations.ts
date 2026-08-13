import { db } from "@/lib/db";
import { formatFieldDailyLocationLabel } from "@/lib/field-daily-report/location-label";
import type { FieldDailyReportListedItem, FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

function inspectionItems(snapshot: FieldDailyReportProjectSnapshot): FieldDailyReportListedItem[] {
  return snapshot.inspections.summaryGroups?.flatMap((g) => g.items) ?? [];
}

function needsLocationBackfill(snapshot: FieldDailyReportProjectSnapshot): boolean {
  const listed = [...inspectionItems(snapshot), ...snapshot.issues.items, ...snapshot.observations.items];
  if (listed.some((item) => !item.locationLabel?.trim())) return true;
  if (snapshot.statusUpdates.sourceEvents.some((ev) => !ev.locationLabel?.trim())) return true;
  if (snapshot.statusUpdates.summaryGroups.some((g) => !g.locationLabel?.trim())) return true;
  return false;
}

/** Backfill location labels on snapshots saved before locationLabel was stored. */
export async function hydrateSnapshotLocations(
  snapshot: FieldDailyReportProjectSnapshot,
): Promise<FieldDailyReportProjectSnapshot> {
  if (!needsLocationBackfill(snapshot)) return snapshot;

  const logIds = new Set<string>();
  for (const item of [...inspectionItems(snapshot), ...snapshot.issues.items, ...snapshot.observations.items]) {
    if (item.activityLogId) logIds.add(item.activityLogId);
  }
  for (const ev of snapshot.statusUpdates.sourceEvents) {
    logIds.add(ev.activityLogId);
  }
  for (const group of snapshot.statusUpdates.summaryGroups) {
    for (const id of group.sourceActivityLogIds) logIds.add(id);
  }

  if (logIds.size === 0) return snapshot;

  const logs = await db.activityLog.findMany({
    where: { id: { in: [...logIds] } },
    select: { id: true, metadata: true },
  });
  const labelByLogId = new Map(
    logs.map((log) => [
      log.id,
      formatFieldDailyLocationLabel(
        typeof log.metadata === "object" && log.metadata !== null && !Array.isArray(log.metadata)
          ? (log.metadata as Record<string, unknown>)
          : {},
      ),
    ]),
  );

  const labelForLog = (id: string) => labelByLogId.get(id) ?? "Project level";
  const labelItem = (item: FieldDailyReportListedItem) => ({
    ...item,
    locationLabel: item.locationLabel?.trim() || labelForLog(item.activityLogId),
  });

  return {
    ...snapshot,
    statusUpdates: {
      summaryGroups: snapshot.statusUpdates.summaryGroups.map((group) => ({
        ...group,
        locationLabel:
          group.locationLabel?.trim() ||
          labelForLog(group.sourceActivityLogIds[0] ?? ""),
      })),
      sourceEvents: snapshot.statusUpdates.sourceEvents.map((ev) => ({
        ...ev,
        locationLabel: ev.locationLabel?.trim() || labelForLog(ev.activityLogId),
      })),
    },
    inspections: {
      summaryGroups: snapshot.inspections.summaryGroups.map((group) => ({
        ...group,
        items: group.items.map(labelItem),
      })),
    },
    issues: {
      items: snapshot.issues.items.map(labelItem),
    },
    observations: {
      items: snapshot.observations.items.map(labelItem),
    },
  };
}
