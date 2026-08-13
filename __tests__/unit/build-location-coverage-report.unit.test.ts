import { describe, expect, it } from "vitest";
import { buildLocationCoverageReport } from "@/lib/activity/heatmap/build-location-coverage-report";
import type { HeatmapActivityEvent } from "@/lib/activity/heatmap/collapse-heatmap-events";

describe("buildLocationCoverageReport()", () => {
  it("computes coverage percent and outcome buckets", () => {
    const events: HeatmapActivityEvent[] = [
      {
        activityLogId: "1",
        userId: "u1",
        userName: "A",
        projectId: "p1",
        eventType: "SCOPE_STATUS_UPDATED",
        createdAt: new Date(),
        rowId: "r1",
        location: { outcome: "on_map" },
      },
      {
        activityLogId: "2",
        userId: "u1",
        userName: "A",
        projectId: "p1",
        eventType: "ISSUE_CREATED",
        createdAt: new Date(),
        rowId: null,
        location: { outcome: "denied" },
      },
      {
        activityLogId: "3",
        userId: "u2",
        userName: "B",
        projectId: "p1",
        eventType: "OBSERVATION_CREATED",
        createdAt: new Date(),
        rowId: null,
        location: { outcome: "legacy" },
      },
    ];

    const report = buildLocationCoverageReport(events);
    expect(report.totalActivities).toBe(3);
    expect(report.onMapCount).toBe(1);
    expect(report.coveragePercent).toBe(33);
    expect(report.byOutcome.denied).toBe(1);
    expect(report.byOutcome.legacy).toBe(1);
    expect(report.byUser).toHaveLength(2);
  });
});
