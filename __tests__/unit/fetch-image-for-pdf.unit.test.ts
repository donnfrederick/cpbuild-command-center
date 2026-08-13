import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchImageAsBase64ForPdf,
  PDF_IMAGE_FETCH_MAX_BYTES,
  prefetchPdfImageCache,
  resolveUrlForPdfImageFetch,
} from "@/lib/pdf/fetch-image-for-pdf";

describe("resolveUrlForPdfImageFetch()", () => {
  it("rewrites field-media path to current app origin (fixes port mismatch)", () => {
    expect(
      resolveUrlForPdfImageFetch(
        "http://localhost:3002/api/upload/field-media/file?key=field-media%2Fx%2Fy.jpg",
        "http://localhost:3000",
      ),
    ).toBe("http://localhost:3000/api/upload/field-media/file?key=field-media%2Fx%2Fy.jpg");
  });

  it("prefixes relative URLs with app origin", () => {
    expect(resolveUrlForPdfImageFetch("/api/upload/field-media/file?key=k", "https://app.example")).toBe(
      "https://app.example/api/upload/field-media/file?key=k",
    );
  });

  it("leaves Supabase signed URLs unchanged", () => {
    const u = "https://abc.supabase.co/storage/v1/object/sign/field-media/x/y.jpg?token=t";
    expect(resolveUrlForPdfImageFetch(u, "http://localhost:3000")).toBe(u);
  });
});

describe("fetchImageAsBase64ForPdf()", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("forwards Cookie header for same-origin resolved URLs", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(Buffer.from([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await fetchImageAsBase64ForPdf(
      "http://localhost:3002/api/upload/field-media/file?key=k",
      {
        appOrigin: "http://localhost:3000",
        cookieHeader: "session=abc",
      },
    );

    expect(out?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/upload/field-media/file?key=k",
      expect.objectContaining({
        headers: { cookie: "session=abc" },
      }),
    );
  });

  it("does not fetch arbitrary external image hosts", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(Buffer.from([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await fetchImageAsBase64ForPdf("https://cdn.example.com/img.jpg", {
      appOrigin: "http://localhost:3000",
      cookieHeader: "session=abc",
    });

    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows Supabase signed image URLs without forwarding cookies", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(Buffer.from([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const url = "https://abc.supabase.co/storage/v1/object/sign/field-media/x/y.jpg?token=t";
    const out = await fetchImageAsBase64ForPdf(url, {
      appOrigin: "http://localhost:3000",
      cookieHeader: "session=abc",
    });

    expect(out?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.not.objectContaining({
        headers: expect.anything(),
      }),
    );
  });

  it("returns null when requireImageContentType and response is not image/*", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const out = await fetchImageAsBase64ForPdf("http://localhost:3000/x.jpg", {
      appOrigin: "http://localhost:3000",
      requireImageContentType: true,
    });

    expect(out).toBeNull();
  });

  it("returns null when Content-Length exceeds the PDF embed cap", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(null, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(PDF_IMAGE_FETCH_MAX_BYTES + 1),
        },
      });
    }) as unknown as typeof fetch;

    const out = await fetchImageAsBase64ForPdf("https://abc.supabase.co/x.jpg", {
      appOrigin: "http://localhost:3000",
    });

    expect(out).toBeNull();
  });
});

describe("prefetchPdfImageCache()", () => {
  it("prefetches unique URLs with bounded concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchOne = vi.fn(async (url: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return url;
    });

    const cache = await prefetchPdfImageCache(
      ["a", "b", "a", "c", "d", "e"],
      fetchOne,
      2,
    );

    expect(fetchOne).toHaveBeenCalledTimes(5);
    expect(cache.get("a")).toBe("a");
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
