import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PAGES_CACHE_NAME } from "@/lib/offline/pages-cache";
import { runBatchedFetches } from "@/lib/offline/run-batched-fetches";

describe("runBatchedFetches cachePages", () => {
  const mockPut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue(undefined);
    vi.stubGlobal("location", { origin: "https://example.test" });
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({ put: mockPut }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes successful responses to pages-v1 when cachePages is true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        clone: () => ({
          ok: true,
          text: async () => "<html><body>ok</body></html>",
        }),
      }),
    );

    await runBatchedFetches(["/en/projects/a"], {
      cachePages: true,
      fetchInit: { headers: { Accept: "text/html" } },
    });

    expect(caches.open).toHaveBeenCalledWith(PAGES_CACHE_NAME);
    expect(mockPut).toHaveBeenCalledWith(
      "https://example.test/en/projects/a",
      expect.any(Response),
    );
  });

  it("does not write to cache when cachePages is false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        clone: () => ({ ok: true }),
      }),
    );

    await runBatchedFetches(["/en/projects/a"]);

    expect(mockPut).not.toHaveBeenCalled();
  });
});
