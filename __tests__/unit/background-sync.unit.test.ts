/**
 * Unit tests for lib/offline/background-sync.ts
 *
 * Covers: triggerResync return shape, offline guard,
 * cache warming, and initBackgroundSync idempotency.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/offline/run-batched-frame-loads", () => ({
  runBatchedFrameLoads: vi.fn().mockResolvedValue(undefined),
}));

import { runBatchedFrameLoads } from "@/lib/offline/run-batched-frame-loads";

describe("background-sync / triggerResync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state (intervalId) by re-importing fresh each test
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { ok: false, syncedAt: null } when fetch throws (offline)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const { triggerResync } = await import("@/lib/offline/background-sync");
    const result = await triggerResync();
    expect(result).toEqual({ ok: false, syncedAt: null });
  });

  it("returns { ok: false, syncedAt: null } when snapshot returns non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const { triggerResync } = await import("@/lib/offline/background-sync");
    const result = await triggerResync();
    expect(result).toEqual({ ok: false, syncedAt: null });
  });

  it("calls fetch with scoped URL when projectIds provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ json: async () => ({}) }),
      json: async () => ({ data: { projects: [] }, generatedAt: new Date().toISOString() }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const { triggerResync } = await import("@/lib/offline/background-sync");
    await triggerResync(["proj-1", "proj-2"]);

    // fetch is now called with (url, { cache: "reload" }) to bypass HTTP cache
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("projectIds=proj-1,proj-2"),
      expect.objectContaining({ cache: "reload" }),
    );
  });

  it("warms API caches for returned project IDs", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ json: async () => ({}) }),
      json: async () => ({ data: { projects: [{ id: "abc" }] }, generatedAt: new Date().toISOString() }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const { triggerResync } = await import("@/lib/offline/background-sync");
    await triggerResync();

    expect(mockFetch).toHaveBeenCalledWith("/api/projects", expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith("/api/projects/abc/units", expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith("/api/projects/abc/issues", expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith("/api/projects/abc/observations", expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith("/api/projects/abc/activity", expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith("/api/projects/abc/inspections-report", expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith("/api/inspection-submissions?projectId=abc", expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith("/api/projects/abc/sub-scopes", expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith("/api/projects/abc/custom-site-locations", expect.any(Object));
  });

  it("warms all unit albums on first background resync in a session", async () => {
    sessionStorage.clear();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ ok: true }),
      json: async () => ({
        data: {
          projects: [{ id: "proj-x" }],
          units: [{ projectId: "proj-x", building: "South", level: "2", unit: "101" }],
        },
        generatedAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const { triggerResync } = await import("@/lib/offline/background-sync");
    await triggerResync(["proj-x"]);

    const albumFetches = mockFetch.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("/album?unitRef="),
    );
    expect(albumFetches.length).toBeGreaterThan(0);
  });

  it("skips bulk album warm on later background resyncs when no units were touched", async () => {
    sessionStorage.clear();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ ok: true }),
      json: async () => ({
        data: {
          projects: [{ id: "proj-x" }],
          units: [{ projectId: "proj-x", building: "South", level: "2", unit: "101" }],
        },
        generatedAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const { triggerResync } = await import("@/lib/offline/background-sync");
    await triggerResync(["proj-x"]);

    mockFetch.mockClear();
    await triggerResync(["proj-x"]);

    const albumFetches = mockFetch.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("/album?unitRef="),
    );
    expect(albumFetches).toHaveLength(0);
  });

  it("does NOT warm HTML on background resync without warmHtml: true", async () => {
    sessionStorage.clear();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ ok: true }),
      json: async () => ({
        data: {
          projects: [{ id: "proj-x" }],
          units: [{ projectId: "proj-x", building: "South", level: "2", unit: "101" }],
        },
        generatedAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const { triggerResync } = await import("@/lib/offline/background-sync");
    await triggerResync(["proj-x"]);

    const htmlFetches = mockFetch.mock.calls.filter(
      (args) =>
        typeof args[0] === "string" &&
        (args[1] as RequestInit | undefined)?.headers != null &&
        (args[1] as RequestInit & { headers: Record<string, string> }).headers["Accept"] === "text/html",
    );
    expect(htmlFetches).toHaveLength(0);
  });

  it("warms per-unit album routes only when warmHtml: true (full pre-download)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ ok: true }),
      json: async () => ({
        data: {
          projects: [{ id: "proj-x" }],
          units: [{ projectId: "proj-x", building: "South", level: "2", unit: "101" }],
        },
        generatedAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const { triggerResync } = await import("@/lib/offline/background-sync");
    await triggerResync(["proj-x"], undefined, { warmHtml: true, warmMedia: false });

    const albumFetches = mockFetch.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("/album?unitRef="),
    );
    expect(albumFetches.length).toBeGreaterThan(0);
    expect(albumFetches[0]?.[0]).toContain("South");
  });

  it("warms project hub pages via iframe and sub-pages via fetch when warmHtml: true", async () => {
    const mockPut = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ ok: true, text: async () => "<html></html>" }),
      json: async () => ({ data: { projects: [{ id: "proj-x" }] }, generatedAt: new Date().toISOString() }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({ put: mockPut, match: vi.fn() }),
    });
    vi.mocked(runBatchedFrameLoads).mockClear();

    const { triggerResync } = await import("@/lib/offline/background-sync");
    await triggerResync(undefined, undefined, { warmHtml: true });

    expect(runBatchedFrameLoads).toHaveBeenCalledWith(
      expect.arrayContaining([
        "/en/projects/proj-x",
        "/es/projects/proj-x",
      ]),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const htmlFetches = mockFetch.mock.calls.filter(
      (args) =>
        typeof args[0] === "string" &&
        (args[1] as RequestInit | undefined)?.headers != null &&
        (args[1] as RequestInit & { headers: Record<string, string> }).headers["Accept"] === "text/html",
    );
    // 9 sub-pages × 2 locales + 2 hub pages (iframe first, then explicit cache) = 20
    expect(htmlFetches).toHaveLength(20);
    const fetchedUrls = htmlFetches.map((args) => args[0] as string);
    expect(fetchedUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/en/projects/proj-x/units"),
        expect.stringContaining("/en/projects/proj-x/log/inspections"),
        expect.stringContaining("/es/projects/proj-x/units"),
        expect.stringContaining("/en/projects/proj-x"),
        expect.stringContaining("/es/projects/proj-x"),
      ]),
    );
  });

  it("returns { ok: true, syncedAt } on success", async () => {
    const isoNow = new Date().toISOString();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({ json: async () => ({}) }),
      json: async () => ({ data: { projects: [] }, generatedAt: isoNow }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const { triggerResync } = await import("@/lib/offline/background-sync");
    const result = await triggerResync();
    expect(result.ok).toBe(true);
    expect(result.syncedAt).toBe(isoNow);
  });

  it("returns skipped:true when called concurrently — second caller gets skipped immediately", async () => {
    // Make the snapshot fetch hang so the first call stays in-flight while
    // the second call is issued. Use a resolver so we can release the lock after.
    let resolveFetch!: () => void;
    const hangingFetch = new Promise<Response>((resolve) => {
      resolveFetch = () =>
        resolve({
          ok: true,
          clone: () => ({ json: async () => ({}) }),
          json: async () => ({ data: { projects: [] }, generatedAt: new Date().toISOString() }),
        } as unknown as Response);
    });

    vi.stubGlobal("fetch", vi.fn().mockReturnValue(hangingFetch));
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const { triggerResync } = await import("@/lib/offline/background-sync");

    // Start the first call but don't await it yet — it hangs on the fetch
    const firstCall = triggerResync();

    // Second call fires while the first is still in-flight
    const secondResult = await triggerResync();

    // Second caller must be skipped immediately without touching the server
    expect(secondResult).toEqual({ ok: true, syncedAt: null, skipped: true });

    // Release the first call and confirm it completes normally
    resolveFetch();
    const firstResult = await firstCall;
    expect(firstResult.ok).toBe(true);
    expect(firstResult.skipped).toBeUndefined();

    // After the first call completes, the mutex is released — a third call works
    const thirdResult = await triggerResync();
    expect(thirdResult.ok).toBe(true);
    expect(thirdResult.skipped).toBeUndefined();
  });

  it("initBackgroundSync is idempotent — calling twice only starts one interval", async () => {
    const spyInterval = vi.spyOn(global, "setInterval").mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.stubGlobal("navigator", { onLine: true, serviceWorker: { ready: Promise.reject(new Error("no SW in test")) } });

    const { initBackgroundSync } = await import("@/lib/offline/background-sync");
    initBackgroundSync();
    initBackgroundSync();

    expect(spyInterval).toHaveBeenCalledTimes(1);
  });

  it("reports granular progress while warming (not stuck at 50%)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      clone: () => ({
        json: async () => ({
          data: { projects: [{ id: "abc" }], units: [] },
          generatedAt: new Date().toISOString(),
        }),
      }),
      json: async () => ({
        data: { projects: [{ id: "abc" }], units: [] },
        generatedAt: new Date().toISOString(),
      }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const percents: number[] = [];
    const { triggerResync } = await import("@/lib/offline/background-sync");
    await triggerResync(
      ["abc"],
      (p) => percents.push(p.percent),
      { warmHtml: true, warmMedia: false },
    );

    expect(percents[0]).toBeLessThan(20);
    expect(Math.max(...percents)).toBe(100);
    expect(percents.some((p) => p > 55 && p < 90)).toBe(true);
  });

  it("returns cancelled when abort signal fires during warm", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      callCount += 1;
      if (callCount > 8) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      if (typeof url === "string" && url.includes("/api/offline/snapshot")) {
        return Promise.resolve({
          ok: true,
          clone: () => ({
            json: async () => ({
              data: { projects: [{ id: "abc" }], units: [] },
              generatedAt: new Date().toISOString(),
            }),
          }),
          json: async () => ({
            data: { projects: [{ id: "abc" }], units: [] },
            generatedAt: new Date().toISOString(),
          }),
        });
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue({ put: vi.fn() }) });

    const controller = new AbortController();
    const { triggerResync } = await import("@/lib/offline/background-sync");
    const promise = triggerResync(["abc"], undefined, {
      warmHtml: true,
      warmMedia: false,
      signal: controller.signal,
    });
    controller.abort();
    const result = await promise;
    expect(result.cancelled).toBe(true);
  });
});
