import { describe, expect, it } from "vitest";
import { enrichActivityReplayMetadata } from "@/lib/activity-logger";

describe("enrichActivityReplayMetadata()", () => {
  it("computes offlineCacheDurationMs from clientQueuedAt and sync time", () => {
    const enriched = enrichActivityReplayMetadata(
      {
        replayedFromOfflineQueue: true,
        clientQueuedAt: "2026-06-27T15:00:00.000Z",
        offlineMutationId: "mut-1",
      },
      Date.parse("2026-06-27T15:23:00.000Z"),
    );
    expect(enriched.offlineCacheDurationMs).toBe(23 * 60_000);
  });

  it("leaves non-replay metadata unchanged", () => {
    expect(enrichActivityReplayMetadata({})).toEqual({});
  });

  it("does not overwrite an existing offlineCacheDurationMs", () => {
    const enriched = enrichActivityReplayMetadata(
      {
        replayedFromOfflineQueue: true,
        clientQueuedAt: "2026-06-27T15:00:00.000Z",
        offlineCacheDurationMs: 99,
      },
      Date.parse("2026-06-27T16:00:00.000Z"),
    );
    expect(enriched.offlineCacheDurationMs).toBe(99);
  });
});
