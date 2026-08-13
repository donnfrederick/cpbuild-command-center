import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PAGES_CACHE_NAME,
  openCachedProjectPage,
  putPageInCache,
} from "@/lib/offline/pages-cache";

vi.mock("@/lib/offline/warm-page-static-assets", () => ({
  warmStaticAssetsFromHtml: vi.fn().mockResolvedValue(undefined),
}));

import { warmStaticAssetsFromHtml } from "@/lib/offline/warm-page-static-assets";

describe("pages-cache", () => {
  const mockPut = vi.fn();
  const mockMatch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue(undefined);
    mockMatch.mockResolvedValue(undefined);
    vi.stubGlobal("location", {
      origin: "https://example.test",
      href: "https://example.test/en/projects",
      assign: vi.fn(),
    });
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({ put: mockPut, match: mockMatch }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("putPageInCache stores HTML and warms static assets", async () => {
    await putPageInCache("/en/projects/a", {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      clone: () => ({
        ok: true,
        text: async () => '<html><link href="/_next/static/css/app.css" /></html>',
      }),
    } as Response);

    expect(caches.open).toHaveBeenCalledWith(PAGES_CACHE_NAME);
    expect(mockPut).toHaveBeenCalledWith(
      "https://example.test/en/projects/a",
      expect.any(Response),
    );
    expect(warmStaticAssetsFromHtml).toHaveBeenCalledWith(
      expect.stringContaining("/_next/static/css/app.css"),
    );
  });

  it("openCachedProjectPage assigns location for a cached page", async () => {
    mockMatch.mockResolvedValue({ ok: true });
    const opened = await openCachedProjectPage("en", "proj-1");
    expect(opened).toBe(true);
    expect(window.location.assign).toHaveBeenCalledWith(
      "https://example.test/en/projects/proj-1",
    );
  });
});
