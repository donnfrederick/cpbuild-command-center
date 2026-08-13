import { describe, expect, it } from "vitest";
import { buildHubActivityPreviewCounts, countStatusChangesFromSnapshot } from "@/lib/field-daily-report/hub-activity-preview";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

function emptySnapshot(overrides?: Partial<FieldDailyReportProjectSnapshot["progress"]>): FieldDailyReportProjectSnapshot {
  return {
    progress: {
      statusChangeCount: 0,
      installCompleteCount: 0,
      installCompleteQtyToday: 0,
      inspectionSubmittedCount: 0,
      issuesCreatedCount: 0,
      issuesResolvedCount: 0,
      observationsCreatedCount: 0,
      ...overrides,
    },
    statusUpdates: { summaryGroups: [], sourceEvents: [] },
    subcontractors: { summaryGroups: [] },
    teamsOnSite: { summaryGroups: [] },
    inspections: { summaryGroups: [] },
    issues: { items: [] },
    observations: { items: [] },
  };
}

describe("buildHubActivityPreviewCounts", () => {
  it("returns status changes and inspections from progress", () => {
    const counts = buildHubActivityPreviewCounts(
      emptySnapshot({ statusChangeCount: 5, inspectionSubmittedCount: 2 }),
    );
    expect(counts.statusChanges).toBe(5);
    expect(counts.inspections).toBe(2);
  });

  it("prefers unit entries in status rollup over stored progress count", () => {
    const snapshot = {
      ...emptySnapshot({ statusChangeCount: 5 }),
      statusUpdates: {
        summaryGroups: [
          {
            id: "status-0",
            statusLabel: "Install: In Progress",
            unitEntries: [
              { locationLabel: "U1", activityLogIds: ["a1"] },
              { locationLabel: "U2", activityLogIds: ["a1"] },
              { locationLabel: "U3", activityLogIds: ["a1"] },
            ],
            sourceActivityLogIds: ["a1"],
          },
          {
            id: "status-1",
            statusLabel: "Install: Complete",
            unitEntries: [
              { locationLabel: "U4", activityLogIds: ["a2"] },
              { locationLabel: "U5", activityLogIds: ["a2"] },
            ],
            sourceActivityLogIds: ["a2"],
          },
        ],
        sourceEvents: [],
      },
    };
    expect(countStatusChangesFromSnapshot(snapshot)).toBe(5);
    expect(buildHubActivityPreviewCounts(snapshot).statusChanges).toBe(5);
  });

  it("counts issues reported separately from other activity", () => {
    const counts = buildHubActivityPreviewCounts(
      emptySnapshot({
        issuesCreatedCount: 1,
        observationsCreatedCount: 2,
        issuesResolvedCount: 1,
      }),
    );
    expect(counts.issuesReported).toBe(1);
    expect(counts.otherActivity).toBe(3);
  });

  it("includes subcontractor assignment events in other activity", () => {
    const counts = buildHubActivityPreviewCounts({
      ...emptySnapshot(),
      subcontractors: {
        summaryGroups: [
          {
            id: "sub-1",
            subcontractorLabel: "CABIU",
            unitEntries: [],
            sourceActivityLogIds: ["a1", "a2"],
          },
        ],
      },
    });
    expect(counts.otherActivity).toBe(2);
  });
});
