import {
  LOCATION_OUTCOME_VALUES,
  type LocationOutcome,
} from "@/lib/activity/activity-location-schema";
import type { HeatmapActivityEvent } from "@/lib/activity/heatmap/collapse-heatmap-events";

export interface LocationCoverageReport {
  totalActivities: number;
  onMapCount: number;
  coveragePercent: number;
  byOutcome: Record<LocationOutcome, number>;
  byUser: Array<{
    userId: string;
    userName: string;
    total: number;
    onMap: number;
    coveragePercent: number;
    byOutcome: Record<LocationOutcome, number>;
  }>;
}

function emptyOutcomeCounts(): Record<LocationOutcome, number> {
  return Object.fromEntries(LOCATION_OUTCOME_VALUES.map((o) => [o, 0])) as Record<
    LocationOutcome,
    number
  >;
}

export function buildLocationCoverageReport(events: HeatmapActivityEvent[]): LocationCoverageReport {
  const byOutcome = emptyOutcomeCounts();
  const userMap = new Map<
    string,
    { userName: string; byOutcome: Record<LocationOutcome, number>; total: number; onMap: number }
  >();

  for (const event of events) {
    const outcome = event.location.outcome;
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;

    const userId = event.userId ?? "unknown";
    const userName = event.userName ?? userId;
    const entry = userMap.get(userId) ?? {
      userName,
      byOutcome: emptyOutcomeCounts(),
      total: 0,
      onMap: 0,
    };
    entry.total += 1;
    entry.byOutcome[outcome] = (entry.byOutcome[outcome] ?? 0) + 1;
    if (outcome === "on_map") entry.onMap += 1;
    userMap.set(userId, entry);
  }

  const totalActivities = events.length;
  const onMapCount = byOutcome.on_map ?? 0;
  const coveragePercent =
    totalActivities > 0 ? Math.round((onMapCount / totalActivities) * 100) : 0;

  const byUser = [...userMap.entries()]
    .filter(([id]) => id !== "unknown")
    .map(([userId, entry]) => ({
      userId,
      userName: entry.userName,
      total: entry.total,
      onMap: entry.onMap,
      coveragePercent: entry.total > 0 ? Math.round((entry.onMap / entry.total) * 100) : 0,
      byOutcome: entry.byOutcome,
    }))
    .sort((a, b) => a.coveragePercent - b.coveragePercent);

  return {
    totalActivities,
    onMapCount,
    coveragePercent,
    byOutcome,
    byUser,
  };
}
