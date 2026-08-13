import { describe, expect, it } from "vitest";
import {
  appendOfflineCacheReplaySuffix,
  computeOfflineCacheDurationMs,
  formatOfflineCacheDurationCompactEn,
  isReplayedFromOfflineQueue,
  offlineQueueWaitMinutes,
  resolveOfflineCacheDurationMs,
} from "@/lib/activity/offline-replay-display";
import {
  isMutationSyncFailureEvent,
  isOfflineSyncFailureEvent,
} from "@/lib/activity/activity-sync-failure";

describe("offline-replay-display", () => {
  it("isReplayedFromOfflineQueue is true only after server sync", () => {
    expect(isReplayedFromOfflineQueue({ replayedFromOfflineQueue: true, pendingSync: true })).toBe(false);
    expect(isReplayedFromOfflineQueue({ replayedFromOfflineQueue: true })).toBe(true);
  });

  it("computeOfflineCacheDurationMs returns elapsed milliseconds", () => {
    expect(
      computeOfflineCacheDurationMs(
        "2026-06-27T15:00:00.000Z",
        Date.parse("2026-06-27T15:23:00.000Z"),
      ),
    ).toBe(23 * 60_000);
  });

  it("resolveOfflineCacheDurationMs prefers persisted offlineCacheDurationMs", () => {
    expect(
      resolveOfflineCacheDurationMs(
        { offlineCacheDurationMs: 120_000, clientQueuedAt: "2026-06-27T15:00:00.000Z" },
        "2026-06-27T16:00:00.000Z",
      ),
    ).toBe(120_000);
  });

  it("offlineQueueWaitMinutes computes minutes between queue and activity", () => {
    const minutes = offlineQueueWaitMinutes(
      { clientQueuedAt: "2026-06-27T15:00:00.000Z" },
      "2026-06-27T15:23:00.000Z",
    );
    expect(minutes).toBe(23);
  });

  it("formatOfflineCacheDurationCompactEn covers sub-minute, minutes, hours, and days", () => {
    expect(formatOfflineCacheDurationCompactEn(30_000)).toBe("under 1 min");
    expect(formatOfflineCacheDurationCompactEn(23 * 60_000)).toBe("23 min");
    expect(formatOfflineCacheDurationCompactEn(2 * 60 * 60_000 + 5 * 60_000)).toBe("2 hr 5 min");
    expect(formatOfflineCacheDurationCompactEn(26 * 60 * 60_000)).toBe("1 day 2 hr");
  });

  it("appendOfflineCacheReplaySuffix adds cache wait to descriptions", () => {
    expect(
      appendOfflineCacheReplaySuffix(
        'Reported "Loose trim"',
        {
          replayedFromOfflineQueue: true,
          offlineCacheDurationMs: 23 * 60_000,
        },
      ),
    ).toBe('Reported "Loose trim" · Uploaded from cache after 23 min');
  });
});

describe("offline sync failure event helpers", () => {
  it("isOfflineSyncFailureEvent covers inspection and mutation failures", () => {
    expect(isOfflineSyncFailureEvent("MUTATION_SYNC_FAILED", {})).toBe(true);
    expect(isOfflineSyncFailureEvent("INSPECTION_SYNC_FAILED", {})).toBe(true);
    expect(isMutationSyncFailureEvent("MUTATION_SYNC_FAILED")).toBe(true);
    expect(isOfflineSyncFailureEvent("OBSERVATION_CREATED", {})).toBe(false);
  });
});
