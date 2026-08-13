import { describe, it, expect, beforeEach } from "vitest";
import {
  readLocalOfflinePrefs,
  writeLocalOfflinePrefs,
  isProjectPreDownloaded,
  getLocalOfflinePrefsServerSnapshot,
  getLocalOfflinePrefsSnapshot,
  subscribeLocalOfflinePrefs,
  resetLocalOfflinePrefsStoreForTests,
} from "@/lib/offline/offline-prefs-local";

describe("offline-prefs-local", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLocalOfflinePrefsStoreForTests();
  });

  it("round-trips offline prefs through localStorage", () => {
    writeLocalOfflinePrefs({
      offlineProjectIds: ["a", "b"],
      projectSyncedAt: { a: "2026-01-01T00:00:00.000Z" },
    });
    expect(readLocalOfflinePrefs()).toEqual({
      offlineProjectIds: ["a", "b"],
      projectSyncedAt: { a: "2026-01-01T00:00:00.000Z" },
    });
  });

  it("isProjectPreDownloaded is true when id is listed or has sync timestamp", () => {
    const ids = new Set(["x"]);
    expect(isProjectPreDownloaded("x", ids, {})).toBe(true);
    expect(isProjectPreDownloaded("y", new Set(), { y: "2026-01-01T00:00:00.000Z" })).toBe(true);
    expect(isProjectPreDownloaded("z", new Set(), {})).toBe(false);
  });

  it("server snapshot is empty so SSR matches pre-hydration client", () => {
    writeLocalOfflinePrefs({
      offlineProjectIds: ["cached"],
      projectSyncedAt: { cached: "2026-01-01T00:00:00.000Z" },
    });
    expect(getLocalOfflinePrefsServerSnapshot()).toEqual({
      offlineProjectIds: [],
      projectSyncedAt: {},
    });
    expect(getLocalOfflinePrefsSnapshot().offlineProjectIds).toContain("cached");
  });

  it("notifies subscribers when prefs are written", () => {
    let calls = 0;
    const unsub = subscribeLocalOfflinePrefs(() => {
      calls += 1;
    });
    writeLocalOfflinePrefs({ offlineProjectIds: ["a"], projectSyncedAt: {} });
    expect(calls).toBe(1);
    unsub();
  });

  it("getSnapshot returns a stable reference across consecutive reads", () => {
    writeLocalOfflinePrefs({
      offlineProjectIds: ["cached"],
      projectSyncedAt: { cached: "2026-01-01T00:00:00.000Z" },
    });
    const a = getLocalOfflinePrefsSnapshot();
    const b = getLocalOfflinePrefsSnapshot();
    expect(a).toBe(b);
  });

  it("getSnapshot matches server snapshot before client cache is populated", () => {
    resetLocalOfflinePrefsStoreForTests();
    expect(getLocalOfflinePrefsSnapshot()).toEqual(getLocalOfflinePrefsServerSnapshot());
    writeLocalOfflinePrefs({
      offlineProjectIds: ["cached"],
      projectSyncedAt: { cached: "2026-01-01T00:00:00.000Z" },
    });
    expect(getLocalOfflinePrefsSnapshot().offlineProjectIds).toContain("cached");
  });
});
