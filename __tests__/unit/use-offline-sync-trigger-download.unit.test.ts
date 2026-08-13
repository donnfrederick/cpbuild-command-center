/**
 * use-offline-sync — triggerDownload overlay gating.
 * Overlay only when showProgressOverlay: true (projects list manual pre-download).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import {
  resetLocalOfflinePrefsStoreForTests,
  writeLocalOfflinePrefs,
} from "@/lib/offline/offline-prefs-local";

const mockTriggerResync = vi.fn();

vi.mock("@/hooks/use-offline-status", () => ({
  useOfflineStatus: () => ({ isOnline: true, wasOffline: false }),
}));

vi.mock("@/lib/offline/mutation-queue", () => ({
  getPendingCount: vi.fn().mockResolvedValue(0),
  flushMutationQueue: vi.fn().mockResolvedValue({ flushed: 0, failed: 0 }),
}));

vi.mock("@/lib/offline/background-sync", () => ({
  triggerResync: (...args: unknown[]) => mockTriggerResync(...args),
  cancelActiveResync: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetLocalOfflinePrefsStoreForTests();
  mockTriggerResync.mockResolvedValue({ ok: true, syncedAt: "2026-06-19T12:00:00.000Z" });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ offlineProjectIds: [], projectSyncedAt: {} }),
    }),
  );
});

afterEach(() => {
  resetLocalOfflinePrefsStoreForTests();
});

describe("useOfflineSync offline prefs hydration", () => {
  it("hides localStorage prefs on first render, then exposes them after mount", async () => {
    writeLocalOfflinePrefs({
      offlineProjectIds: ["proj-cached"],
      projectSyncedAt: { "proj-cached": "2026-06-19T11:00:00.000Z" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          offlineProjectIds: ["proj-cached"],
          projectSyncedAt: { "proj-cached": "2026-06-19T11:00:00.000Z" },
        }),
      }),
    );

    let firstRenderHasCached = false;
    let capturedFirstRender = false;

    const { result, rerender } = renderHook(
      ({ hydrated }: { hydrated: boolean }) => {
        const state = useOfflineSync(hydrated);
        if (!capturedFirstRender) {
          firstRenderHasCached = state.offlineProjectIds.has("proj-cached");
          capturedFirstRender = true;
        }
        return state;
      },
      { initialProps: { hydrated: false } },
    );

    expect(firstRenderHasCached).toBe(false);

    rerender({ hydrated: true });

    await waitFor(() => {
      expect(result.current.offlineProjectIds.has("proj-cached")).toBe(true);
    });
    expect(result.current.lastSyncedAt("proj-cached")).toBe("2026-06-19T11:00:00.000Z");
  });
});

describe("useOfflineSync triggerDownload overlay", () => {
  it("does not populate downloadState for silent project-page sync", async () => {
    const { result } = renderHook(() => useOfflineSync(true));

    await act(async () => {
      await result.current.triggerDownload("proj-1");
    });

    await waitFor(() => {
      expect(result.current.isDownloading).toBe(false);
    });

    expect(result.current.downloadState).toBeNull();
    expect(mockTriggerResync).toHaveBeenCalled();
  });

  it("populates downloadState when showProgressOverlay is true", async () => {
    let releaseResync!: () => void;
    const resyncGate = new Promise<{ ok: boolean; syncedAt: string }>((resolve) => {
      releaseResync = () => resolve({ ok: true, syncedAt: "2026-06-19T12:00:00.000Z" });
    });

    mockTriggerResync.mockImplementation(
      async (_ids: string[], onProgress?: (p: { percent: number; phase: string }) => void) => {
        onProgress?.({ percent: 55, phase: "warmingApis" });
        return resyncGate;
      },
    );

    const { result } = renderHook(() => useOfflineSync(true));

    await act(async () => {
      void result.current.triggerDownload("proj-2", {
        projectName: "Test Project",
        showProgressOverlay: true,
      });
    });

    await waitFor(() => {
      expect(result.current.downloadState?.percent).toBe(55);
    });

    expect(result.current.downloadState?.projectName).toBe("Test Project");
    expect(result.current.downloadProgress).toBe(55);

    await act(async () => {
      releaseResync();
    });

    await waitFor(() => {
      expect(result.current.downloadState).toBeNull();
    });
  });
});
