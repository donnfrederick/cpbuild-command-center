import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { uploadImageForFeedback, uploadVideoForFeedback } from "@/lib/ai/gemini-files";
import {
  FEEDBACK_ASSIST_IMAGE_MAX_BYTES,
  FEEDBACK_ASSIST_VIDEO_MAX_BYTES,
} from "@/lib/ai/types";

const ORIGINAL_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Build a `fetch` stub that serves a scripted sequence of responses. Test
 * verifies call count + order without actually hitting the network.
 */
function scriptedFetch(responses: Array<() => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`No scripted response for call: ${url}`);
    return next();
  };
  return { impl, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeBlob(size: number, type = "video/webm"): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

function makeImageBlob(size: number, type = "image/png"): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

describe("uploadImageForFeedback", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = ORIGINAL_API_KEY;
    vi.restoreAllMocks();
  });

  it("uploads and returns the URI when the file is immediately ACTIVE", async () => {
    const { impl, calls } = scriptedFetch([
      () =>
        jsonResponse({
          file: {
            name: "files/img1",
            uri: "https://generativelanguage.googleapis.com/v1beta/files/img1",
            mimeType: "image/png",
            state: "ACTIVE",
            expirationTime: "2099-01-01T00:00:00Z",
          },
        }),
    ]);

    const result = await uploadImageForFeedback(makeImageBlob(64), {
      fetchImpl: impl,
    });

    expect(result.mimeType).toBe("image/png");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/upload/v1beta/files");
  });

  it("rejects unsupported MIME types before hitting the network", async () => {
    const { impl, calls } = scriptedFetch([]);
    await expect(
      uploadImageForFeedback(makeImageBlob(64, "image/gif"), { fetchImpl: impl }),
    ).rejects.toThrow(/Unsupported image MIME type/);
    expect(calls).toHaveLength(0);
  });

  it("rejects oversized blobs before hitting the network", async () => {
    const oversize = FEEDBACK_ASSIST_IMAGE_MAX_BYTES + 1;
    const { impl, calls } = scriptedFetch([]);
    await expect(
      uploadImageForFeedback(makeImageBlob(oversize), { fetchImpl: impl }),
    ).rejects.toThrow(/exceeds max size/);
    expect(calls).toHaveLength(0);
  });
});

