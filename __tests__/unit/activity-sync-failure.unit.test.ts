import { describe, expect, it } from "vitest";
import {
  filterPendingInspectionEventsDeduped,
  filterPendingSemanticDuplicatesAgainstServer,
  filterPendingSyncFailuresDeduped,
  isInspectionSyncFailureEvent,
} from "@/lib/activity/activity-sync-failure";

describe("activity-sync-failure helpers", () => {
  it("isInspectionSyncFailureEvent detects INSPECTION_SYNC_FAILED and legacy flag", () => {
    expect(isInspectionSyncFailureEvent("INSPECTION_SYNC_FAILED", {})).toBe(true);
    expect(isInspectionSyncFailureEvent("INSPECTION_SUBMITTED", { syncFailed: true })).toBe(true);
    expect(isInspectionSyncFailureEvent("INSPECTION_SUBMITTED", {})).toBe(false);
  });

  it("filterPendingSyncFailuresDeduped drops pending when server row exists", () => {
    const pending = [
      {
        eventType: "INSPECTION_SYNC_FAILED",
        metadata: { offlineMutationId: "local-1" },
      },
      {
        eventType: "ISSUE_CREATED",
        metadata: { issueId: "i1" },
      },
    ];
    const server = [
      {
        eventType: "INSPECTION_SYNC_FAILED",
        metadata: { offlineMutationId: "local-1" },
      },
    ];
    const filtered = filterPendingSyncFailuresDeduped(pending, server);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.eventType).toBe("ISSUE_CREATED");
  });

  it("filterPendingInspectionEventsDeduped drops pending when server already synced offline id", () => {
    const pending = [
      {
        eventType: "INSPECTION_SUBMITTED",
        metadata: { offlineMutationId: "local-1", pendingSync: true },
      },
      {
        eventType: "OBSERVATION_CREATED",
        metadata: { offlineMutationId: "local-2", pendingSync: true },
      },
    ];
    const server = [
      {
        eventType: "INSPECTION_SUBMITTED",
        metadata: { offlineMutationId: "local-1", replayedFromOfflineQueue: true },
      },
      {
        eventType: "OBSERVATION_CREATED",
        metadata: { offlineMutationId: "local-2", replayedFromOfflineQueue: true },
      },
    ];
    const filtered = filterPendingInspectionEventsDeduped(pending, server);
    expect(filtered).toHaveLength(0);
  });

  it("filterPendingSemanticDuplicatesAgainstServer drops pending status when server matches destination", () => {
    const pending = [
      {
        id: "pending:status-1",
        eventType: "SCOPE_STATUS_UPDATED",
        createdAt: "2026-07-16T20:00:00.000Z",
        metadata: {
          pendingSync: true,
          rowId: "row-1",
          fromStage: null,
          fromStatus: null,
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      },
    ];
    const server = [
      {
        eventType: "SCOPE_STATUS_UPDATED",
        createdAt: "2026-07-16T20:00:03.000Z",
        metadata: {
          rowId: "row-1",
          fromStage: null,
          fromStatus: null,
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      },
    ];

    const filtered = filterPendingSemanticDuplicatesAgainstServer(pending, server);
    expect(filtered).toHaveLength(0);
  });
});
