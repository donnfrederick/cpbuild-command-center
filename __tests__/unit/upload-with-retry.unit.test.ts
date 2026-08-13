import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadWithRetry } from "@/lib/upload-with-retry";

vi.mock("@/lib/capture-client-metadata", () => ({
  collectCaptureClientMetadata: vi.fn(async () => ({
    gpsStatus: "unavailable",
    captureRecordedAt: "2026-07-24T12:00:00.000Z",
    deviceType: "Unknown",
    browser: "Browser",
    appShell: "browser_tab",
    captureMethod: "file_drop",
    userAgent: "test-agent",
  })),
}));

function mockOkResponse(data: object): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function mockErrorResponse(status: number, body = "error"): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: body }),
    text: async () => body,
  } as unknown as Response;
}

const SUCCESS_DATA = {
  storageKey: "field-media/observations/abc.jpg",
  storageUrl: "https://supabase.co/storage/v1/signed/abc.jpg",
  mimeType: "image/jpeg",
  fileSizeBytes: 204800,
};

describe("uploadWithRetry()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed data immediately on first-attempt success", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockOkResponse(SUCCESS_DATA));

    const result = await uploadWithRetry(new FormData(), { initialDelayMs: 0 });

    expect(result).toEqual(SUCCESS_DATA);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("appends projectId to FormData when option is set and key absent", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockOkResponse(SUCCESS_DATA));
    const form = new FormData();
    form.append("file", new Blob(["x"]), "a.jpg");
    form.append("type", "issues");

    await uploadWithRetry(form, { initialDelayMs: 0, projectId: "proj-99" });

    const sent = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as { body: FormData };
    expect(sent.body.get("projectId")).toBe("proj-99");
  });

  it("retries on network error and succeeds on 2nd attempt", async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(mockOkResponse(SUCCESS_DATA));

    const result = await uploadWithRetry(new FormData(), { maxAttempts: 3, initialDelayMs: 0 });

    expect(result.storageKey).toBe(SUCCESS_DATA.storageKey);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 502 server error and succeeds on 3rd attempt", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(mockErrorResponse(502, "Bad Gateway"))
      .mockResolvedValueOnce(mockErrorResponse(502, "Bad Gateway"))
      .mockResolvedValueOnce(mockOkResponse(SUCCESS_DATA));

    const result = await uploadWithRetry(new FormData(), { maxAttempts: 3, initialDelayMs: 0 });

    expect(result.storageKey).toBe(SUCCESS_DATA.storageKey);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on 413 (file too large) without retrying", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockErrorResponse(413, "File exceeds 50 MB limit"),
    );

    await expect(
      uploadWithRetry(new FormData(), { maxAttempts: 3, initialDelayMs: 0 }),
    ).rejects.toThrow("HTTP 413");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws immediately on 415 (unsupported mime type) without retrying", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockErrorResponse(415, "Unsupported file type"),
    );

    await expect(
      uploadWithRetry(new FormData(), { maxAttempts: 3, initialDelayMs: 0 }),
    ).rejects.toThrow("HTTP 415");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws immediately on 401 (unauthenticated) without retrying", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockErrorResponse(401, "Unauthorized"),
    );

    await expect(
      uploadWithRetry(new FormData(), { maxAttempts: 3, initialDelayMs: 0 }),
    ).rejects.toThrow("HTTP 401");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("exhausts all attempts and throws the last error", async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      uploadWithRetry(new FormData(), { maxAttempts: 3, initialDelayMs: 0 }),
    ).rejects.toThrow("Failed to fetch");
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("respects maxAttempts option", async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      uploadWithRetry(new FormData(), { maxAttempts: 2, initialDelayMs: 0 }),
    ).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("uses exponential backoff between retries (600 → 1200 ms)", async () => {
    const delays: number[] = [];
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((fn: any, delay?: number, ...args: any[]) => {
        if (delay !== undefined && delay > 0) delays.push(delay);
        return origSetTimeout(fn as () => void, 0, ...args);
      }) as typeof setTimeout,
    );

    global.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      uploadWithRetry(new FormData(), { maxAttempts: 3, initialDelayMs: 600 }),
    ).rejects.toThrow();

    // 2 delays between 3 attempts: 600ms (attempt 1→2), 1200ms (attempt 2→3)
    const retryDelays = delays.filter((d) => d >= 600);
    expect(retryDelays).toEqual([600, 1200]);
  });
});
