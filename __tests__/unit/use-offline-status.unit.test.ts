import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import {
  initBrowserOnlineStatusTracking,
  reconcileBrowserOnlineStatus,
  resetBrowserOnlineStatusForTests,
  setBrowserOnlineSnapshotForTests,
} from "@/lib/offline/browser-online-status";

describe("useOfflineStatus()", () => {
  beforeEach(() => {
    resetBrowserOnlineStatusForTests();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    initBrowserOnlineStatusTracking();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetBrowserOnlineStatusForTests();
  });

  it("reports online when navigator.onLine is true", async () => {
    const { result } = renderHook(() => useOfflineStatus());
    await waitFor(() => expect(result.current.isOnline).toBe(true));
    expect(result.current.wasOffline).toBe(false);
  });

  it("reports offline when navigator.onLine is false", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    reconcileBrowserOnlineStatus();
    const { result } = renderHook(() => useOfflineStatus());
    await waitFor(() => expect(result.current.isOnline).toBe(false));
  });

  it("transitions to offline when the 'offline' event fires", async () => {
    const { result } = renderHook(() => useOfflineStatus());
    await waitFor(() => expect(result.current.isOnline).toBe(true));

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current.isOnline).toBe(false);
    expect(result.current.wasOffline).toBe(false);
  });

  it("sets wasOffline=true briefly when coming back online", async () => {
    setBrowserOnlineSnapshotForTests(false);
    const { result } = renderHook(() => useOfflineStatus());
    await waitFor(() => expect(result.current.isOnline).toBe(false));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.wasOffline).toBe(true));
    expect(result.current.isOnline).toBe(true);
  });

  it("clears wasOffline after timeout when coming back online", async () => {
    vi.useFakeTimers();
    setBrowserOnlineSnapshotForTests(false);
    const { result } = renderHook(() => useOfflineStatus());
    expect(result.current.isOnline).toBe(false);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(result.current.wasOffline).toBe(true);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.wasOffline).toBe(false);

    vi.useRealTimers();
  });

  it("reconciles stale offline state when navigator.onLine is true", () => {
    setBrowserOnlineSnapshotForTests(false);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(() => useOfflineStatus());

    act(() => {
      reconcileBrowserOnlineStatus();
    });

    expect(result.current.isOnline).toBe(true);
  });
});
