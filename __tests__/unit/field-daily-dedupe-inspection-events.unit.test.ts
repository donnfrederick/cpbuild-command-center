import { describe, it, expect } from "vitest";
import { ActivityEventType } from "@prisma/client";
import type { ActivityLogRow } from "@/lib/field-daily-report/build-project-snapshot";
import { dedupeInspectionEventsForFieldDaily } from "@/lib/field-daily-report/dedupe-inspection-events";
import { buildProjectSnapshot } from "@/lib/field-daily-report/build-project-snapshot";

function row(partial: Partial<ActivityLogRow> & Pick<ActivityLogRow, "id" | "eventType" | "metadata">): ActivityLogRow {
  return {
    createdAt: new Date("2026-07-17T18:00:00.000Z"),
    ...partial,
  };
}

describe("dedupeInspectionEventsForFieldDaily()", () => {
  it("drops SCOPE_INSPECTION_UPDATED when a form submission exists for the same scope row", () => {
    const events = dedupeInspectionEventsForFieldDaily([
      row({
        id: "submit-1",
        eventType: ActivityEventType.INSPECTION_SUBMITTED,
        metadata: {
          submissionId: "sub-1",
          scopeRowId: "row-119",
          formName: "Clear Inspection",
          outcome: "FAIL",
        },
      }),
      row({
        id: "grid-1",
        eventType: ActivityEventType.SCOPE_INSPECTION_UPDATED,
        metadata: {
          rowId: "row-119",
          building: "1",
          level: "1",
          unit: "119",
          scopeName: "Countertops",
          toInspectionStatus: "FAILED",
        },
      }),
    ]);

    expect(events.map((e) => e.id)).toEqual(["submit-1"]);
  });

  it("keeps only the latest INSPECTION_SUBMITTED per scopeRowId when submissionIds differ", () => {
    const events = dedupeInspectionEventsForFieldDaily([
      row({
        id: "older",
        eventType: ActivityEventType.INSPECTION_SUBMITTED,
        createdAt: new Date("2026-07-17T18:00:00.000Z"),
        metadata: {
          submissionId: "sub-old",
          scopeRowId: "row-119",
          formName: "Clear Inspection",
          outcome: "FAIL",
        },
      }),
      row({
        id: "newer",
        eventType: ActivityEventType.INSPECTION_SUBMITTED,
        createdAt: new Date("2026-07-17T19:00:00.000Z"),
        metadata: {
          submissionId: "sub-new",
          scopeRowId: "row-119",
          formName: "Clear Inspection",
          outcome: "FAIL",
        },
      }),
    ]);

    expect(events.map((e) => e.id)).toEqual(["newer"]);
  });
});

describe("buildProjectSnapshot inspection dedupe integration", () => {
  it("lists one clear inspection item when submit + grid update both fire", () => {
    const snap = buildProjectSnapshot([
      row({
        id: "submit-1",
        eventType: ActivityEventType.INSPECTION_SUBMITTED,
        metadata: {
          submissionId: "sub-1",
          scopeRowId: "row-119",
          formName: "Clear Inspection",
          outcome: "FAIL",
          building: "1",
          level: "1",
          unit: "119",
          scopeName: "Countertops",
        },
      }),
      row({
        id: "grid-1",
        eventType: ActivityEventType.SCOPE_INSPECTION_UPDATED,
        metadata: {
          rowId: "row-119",
          building: "1",
          level: "1",
          unit: "119",
          scopeName: "Countertops",
          toInspectionStatus: "FAILED",
        },
      }),
    ]);

    expect(snap.inspections.summaryGroups).toHaveLength(1);
    expect(snap.inspections.summaryGroups[0].items).toHaveLength(1);
    expect(snap.inspections.summaryGroups[0].items[0].headline).toBe("Clear Inspection");
    expect(snap.progress.inspectionSubmittedCount).toBe(1);
  });
});
