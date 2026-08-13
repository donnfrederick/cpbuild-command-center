import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("connectivity", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("probeConnectivityQuality returns offline when navigator is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { probeConnectivityQuality } = await import("@/lib/offline/connectivity");
    await expect(probeConnectivityQuality()).resolves.toBe("offline");
  });

  it("probeConnectivityQuality ignores navigator offline when requested", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ({ ok: true })),
    );
    const { probeConnectivityQuality } = await import("@/lib/offline/connectivity");
    await expect(
      probeConnectivityQuality(3000, { ignoreNavigatorOffline: true }),
    ).resolves.toBe("good");
  });

  it("probeConnectivityQuality returns good when connectivity endpoint responds quickly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ({
        ok: true,
      })),
    );
    const { probeConnectivityQuality } = await import("@/lib/offline/connectivity");
    await expect(probeConnectivityQuality(3000)).resolves.toBe("good");
  });

  it("probeConnectivityQuality returns slow when connectivity probe exceeds budget", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true }), 3500);
          }),
      ),
    );
    const { probeConnectivityQuality } = await import("@/lib/offline/connectivity");
    const promise = probeConnectivityQuality(3000);
    await vi.advanceTimersByTimeAsync(3500);
    await expect(promise).resolves.toBe("slow");
  });

  it("shouldDeferNetworkWork returns true for slow quality", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network")),
    );
    const { shouldDeferNetworkWork } = await import("@/lib/offline/connectivity");
    await expect(shouldDeferNetworkWork({ bypassCache: true })).resolves.toBe(true);
  });

  it("fetchWithTimeout aborts when the request exceeds the budget", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_input: RequestInfo, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );
    const { fetchWithTimeout } = await import("@/lib/offline/connectivity");
    const promise = fetchWithTimeout("/api/test", {}, 100);
    const expectation = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(100);
    await expectation;
  });

  it("getConnectivityQuality uses cache within TTL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { getConnectivityQuality } = await import("@/lib/offline/connectivity");
    await expect(getConnectivityQuality()).resolves.toBe("good");
    await expect(getConnectivityQuality()).resolves.toBe("good");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("notifyConnectivityQualityChange invokes subscribers", async () => {
    const { notifyConnectivityQualityChange, subscribeConnectivityQuality } =
      await import("@/lib/offline/connectivity");
    const listener = vi.fn();
    const unsubscribe = subscribeConnectivityQuality(listener);
    notifyConnectivityQualityChange("slow", "good");
    expect(listener).toHaveBeenCalledWith("slow", "good");
    unsubscribe();
    notifyConnectivityQualityChange("good", "slow");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifyConnectivityQualityChange continues when a listener throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { notifyConnectivityQualityChange, subscribeConnectivityQuality } =
      await import("@/lib/offline/connectivity");
    const failing = vi.fn(() => {
      throw new Error("boom");
    });
    const succeeding = vi.fn();
    subscribeConnectivityQuality(failing);
    subscribeConnectivityQuality(succeeding);
    notifyConnectivityQualityChange("slow", "good");
    expect(succeeding).toHaveBeenCalledWith("slow", "good");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("notifyConnectivityQualityChange refreshes cached quality for shouldDeferNetworkWork", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network")),
    );
    const {
      clearConnectivityCache,
      getConnectivityQuality,
      notifyConnectivityQualityChange,
      shouldDeferNetworkWork,
    } = await import("@/lib/offline/connectivity");

    clearConnectivityCache();
    await expect(getConnectivityQuality()).resolves.toBe("slow");
    await expect(shouldDeferNetworkWork()).resolves.toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );
    notifyConnectivityQualityChange("slow", "good");
    await expect(shouldDeferNetworkWork()).resolves.toBe(false);
  });
});
