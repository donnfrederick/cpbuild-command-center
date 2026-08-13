import { describe, expect, it } from "vitest";
import {
  activityDisplayDedupFingerprint,
  dedupeActivityEventsForDisplay,
  dedupeActivityLogsForExport,
} from "@/lib/activity/display-dedup";
import { prepareActivityFeedForDisplay } from "@/lib/activity/prepare-activity-feed";

function statusEvent(
  id: string,
  createdAt: string,
  rowId: string,
  toStage: string | null,
  toStatus: string,
  extras: Record<string, unknown> = {},
) {
  return {
    id,
    eventType: "SCOPE_STATUS_UPDATED",
    userId: "user-1",
    userName: "Wesley",
    createdAt,
    metadata: {
      rowId,
      fromStage: "INSTALL",
      fromStatus: "COMPLETE",
      toStage,
      toStatus,
      ...extras,
    },
  };
}

function subEvent(id: string, createdAt: string, rowId: string, toSub: string) {
  return {
    id,
    eventType: "SCOPE_SUBCONTRACTOR_UPDATED",
    userId: "user-1",
    userName: "Wesley",
    createdAt,
    metadata: {
      rowId,
      fromUnifierSubId: null,
      toUnifierSubId: toSub,
      subcontractorName: "De La Cruz Building & Design",
    },
  };
}

describe("activityDisplayDedupFingerprint()", () => {
  it("keys status rows by rowId and destination status", () => {
    expect(
      activityDisplayDedupFingerprint(
        statusEvent("a", "2026-07-16T20:00:00.000Z", "row-1", "INSTALL", "COMPLETE"),
      ),
    ).toBe("status|row-1|INSTALL|COMPLETE");
  });
});

describe("dedupeActivityEventsForDisplay()", () => {
  it("collapses burst duplicate status updates within the default window", () => {
    const events = [
      statusEvent("3", "2026-07-16T20:05:00.000Z", "row-1", null, "NOT_STARTED"),
      statusEvent("2", "2026-07-16T20:04:30.000Z", "row-1", null, "NOT_STARTED"),
      statusEvent("1", "2026-07-16T20:04:00.000Z", "row-1", null, "NOT_STARTED"),
    ];

    const deduped = dedupeActivityEventsForDisplay(events);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("3");
  });

  it("keeps the same transition when outside the burst window", () => {
    const events = [
      statusEvent("2", "2026-07-16T20:10:00.000Z", "row-1", null, "NOT_STARTED"),
      statusEvent("1", "2026-07-16T19:00:00.000Z", "row-1", null, "NOT_STARTED"),
    ];

    expect(dedupeActivityEventsForDisplay(events)).toHaveLength(2);
  });

  it("collapses duplicate subcontractor assigns and keeps distinct subs", () => {
    const events = [
      subEvent("b", "2026-07-16T20:01:00.000Z", "row-1", "sub-a"),
      subEvent("a", "2026-07-16T20:00:00.000Z", "row-1", "sub-a"),
      subEvent("c", "2026-07-16T19:00:00.000Z", "row-1", "sub-b"),
    ];

    const deduped = dedupeActivityEventsForDisplay(events);
    expect(deduped.map((event) => event.id)).toEqual(["b", "c"]);
  });

  it("prefers server row over pending overlay with the same destination", () => {
    const pending = statusEvent(
      "pending:mut-1",
      "2026-07-16T20:00:00.000Z",
      "row-1",
      "INSTALL",
      "COMPLETE",
      { pendingSync: true, fromStage: null, fromStatus: null },
    );
    const server = statusEvent(
      "server-1",
      "2026-07-16T20:00:05.000Z",
      "row-1",
      "INSTALL",
      "COMPLETE",
    );

    const deduped = dedupeActivityEventsForDisplay([pending, server]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("server-1");
  });

  it("does not collapse unrelated event types", () => {
    const events = [
      statusEvent("s", "2026-07-16T20:00:00.000Z", "row-1", "INSTALL", "COMPLETE"),
      subEvent("sub", "2026-07-16T20:00:30.000Z", "row-1", "sub-a"),
    ];

    expect(dedupeActivityEventsForDisplay(events)).toHaveLength(2);
  });
});

describe("prepareActivityFeedForDisplay()", () => {
  it("drops pending status overlay when server already logged the same change", () => {
    const pending = [
      statusEvent(
        "pending:mut-1",
        "2026-07-16T20:00:00.000Z",
        "row-1",
        "INSTALL",
        "COMPLETE",
        { pendingSync: true, replayedFromOfflineQueue: true, fromStage: null, fromStatus: null },
      ),
    ];
    const server = [
      statusEvent("server-1", "2026-07-16T20:00:02.000Z", "row-1", "INSTALL", "COMPLETE"),
    ];

    const display = prepareActivityFeedForDisplay(pending, server);
    expect(display).toHaveLength(1);
    expect(display[0]?.id).toBe("server-1");
  });
});

describe("dedupeActivityLogsForExport()", () => {
  it("preserves Date objects and collapses burst duplicates for export rows", () => {
    const rows = [
      {
        id: "3",
        eventType: "SCOPE_STATUS_UPDATED",
        metadata: { rowId: "row-1", toStage: null, toStatus: "NOT_STARTED" },
        createdAt: new Date("2026-07-16T20:05:00.000Z"),
        userName: "Wesley",
      },
      {
        id: "2",
        eventType: "SCOPE_STATUS_UPDATED",
        metadata: { rowId: "row-1", toStage: null, toStatus: "NOT_STARTED" },
        createdAt: new Date("2026-07-16T20:04:30.000Z"),
        userName: "Wesley",
      },
      {
        id: "1",
        eventType: "SCOPE_STATUS_UPDATED",
        metadata: { rowId: "row-1", toStage: null, toStatus: "NOT_STARTED" },
        createdAt: new Date("2026-07-16T20:04:00.000Z"),
        userName: "Wesley",
      },
    ];

    const deduped = dedupeActivityLogsForExport(rows);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("3");
    expect(deduped[0]?.createdAt).toBeInstanceOf(Date);
  });
});