describe("uploadVideoForFeedback", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = ORIGINAL_API_KEY;
    vi.restoreAllMocks();
  });

  it("uploads and returns the URI when the file is immediately ACTIVE", async () => {
    const { impl, calls } = scriptedFetch([
      () =>
        jsonResponse({
          file: {
            name: "files/abc",
            uri: "https://generativelanguage.googleapis.com/v1beta/files/abc",
            mimeType: "video/webm",
            state: "ACTIVE",
            expirationTime: "2099-01-01T00:00:00Z",
          },
        }),
    ]);

    const result = await uploadVideoForFeedback(makeBlob(1024), {
      fetchImpl: impl,
    });

    expect(result.fileUri).toBe(
      "https://generativelanguage.googleapis.com/v1beta/files/abc",
    );
    expect(result.name).toBe("files/abc");
    expect(result.mimeType).toBe("video/webm");
    expect(result.expiresAt).toBe("2099-01-01T00:00:00Z");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/upload/v1beta/files");
  });

  it("returns the stored MIME verbatim, including codec parameters", async () => {
    // Regression: Gemini's generateContent rejects the call with "Request
    // contains an invalid argument" when fileData.mimeType is stripped of
    // codec parameters but the Files API stored the full suffixed string.
    // The wrapper MUST hand the caller the exact stored mime.
    const { impl } = scriptedFetch([
      () =>
        jsonResponse({
          file: {
            name: "files/codec",
            uri: "https://g/files/codec",
            mimeType: "video/webm;codecs=vp9,opus",
            state: "ACTIVE",
            expirationTime: "2099-01-01T00:00:00Z",
          },
        }),
    ]);

    const result = await uploadVideoForFeedback(
      makeBlob(1024, "video/webm;codecs=vp9,opus"),
      { fetchImpl: impl },
    );

    expect(result.mimeType).toBe("video/webm;codecs=vp9,opus");
  });

  it("polls until the file transitions from PROCESSING to ACTIVE", async () => {
    const { impl, calls } = scriptedFetch([
      () =>
        jsonResponse({
          file: {
            name: "files/proc",
            uri: "https://g/files/proc",
            state: "PROCESSING",
          },
        }),
      () =>
        jsonResponse({
          name: "files/proc",
          uri: "https://g/files/proc",
          state: "PROCESSING",
        }),
      () =>
        jsonResponse({
          name: "files/proc",
          uri: "https://g/files/proc",
          mimeType: "video/webm",
          state: "ACTIVE",
          expirationTime: "2099-01-01T00:00:00Z",
        }),
    ]);

    const result = await uploadVideoForFeedback(makeBlob(1024), {
      fetchImpl: impl,
      pollIntervalMs: 1,
      pollTimeoutMs: 1_000,
    });

    expect(result.fileUri).toBe("https://g/files/proc");
    expect(calls).toHaveLength(3);
    expect(calls[1].url).toContain("/v1beta/files/proc");
  });

  it("throws a timeout error when the file never reaches ACTIVE", async () => {
    const { impl } = scriptedFetch([
      () =>
        jsonResponse({
          file: { name: "files/stuck", uri: "https://g/stuck", state: "PROCESSING" },
        }),
      () => jsonResponse({ name: "files/stuck", uri: "https://g/stuck", state: "PROCESSING" }),
      () => jsonResponse({ name: "files/stuck", uri: "https://g/stuck", state: "PROCESSING" }),
      () => jsonResponse({ name: "files/stuck", uri: "https://g/stuck", state: "PROCESSING" }),
    ]);

    await expect(
      uploadVideoForFeedback(makeBlob(1024), {
        fetchImpl: impl,
        pollIntervalMs: 10,
        pollTimeoutMs: 15,
      }),
    ).rejects.toThrow(/did not reach ACTIVE/);
  });

  it("propagates FAILED state as an error", async () => {
    const { impl } = scriptedFetch([
      () =>
        jsonResponse({
          file: { name: "files/bad", uri: "https://g/bad", state: "PROCESSING" },
        }),
      () =>
        jsonResponse({
          name: "files/bad",
          uri: "https://g/bad",
          state: "FAILED",
          error: { message: "video corrupted" },
        }),
    ]);

    await expect(
      uploadVideoForFeedback(makeBlob(1024), { fetchImpl: impl, pollIntervalMs: 1 }),
    ).rejects.toThrow(/video corrupted/);
  });

  it("throws on non-2xx upload response", async () => {
    const { impl } = scriptedFetch([
      () => new Response("quota exceeded", { status: 429 }),
    ]);
    await expect(
      uploadVideoForFeedback(makeBlob(1024), { fetchImpl: impl }),
    ).rejects.toThrow(/upload failed: 429/);
  });

  it("rejects unsupported MIME types before hitting the network", async () => {
    const { impl, calls } = scriptedFetch([]);
    await expect(
      uploadVideoForFeedback(makeBlob(1024, "video/quicktime"), { fetchImpl: impl }),
    ).rejects.toThrow(/Unsupported video MIME type/);
    expect(calls).toHaveLength(0);
  });

  it("rejects oversized blobs before hitting the network", async () => {
    const oversize = FEEDBACK_ASSIST_VIDEO_MAX_BYTES + 1;
    const { impl, calls } = scriptedFetch([]);
    await expect(
      uploadVideoForFeedback(makeBlob(oversize), { fetchImpl: impl }),
    ).rejects.toThrow(/exceeds max size/);
    expect(calls).toHaveLength(0);
  });

  it("rejects empty blobs", async () => {
    const { impl } = scriptedFetch([]);
    await expect(
      uploadVideoForFeedback(makeBlob(0), { fetchImpl: impl }),
    ).rejects.toThrow(/empty/);
  });

  it("throws when GEMINI_API_KEY is not set", async () => {
    delete process.env.GEMINI_API_KEY;
    const { impl } = scriptedFetch([]);
    await expect(
      uploadVideoForFeedback(makeBlob(1024), { fetchImpl: impl }),
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
