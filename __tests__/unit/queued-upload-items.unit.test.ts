import { describe, it, expect } from "vitest";
import {
  describeQueuedMutation,
  describeQueuedInspection,
} from "@/lib/offline/queued-upload-items";
import type { QueuedMutation } from "@/lib/offline/mutation-queue";
import type { PendingInspection } from "@/lib/inspections/inspectionOfflineDb";

function mutation(
  partial: Partial<QueuedMutation> & Pick<QueuedMutation, "type" | "url">,
): QueuedMutation {
  return {
    id: "m1",
    method: "POST",
    body: {},
    attempts: 0,
    queuedAt: 1_700_000_000_000,
    ...partial,
  };
}

describe("describeQueuedMutation", () => {
  it("labels unit status with location and status", () => {
    const item = describeQueuedMutation(
      mutation({
        type: "unit-status",
        url: "/api/projects/p1/units/row-1",
        method: "PATCH",
        body: {
          unit: "N204",
          building: "North",
          level: "2",
          scopeStage: "INSTALL",
          scopeStatus: "COMPLETE",
        },
      }),
    );
    expect(item.labelKey).toBe("queuedItemUnitStatus");
    expect(item.labelValues.location).toBe("N204");
    expect(String(item.labelValues.status)).toContain("Complete");
  });

  it("labels observation with title and unit", () => {
    const item = describeQueuedMutation(
      mutation({
        type: "create-observation",
        url: "/api/projects/p1/observations",
        body: {
          title: "Water stain",
          unitRef: "North|2|N204",
        },
      }),
    );
    expect(item.labelKey).toBe("queuedItemObservation");
    expect(item.labelValues.title).toBe("Water stain");
    expect(item.labelValues.location).toBe("N204");
  });

  it("labels issue with description", () => {
    const item = describeQueuedMutation(
      mutation({
        type: "create-issue",
        url: "/api/projects/p1/issues",
        body: { shortDescription: "Missing hardware", unitRef: "||Lobby" },
      }),
    );
    expect(item.labelKey).toBe("queuedItemIssue");
    expect(item.labelValues.description).toBe("Missing hardware");
  });

  it("labels observation comment with preview", () => {
    const item = describeQueuedMutation(
      mutation({
        type: "add-comment",
        url: "/api/projects/p1/observations/obs-1/comments",
        body: { body: "Follow up tomorrow" },
      }),
    );
    expect(item.labelKey).toBe("queuedItemCommentObservation");
    expect(item.labelValues.preview).toBe("Follow up tomorrow");
  });
});

describe("describeQueuedInspection", () => {
  it("labels scope inspection with form title and location detail line", () => {
    const item = describeQueuedInspection({
      localId: "loc-1",
      formId: "f1",
      templateSnapshot: {
        name: "Clear Inspection - Tile",
        level: "scope",
        category: "CLEAR_INSPECTION",
      },
      projectId: "p1",
      unitId: "North|2|N204",
      scopeRowId: "scope-1",
      scopeTypeCode: "TIL",
      submittedByName: "You",
      outcome: "PASS",
      deficiencyCount: 0,
      payload: {},
      submittedAt: "2026-06-26T19:00:00.000Z",
      synced: false,
    } satisfies PendingInspection);
    expect(item.labelKey).toBe("queuedItemInspectionTitle");
    expect(item.labelValues.formName).toBe("Clear Inspection - Tile");
    expect(item.detailKey).toBe("queuedItemInspectionDetailWithLocation");
    expect(item.detailValues?.location).toBe("N204 · TIL");
    expect(item.detailValues?.level).toBe("queuedItemLevelScope");
    expect(item.detailValues?.category).toBe("queuedItemCategoryClearInspection");
    expect(item.detailValues?.outcome).toBe("queuedItemOutcomePass");
  });

  it("labels project-level Daily Update without location", () => {
    const item = describeQueuedInspection({
      localId: "loc-2",
      formId: "f2",
      templateSnapshot: {
        name: "Daily Update",
        level: "project",
        category: "OTHER",
      },
      projectId: "p1",
      unitId: "||",
      submittedByName: "You",
      outcome: "COMPLETE",
      deficiencyCount: 0,
      payload: {},
      submittedAt: "2026-06-26T19:00:00.000Z",
      synced: false,
    } satisfies PendingInspection);
    expect(item.labelValues.formName).toBe("Daily Update");
    expect(item.detailKey).toBe("queuedItemInspectionDetail");
    expect(item.detailValues?.level).toBe("queuedItemLevelProject");
    expect(item.detailValues?.category).toBe("queuedItemCategoryOther");
    expect(item.detailValues?.outcome).toBe("queuedItemOutcomeComplete");
    expect(item.detailValues?.location).toBeUndefined();
  });

  it("does not show scope row id as location when unitId is an opaque database id", () => {
    const scopeRowId = "5f4aa6d8ce014449939b2bc95";
    const item = describeQueuedInspection({
      localId: "loc-4",
      formId: "f4",
      templateSnapshot: {
        name: "Clear Inspection",
        level: "scope",
        category: "CLEAR_INSPECTION",
      },
      projectId: "p1",
      unitId: scopeRowId,
      scopeRowId,
      scopeTypeCode: "TOP",
      submittedByName: "You",
      outcome: "FAIL",
      deficiencyCount: 0,
      payload: {},
      submittedAt: "2026-06-26T19:00:00.000Z",
      synced: false,
    } satisfies PendingInspection);
    expect(item.detailValues?.location).toBe("TOP");
    expect(String(item.detailValues?.location)).not.toContain(scopeRowId);
  });

  it("labels unit-level inspection with building and level when unit empty", () => {
    const item = describeQueuedInspection({
      localId: "loc-3",
      formId: "f3",
      templateSnapshot: {
        name: "Gypcrete Moisture Test",
        level: "unit",
        category: "GYPCRETE_MOISTURE_TEST",
      },
      projectId: "p1",
      unitId: "North|2|",
      submittedByName: "You",
      outcome: "FAIL",
      deficiencyCount: 1,
      payload: {},
      submittedAt: "2026-06-26T19:00:00.000Z",
      synced: false,
    } satisfies PendingInspection);
    expect(item.detailValues?.level).toBe("queuedItemLevelUnit");
    expect(item.detailValues?.location).toBe("North · L2");
  });
});
