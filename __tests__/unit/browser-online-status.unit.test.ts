import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getBrowserOnlineSnapshot,
  initBrowserOnlineStatusTracking,
  reconcileBrowserOnlineStatus,
  resetBrowserOnlineStatusForTests,
  setBrowserOnlineSnapshotForTests,
  subscribeBrowserOnlineStatus,
} from "@/lib/offline/browser-online-status";
import { OFFLINE_SYNC_COMPLETE_EVENT } from "@/lib/offline/events";
import { notifyConnectivityQualityChange } from "@/lib/offline/connectivity";

describe("browser-online-status", () => {
  beforeEach(() => {
    resetBrowserOnlineStatusForTests();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetBrowserOnlineStatusForTests();
  });

  it("reconcileBrowserOnlineStatus keeps offline when navigator and probe fail", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    setBrowserOnlineSnapshotForTests(false);
    reconcileBrowserOnlineStatus();
    const { reconcileBrowserOnlineStatusViaProbe } = await import(
      "@/lib/offline/browser-online-status"
    );
    await reconcileBrowserOnlineStatusViaProbe();
    expect(getBrowserOnlineSnapshot()).toBe(false);
  });

  it("probe reconcile marks online when navigator is stale false but fetch succeeds", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    setBrowserOnlineSnapshotForTests(false);
    const { reconcileBrowserOnlineStatusViaProbe } = await import(
      "@/lib/offline/browser-online-status"
    );
    await reconcileBrowserOnlineStatusViaProbe();
    expect(getBrowserOnlineSnapshot()).toBe(true);
  });

  it("notifies subscribers when snapshot changes", () => {
    const listener = vi.fn();
    subscribeBrowserOnlineStatus(listener);
    setBrowserOnlineSnapshotForTests(false);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("init tracking picks up navigator.onLine after microtask", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    resetBrowserOnlineStatusForTests();
    initBrowserOnlineStatusTracking();
    await Promise.resolve();
    const { reconcileBrowserOnlineStatusViaProbe } = await import(
      "@/lib/offline/browser-online-status"
    );
    await reconcileBrowserOnlineStatusViaProbe();
    expect(getBrowserOnlineSnapshot()).toBe(false);
  });

  it("reconcile after missed online event restores online snapshot", () => {
    setBrowserOnlineSnapshotForTests(false);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    reconcileBrowserOnlineStatus();
    expect(getBrowserOnlineSnapshot()).toBe(true);
  });

  it("OFFLINE_SYNC_COMPLETE_EVENT marks online after successful flush", () => {
    setBrowserOnlineSnapshotForTests(false);
    initBrowserOnlineStatusTracking();
    window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT));
    expect(getBrowserOnlineSnapshot()).toBe(true);
  });

  it("connectivity quality good marks online", () => {
    setBrowserOnlineSnapshotForTests(false);
    initBrowserOnlineStatusTracking();
    notifyConnectivityQualityChange("offline", "good");
    expect(getBrowserOnlineSnapshot()).toBe(true);
  });
});
