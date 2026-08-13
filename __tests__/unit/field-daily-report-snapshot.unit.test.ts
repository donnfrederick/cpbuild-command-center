import { describe, expect, it } from "vitest";
import { ActivityEventType } from "@prisma/client";
import {
  buildProjectSnapshot,
  buildStatusRollup,
  buildSubcontractorRollup,
  buildInspectionRollup,
  countStatusChangeUnitsForEvent,
  type ActivityLogRow,
} from "@/lib/field-daily-report/build-project-snapshot";

function row(
  partial: Partial<ActivityLogRow> & Pick<ActivityLogRow, "id" | "eventType">,
): ActivityLogRow {
  return {
    metadata: {},
    createdAt: new Date("2026-07-10T18:00:00.000Z"),
    ...partial,
  };
}

describe("buildStatusRollup", () => {
  it("groups bulk install-in-progress by status label with unit entries", () => {
    const events = [
      row({
        id: "bulk-1",
        eventType: ActivityEventType.SCOPE_STATUS_BULK_UPDATED,
        metadata: {
          count: 2,
          scopeStage: "INSTALL",
          scopeStatus: "IN_PROGRESS",
          unitRefs: [
            { building: "1", level: "2", unit: "201" },
            { building: "1", level: "2", unit: "202" },
          ],
        },
      }),
    ];
    const { summaryGroups, sourceEvents } = buildStatusRollup(events);
    expect(summaryGroups).toHaveLength(1);
    expect(summaryGroups[0].statusLabel).toContain("In Progress");
    expect(summaryGroups[0].unitEntries).toHaveLength(2);
    expect(summaryGroups[0].unitEntries[0].locationLabel).toBe("Bldg 1 · L2 · Unit 201");
    expect(summaryGroups[0].unitEntries[0]).toMatchObject({
      building: "1",
      level: "2",
      unit: "201",
    });
    expect(summaryGroups[0].sourceActivityLogIds).toEqual(["bulk-1"]);
    expect(sourceEvents).toHaveLength(1);
    expect(countStatusChangeUnitsForEvent(events[0])).toBe(2);
  });

  it("counts bulk status metadata count when unitRefs are absent", () => {
    const event = row({
      id: "bulk-2",
      eventType: ActivityEventType.SCOPE_STATUS_BULK_UPDATED,
      metadata: { count: 47, scopeStage: "INSTALL", scopeStatus: "IN_PROGRESS" },
    });
    expect(countStatusChangeUnitsForEvent(event)).toBe(47);
  });

  it("merges multiple units into the same status group", () => {
    const events = [
      row({
        id: "a1",
        eventType: ActivityEventType.SCOPE_STATUS_UPDATED,
        metadata: {
          building: "A",
          level: "2",
          unit: "201",
          scopeName: "Kitchen",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
      row({
        id: "a2",
        eventType: ActivityEventType.SCOPE_STATUS_UPDATED,
        metadata: {
          building: "A",
          level: "2",
          unit: "202",
          scopeName: "Bath",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
    ];
    const { summaryGroups } = buildStatusRollup(events);
    expect(summaryGroups).toHaveLength(1);
    expect(summaryGroups[0].statusLabel).toContain("Complete");
    expect(summaryGroups[0].unitEntries).toHaveLength(2);
    const totalIds = summaryGroups.flatMap((g) => g.sourceActivityLogIds);
    expect(totalIds.sort()).toEqual(["a1", "a2"]);
  });

  it("does not include scope inspection updates in status rollup", () => {
    const events = [
      row({
        id: "insp-1",
        eventType: ActivityEventType.SCOPE_INSPECTION_UPDATED,
        metadata: {
          building: "1",
          level: "5",
          unit: "503",
          scopeName: "TOPIU",
          fromInspectionStatus: "FAILED",
          toInspectionStatus: null,
        },
      }),
    ];
    const { summaryGroups } = buildStatusRollup(events);
    expect(summaryGroups).toHaveLength(0);
  });
});

describe("buildSubcontractorRollup", () => {
  it("groups units by subcontractor name", () => {
    const { summaryGroups } = buildSubcontractorRollup([
      row({
        id: "sub-1",
        eventType: ActivityEventType.SCOPE_SUBCONTRACTOR_UPDATED,
        metadata: {
          building: "1",
          level: "2",
          unit: "201",
          scopeName: "Cabinetry",
          toUnifierSubId: "sub-abc",
          subcontractorName: "Acme Install LLC",
        },
      }),
      row({
        id: "sub-2",
        eventType: ActivityEventType.SCOPE_SUBCONTRACTOR_UPDATED,
        metadata: {
          building: "1",
          level: "2",
          unit: "202",
          scopeName: "Cabinetry",
          toUnifierSubId: "sub-abc",
          subcontractorName: "Acme Install LLC",
        },
      }),
    ]);
    expect(summaryGroups).toHaveLength(1);
    expect(summaryGroups[0].subcontractorLabel).toBe("Acme Install LLC");
    expect(summaryGroups[0].unitEntries).toHaveLength(2);
  });
});

describe("buildProjectSnapshot", () => {
  it("lists issues individually with entity id", () => {
    const snap = buildProjectSnapshot([
      row({
        id: "i1",
        eventType: ActivityEventType.ISSUE_CREATED,
        metadata: { issueId: "issue-1", shortDescription: "Leak", isBlockingWork: true },
      }),
    ]);
    expect(snap.issues.items).toHaveLength(1);
    expect(snap.issues.items[0].issueId).toBe("issue-1");
    expect(snap.issues.items[0].locationLabel).toBe("Project level");
    expect(snap.issues.items[0].badge).toBe("Blocking");
    expect(snap.subcontractors.summaryGroups).toEqual([]);
  });

  it("lists issues with unitRef location", () => {
    const snap = buildProjectSnapshot([
      row({
        id: "i2",
        eventType: ActivityEventType.ISSUE_CREATED,
        metadata: {
          issueId: "issue-2",
          unitRef: "1|3|",
          shortDescription: "Leak",
        },
      }),
    ]);
    expect(snap.issues.items[0].locationLabel).toBe("Bldg 1 · L3");
  });

  it("counts install-complete transitions in progress", () => {
    const snap = buildProjectSnapshot([
      row({
        id: "s1",
        eventType: ActivityEventType.SCOPE_STATUS_UPDATED,
        metadata: { toStage: "INSTALL", toStatus: "COMPLETE" },
      }),
    ]);
    expect(snap.progress.installCompleteCount).toBe(1);
    expect(snap.progress.installCompleteVerifiedUnitDelta).toBe(1);
    expect(snap.progress.statusChangeCount).toBe(1);
    expect(snap.inspections.summaryGroups).toEqual([]);
  });

  it("nets install-complete verified scope delta when statuses are reverted", () => {
    const snap = buildProjectSnapshot([
      row({
        id: "s1",
        eventType: ActivityEventType.SCOPE_STATUS_UPDATED,
        metadata: {
          fromStage: "INSTALL",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
      row({
        id: "s2",
        eventType: ActivityEventType.SCOPE_STATUS_UPDATED,
        metadata: {
          fromStage: "INSTALL",
          fromStatus: "COMPLETE",
          toStage: "INSTALL",
          toStatus: "IN_PROGRESS",
        },
      }),
    ]);
    expect(snap.progress.installCompleteVerifiedUnitDelta).toBe(0);
  });

  it("subtracts bulk undo events that revert Install Complete-Verified", () => {
    const snap = buildProjectSnapshot([
      row({
        id: "bulk-1",
        eventType: ActivityEventType.SCOPE_STATUS_BULK_UPDATED,
        metadata: {
          scopeStage: "INSTALL",
          scopeStatus: "COMPLETE",
          unitRefs: [{ building: "1", level: "1", unit: "118" }],
        },
      }),
      row({
        id: "undo-1",
        eventType: ActivityEventType.SCOPE_STATUS_BULK_UNDONE,
        metadata: {
          fromStage: "INSTALL",
          fromStatus: "COMPLETE",
          unitRefs: [{ building: "1", level: "1", unit: "118" }],
        },
      }),
    ]);
    expect(snap.progress.installCompleteVerifiedUnitDelta).toBe(0);
  });

  it("counts each unit in a bulk status update toward statusChangeCount", () => {
    const snap = buildProjectSnapshot([
      row({
        id: "bulk-1",
        eventType: ActivityEventType.SCOPE_STATUS_BULK_UPDATED,
        metadata: {
          count: 3,
          scopeStage: "INSTALL",
          scopeStatus: "IN_PROGRESS",
          unitRefs: [
            { building: "1", level: "2", unit: "201" },
            { building: "1", level: "2", unit: "202" },
            { building: "1", level: "2", unit: "203" },
          ],
        },
      }),
      row({
        id: "bulk-2",
        eventType: ActivityEventType.SCOPE_STATUS_BULK_UPDATED,
        metadata: {
          count: 2,
          scopeStage: "INSTALL",
          scopeStatus: "IN_PROGRESS",
          unitRefs: [
            { building: "1", level: "3", unit: "301" },
            { building: "1", level: "3", unit: "302" },
          ],
        },
      }),
    ]);
    expect(snap.progress.statusChangeCount).toBe(5);
  });

  it("groups inspections by outcome", () => {
    const rollup = buildInspectionRollup([
      {
        itemKey: "i1",
        activityLogId: "i1",
        createdAt: "2026-07-10T18:00:00.000Z",
        headline: "Clear Inspection",
        badge: "PASS",
      },
    ]);
    expect(rollup.summaryGroups).toHaveLength(1);
    expect(rollup.summaryGroups[0].outcome).toBe("PASS");
  });

  it("includes unit-level inspection status updates in the inspections section", () => {
    const snap = buildProjectSnapshot([
      row({
        id: "insp-unit-1",
        eventType: ActivityEventType.SCOPE_INSPECTION_UPDATED,
        metadata: {
          building: "1",
          level: "2",
          unit: "201",
          scopeName: "Kitchen",
          fromInspectionStatus: "READY",
          toInspectionStatus: "PASSED",
        },
      }),
    ]);
    expect(snap.progress.inspectionSubmittedCount).toBe(1);
    expect(snap.inspections.summaryGroups).toHaveLength(1);
    expect(snap.inspections.summaryGroups[0].items[0].headline).toBe("Inspection → PASSED");
  });
});
