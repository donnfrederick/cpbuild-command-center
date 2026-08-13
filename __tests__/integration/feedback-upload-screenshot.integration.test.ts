import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({
  getSession: () => mockGetSession(),
}));

const mockFetch = vi.fn();

vi.mock("crypto", () => ({
  randomUUID: () => "00000000-0000-0000-0000-000000000001",
}));

// ── Import handler after mocks ─────────────────────────────────────────────────

const { POST } = await import("@/app/api/feedback/upload-screenshot/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function authedSession() {
  return { user: { id: "user-1", email: "user@test.com" } };
}

function makeFormDataRequest(file: File) {
  const fd = new FormData();
  fd.append("screenshot", file);
  return new NextRequest("http://localhost/api/feedback/upload-screenshot", {
    method: "POST",
    body: fd,
  });
}

function makePngFile(sizeBytes = 1024) {
  return new File([new Uint8Array(sizeBytes)], "shot.png", { type: "image/png" });
}

function mockSupabaseUploadSuccess() {
  const storageKey =
    "field-media/feedback-screenshots/00000000-0000-0000-0000-000000000001.png";
  mockFetch
    .mockResolvedValueOnce(new Response(JSON.stringify({ Key: storageKey }), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          signedURL: `/storage/v1/object/sign/${storageKey}?token=abc`,
        }),
        { status: 200 },
      ),
    );
}

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/feedback/upload-screenshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.SUPABASE_URL = "https://abc123.supabase.co";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }
    if (originalServiceRoleKey === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    }
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const req = makeFormDataRequest(makePngFile());
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("stores locally when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const req = makeFormDataRequest(makePngFile());
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toContain("/api/upload/field-media/file?key=");
    expect(decodeURIComponent(body.url)).toContain("field-media/feedback-screenshots");
  });

  it("returns 400 when no file is provided", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    const fd = new FormData();
    const req = new NextRequest("http://localhost/api/feedback/upload-screenshot", {
      method: "POST",
      body: fd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("No screenshot");
  });

  it("returns 413 when file exceeds 5 MB", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    const req = makeFormDataRequest(bigFile);
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("returns 415 for unsupported MIME type", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    const svgFile = new File(["<svg/>"], "icon.svg", { type: "image/svg+xml" });
    const req = makeFormDataRequest(svgFile);
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it("accepts PNG when file.type is empty but filename has .png extension", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    mockSupabaseUploadSuccess();
    const noMimeFile = new File([new Uint8Array(512)], "mystery.png", { type: "" });
    const req = makeFormDataRequest(noMimeFile);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 415 when file.type is empty and extension is unknown", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    const noMimeFile = new File([new Uint8Array(512)], "mystery.bin", { type: "" });
    const req = makeFormDataRequest(noMimeFile);
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it("returns 502 when Supabase upload fails", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "bucket not found" }), { status: 404 }),
    );
    const req = makeFormDataRequest(makePngFile());
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("returns 502 when signed URL generation fails", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    mockFetch
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const req = makeFormDataRequest(makePngFile());
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("returns 200 with url on success (PNG)", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    mockSupabaseUploadSuccess();
    const req = makeFormDataRequest(makePngFile());
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    expect(body.url).toContain("supabase.co");
    expect(body.url).toContain("field-media/feedback-screenshots");
  });

  it("returns 200 with url on success (JPEG)", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    mockSupabaseUploadSuccess();
    const jpgFile = new File([new Uint8Array(512)], "photo.jpg", { type: "image/jpeg" });
    const req = makeFormDataRequest(jpgFile);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("accepts WebP and GIF MIME types", async () => {
    for (const [name, mime] of [["a.webp", "image/webp"], ["b.gif", "image/gif"]] as const) {
      mockGetSession.mockResolvedValue(authedSession());
      mockSupabaseUploadSuccess();
      const file = new File([new Uint8Array(512)], name, { type: mime });
      const req = makeFormDataRequest(file);
      const res = await POST(req);
      expect(res.status).toBe(200);
    }
  });

  it("returns 400 when no file is in FormData (empty screenshots handled by main feedback route)", async () => {
    mockGetSession.mockResolvedValue(authedSession());
    const emptyFd = new FormData();
    const req = new NextRequest("http://localhost/api/feedback/upload-screenshot", {
      method: "POST",
      body: emptyFd,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
