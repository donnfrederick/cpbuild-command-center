import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    activityLog: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { hydrateSnapshotLocations } from "@/lib/field-daily-report/hydrate-snapshot-locations";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

const baseSnapshot: FieldDailyReportProjectSnapshot = {
  progress: {
    statusChangeCount: 1,
    installCompleteCount: 0,
    installCompleteQtyToday: 0,
    inspectionSubmittedCount: 0,
    issuesCreatedCount: 1,
    issuesResolvedCount: 0,
    observationsCreatedCount: 0,
  },
  statusUpdates: { summaryGroups: [], sourceEvents: [] },
  subcontractors: { summaryGroups: [] },
  teamsOnSite: { summaryGroups: [] },
  inspections: { summaryGroups: [] },
  issues: {
    items: [
      {
        itemKey: "i1",
        activityLogId: "log-issue",
        createdAt: "2026-07-10T18:00:00.000Z",
        headline: "Leak",
      },
    ],
  },
  observations: { items: [] },
};

describe("hydrateSnapshotLocations", () => {
  beforeEach(() => {
    vi.mocked(db.activityLog.findMany).mockReset();
  });

  it("backfills missing locationLabel from activity log metadata", async () => {
    vi.mocked(db.activityLog.findMany).mockResolvedValue([
      { id: "log-issue", metadata: { unitRef: "1|3|" } },
    ] as never);

    const hydrated = await hydrateSnapshotLocations(baseSnapshot);
    expect(hydrated.issues.items[0].locationLabel).toBe("Bldg 1 · L3");
  });

  it("skips db query when all labels already present", async () => {
    const complete: FieldDailyReportProjectSnapshot = {
      ...baseSnapshot,
      issues: {
        items: [{ ...baseSnapshot.issues.items[0], locationLabel: "Bldg 1 · L3" }],
      },
    };
    const hydrated = await hydrateSnapshotLocations(complete);
    expect(db.activityLog.findMany).not.toHaveBeenCalled();
    expect(hydrated.issues.items[0].locationLabel).toBe("Bldg 1 · L3");
  });
});
