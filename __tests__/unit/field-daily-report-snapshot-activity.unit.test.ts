import { describe, expect, it } from "vitest";
import { emptyProjectSnapshot, snapshotHasFieldActivity } from "@/lib/field-daily-report/snapshot-activity";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

describe("snapshotHasFieldActivity", () => {
  it("returns false for an empty snapshot", () => {
    expect(snapshotHasFieldActivity(emptyProjectSnapshot())).toBe(false);
  });

  it("returns true when status updates exist", () => {
    const snapshot: FieldDailyReportProjectSnapshot = {
      ...emptyProjectSnapshot(),
      statusUpdates: {
        summaryGroups: [
          {
            id: "g1",
            statusLabel: "Install: In Progress",
            unitEntries: [],
            sourceActivityLogIds: ["a1"],
          },
        ],
        sourceEvents: [],
      },
    };
    expect(snapshotHasFieldActivity(snapshot)).toBe(true);
  });

  it("returns true when teams on site exist", () => {
    const snapshot: FieldDailyReportProjectSnapshot = {
      ...emptyProjectSnapshot(),
      teamsOnSite: {
        summaryGroups: [
          {
            id: "t1",
            subcontractorLabel: "Crew A",
            unitEntries: [],
            sourceActivityLogIds: ["a1"],
          },
        ],
      },
    };
    expect(snapshotHasFieldActivity(snapshot)).toBe(true);
  });

  it("returns false when only live project % complete is present", () => {
    const snapshot: FieldDailyReportProjectSnapshot = {
      ...emptyProjectSnapshot(),
      progress: {
        ...emptyProjectSnapshot().progress,
        pctComplete: 12,
        pctCompleteDelta: 0,
        pctCompleteAtStartOfDay: 12,
        totalScopeQty: 100,
      },
    };
    expect(snapshotHasFieldActivity(snapshot)).toBe(false);
  });
});
