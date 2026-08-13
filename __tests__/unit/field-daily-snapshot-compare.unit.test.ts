import { describe, expect, it } from "vitest";
import {
  fieldDailySnapshotContentEqual,
  shouldBumpFieldDailyGeneratedAt,
  stableFieldDailySnapshotContent,
} from "@/lib/field-daily-report/snapshot-compare";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

function baseSnapshot(
  overrides: Partial<FieldDailyReportProjectSnapshot> = {},
): FieldDailyReportProjectSnapshot {
  return {
    progress: {
      statusChangeCount: 1,
      installCompleteCount: 0,
      installCompleteQtyToday: 0,
      inspectionSubmittedCount: 0,
      issuesCreatedCount: 0,
      issuesResolvedCount: 0,
      observationsCreatedCount: 0,
      pctComplete: 42,
      pctCompleteDelta: 2,
    },
    statusUpdates: { summaryGroups: [], sourceEvents: [] },
    subcontractors: { summaryGroups: [] },
    teamsOnSite: { summaryGroups: [] },
    inspections: { summaryGroups: [] },
    issues: { items: [] },
    observations: { items: [] },
    ...overrides,
  };
}

describe("fieldDailySnapshotContentEqual", () => {
  it("ignores live pctComplete metrics when comparing snapshots", () => {
    const previous = baseSnapshot();
    const next = baseSnapshot({
      progress: {
        ...previous.progress,
        pctComplete: 99,
        pctCompleteDelta: 10,
        pctCompleteAtStartOfDay: 1,
        totalScopeQty: 500,
      },
    });
    expect(fieldDailySnapshotContentEqual(previous, next)).toBe(true);
  });

  it("detects new status activity", () => {
    const previous = baseSnapshot();
    const next = baseSnapshot({
      statusUpdates: {
        summaryGroups: [
          {
            id: "g1",
            statusLabel: "Install: In Progress",
            unitEntries: [],
            sourceActivityLogIds: ["log-1"],
          },
        ],
        sourceEvents: [],
      },
    });
    expect(fieldDailySnapshotContentEqual(previous, next)).toBe(false);
  });

  it("stableFieldDailySnapshotContent strips volatile progress fields", () => {
    const snapshot = baseSnapshot();
    expect(stableFieldDailySnapshotContent(snapshot).progress).not.toHaveProperty("pctComplete");
  });
});

describe("shouldBumpFieldDailyGeneratedAt", () => {
  it("always bumps on first generate", () => {
    expect(
      shouldBumpFieldDailyGeneratedAt({
        hasExistingReport: false,
        contentChanged: false,
        bumpGeneratedAt: false,
      }),
    ).toBe(true);
  });

  it("preserves timestamp when refresh finds no new content", () => {
    expect(
      shouldBumpFieldDailyGeneratedAt({
        hasExistingReport: true,
        contentChanged: false,
        bumpGeneratedAt: false,
      }),
    ).toBe(false);
  });

  it("bumps when content changed on refresh", () => {
    expect(
      shouldBumpFieldDailyGeneratedAt({
        hasExistingReport: true,
        contentChanged: true,
        bumpGeneratedAt: false,
      }),
    ).toBe(true);
  });

  it("bumps when caller forces update today", () => {
    expect(
      shouldBumpFieldDailyGeneratedAt({
        hasExistingReport: true,
        contentChanged: false,
        bumpGeneratedAt: true,
      }),
    ).toBe(true);
  });
});
