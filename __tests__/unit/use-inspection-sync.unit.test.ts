import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  subscribeConnectivityQuality: vi.fn(),
  getAllPending: vi.fn<() => Promise<unknown[]>>(),
  getPendingInspectionCount: vi.fn<() => Promise<number>>(),
  resetSyncAttemptsForManualRetry: vi.fn<() => Promise<number>>(),
  syncOne: vi.fn(),
}));

vi.mock("@/lib/offline/connectivity", () => ({
  subscribeConnectivityQuality: mocks.subscribeConnectivityQuality,
}));

vi.mock("@/lib/inspections/inspectionOfflineDb", () => ({
  getAllPending: mocks.getAllPending,
  getPendingInspectionCount: mocks.getPendingInspectionCount,
  resetSyncAttemptsForManualRetry: mocks.resetSyncAttemptsForManualRetry,
}));

vi.mock("@/lib/inspections/inspection-sync-one", () => ({
  syncOne: mocks.syncOne,
  InspectionSyncRejectedError: class InspectionSyncRejectedError extends Error {},
  InspectionSyncAuthRequiredError: class InspectionSyncAuthRequiredError extends Error {},
  InspectionSyncExhaustedError: class InspectionSyncExhaustedError extends Error {},
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("useInspectionSync", () => {
  let qualityListener: ((prev: string, next: string) => void) | undefined;
  let visibilityHandler: EventListener | undefined;
  let pageShowHandler: EventListener | undefined;
  const originalDocumentAdd = document.addEventListener.bind(document);
  const originalWindowAdd = window.addEventListener.bind(window);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    visibilityHandler = undefined;
    pageShowHandler = undefined;
    vi.stubGlobal("navigator", { onLine: true });
    vi.spyOn(document, "addEventListener").mockImplementation((type, listener, options) => {
      if (type === "visibilitychange") {
        visibilityHandler = listener as EventListener;
      }
      originalDocumentAdd(type, listener, options);
    });
    vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
      if (type === "pageshow") {
        pageShowHandler = listener as EventListener;
      }
      originalWindowAdd(type, listener, options);
    });
    mocks.getAllPending.mockResolvedValue([
      {
        localId: "local-1",
        formId: "form-1",
        templateSnapshot: {},
        projectId: "project-1",
        unitId: "unit-1",
        submittedByName: "Inspector",
        outcome: "FAIL",
        deficiencyCount: 0,
        payload: {},
        submittedAt: new Date().toISOString(),
      },
    ]);
    mocks.getPendingInspectionCount.mockResolvedValue(1);
    mocks.resetSyncAttemptsForManualRetry.mockResolvedValue(0);
    mocks.syncOne.mockResolvedValue(true);
    mocks.subscribeConnectivityQuality.mockImplementation((listener) => {
      qualityListener = listener;
      return vi.fn();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const pendingRecord = (localId: string, formId: string) => ({
    localId,
    formId,
    templateSnapshot: {},
    projectId: "project-1",
    unitId: "unit-1",
    submittedByName: "Inspector",
    outcome: "FAIL" as const,
    deficiencyCount: 0,
    payload: {},
    submittedAt: new Date().toISOString(),
  });

  it("flushes pending submissions on mount when the browser is online", async () => {
    const { useInspectionSync } = await import("@/lib/inspections/useInspectionSync");
    const { result } = renderHook(() => useInspectionSync());

    await vi.waitFor(() => {
      expect(mocks.getAllPending).toHaveBeenCalled();
      expect(mocks.syncOne).toHaveBeenCalledWith(
        "local-1",
        expect.objectContaining({ formId: "form-1", unitId: "unit-1" }),
        expect.objectContaining({ replayMetadata: expect.any(Object) }),
      );
      expect(result.current.pendingInspectionCount).toBe(1);
    });
  });

  it("resets attempt counters on manual flush", async () => {
    mocks.getAllPending.mockResolvedValue([]);
    mocks.getPendingInspectionCount.mockResolvedValue(0);

    const { tryFlushPending } = await import("@/lib/inspections/useInspectionSync");
    await tryFlushPending(undefined, { manual: true });

    expect(mocks.resetSyncAttemptsForManualRetry).toHaveBeenCalledTimes(1);
  });

  it("flushes again when tryFlushPending is invoked after an empty run", async () => {
    mocks.getAllPending
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          localId: "local-2",
          formId: "form-2",
          templateSnapshot: {},
          projectId: "project-1",
          unitId: "unit-1",
          submittedByName: "Inspector",
          outcome: "FAIL",
          deficiencyCount: 0,
          payload: {},
          submittedAt: new Date().toISOString(),
        },
      ]);

    const { tryFlushPending } = await import("@/lib/inspections/useInspectionSync");
    await tryFlushPending();
    await tryFlushPending();

    expect(mocks.getAllPending).toHaveBeenCalledTimes(2);
    expect(mocks.syncOne).toHaveBeenCalledWith(
      "local-2",
      expect.objectContaining({ formId: "form-2" }),
      expect.any(Object),
    );
  });

  it("does not flush when the browser reports offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { useInspectionSync } = await import("@/lib/inspections/useInspectionSync");
    renderHook(() => useInspectionSync());

    await vi.waitFor(() => {
      expect(mocks.getAllPending).not.toHaveBeenCalled();
      expect(mocks.syncOne).not.toHaveBeenCalled();
    });
  });

  it("coalesces concurrent flush attempts into one in-flight run", async () => {
    let resolveSync!: () => void;
    const syncGate = new Promise<boolean>((resolve) => {
      resolveSync = () => resolve(true);
    });
    mocks.syncOne.mockReturnValue(syncGate);

    const { tryFlushPending } = await import("@/lib/inspections/useInspectionSync");
    const first = tryFlushPending();
    const second = tryFlushPending();

    await vi.waitFor(() => {
      expect(mocks.getAllPending).toHaveBeenCalledTimes(1);
    });

    resolveSync();
    await Promise.all([first, second]);

    expect(mocks.syncOne).toHaveBeenCalledTimes(1);
  });

  it("flushes again when visibilitychange fires while the tab is visible", async () => {
    mocks.getAllPending
      .mockResolvedValueOnce([pendingRecord("local-1", "form-1")])
      .mockResolvedValueOnce([pendingRecord("local-2", "form-2")]);

    const { useInspectionSync, tryFlushPending } = await import("@/lib/inspections/useInspectionSync");
    renderHook(() => useInspectionSync());
    await tryFlushPending();

    expect(visibilityHandler).toBeDefined();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    visibilityHandler!(new Event("visibilitychange"));
    await tryFlushPending();

    expect(mocks.getAllPending).toHaveBeenCalledTimes(2);
    expect(mocks.syncOne).toHaveBeenCalledWith(
      "local-2",
      expect.objectContaining({ formId: "form-2" }),
      expect.any(Object),
    );
  });

  it("does not flush on visibilitychange when the tab is hidden", async () => {
    const { useInspectionSync } = await import("@/lib/inspections/useInspectionSync");
    renderHook(() => useInspectionSync());

    await vi.waitFor(() => {
      expect(mocks.syncOne.mock.calls.length).toBeGreaterThan(0);
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const callsAfterMount = mocks.syncOne.mock.calls.length;
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    visibilityHandler!(new Event("visibilitychange"));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mocks.syncOne.mock.calls.length).toBe(callsAfterMount);
  });

  it("flushes on pageshow (iPad bfcache resume)", async () => {
    mocks.getAllPending
      .mockResolvedValueOnce([pendingRecord("local-1", "form-1")])
      .mockResolvedValueOnce([pendingRecord("local-4", "form-4")]);

    const { useInspectionSync, tryFlushPending } = await import("@/lib/inspections/useInspectionSync");
    renderHook(() => useInspectionSync());
    await tryFlushPending();

    expect(pageShowHandler).toBeDefined();
    pageShowHandler!(new PageTransitionEvent("pageshow", { persisted: true }));
    await tryFlushPending();

    expect(mocks.getAllPending).toHaveBeenCalledTimes(2);
    expect(mocks.syncOne).toHaveBeenCalledWith(
      "local-4",
      expect.objectContaining({ formId: "form-4" }),
      expect.any(Object),
    );
  });

  it("flushes on the 60s interval while the tab is visible", async () => {
    vi.useFakeTimers();
    mocks.getAllPending
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([pendingRecord("local-3", "form-3")]);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });

    const { useInspectionSync } = await import("@/lib/inspections/useInspectionSync");
    renderHook(() => useInspectionSync());

    await vi.waitFor(() => {
      expect(mocks.getAllPending).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(60_000);

    await vi.waitFor(() => {
      expect(mocks.syncOne).toHaveBeenCalledWith(
        "local-3",
        expect.objectContaining({ formId: "form-3" }),
        expect.any(Object),
      );
    });
  });
});
