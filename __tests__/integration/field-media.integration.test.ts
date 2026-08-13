/**
 * Integration tests: POST/GET /api/upload/field-media (local disk when SUPABASE_SERVICE_ROLE_KEY empty)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/field-media/staging-upload-capture-context", () => ({
  upsertFieldMediaUploadContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  db: {
    fieldMediaUploadContext: {
      upsert: vi.fn().mockResolvedValue({ id: "ctx-1" }),
    },
  },
}));

const { getEffectiveSession } = await import("@/lib/masquerade");
const { upsertFieldMediaUploadContext } = await import("@/lib/field-media/staging-upload-capture-context");
const { resetFieldMediaRateLimitForTests, FIELD_MEDIA_UPLOADS_PER_MINUTE_LIMIT } = await import(
  "@/lib/field-media-upload-rate-limit"
);

const memberSession = {
  user: { id: "u1", name: "Member", email: "m@test.com", role: "MEMBER" },
};

function makeUploadRequest(host = "localhost:3002"): NextRequest {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "x.jpg");
  form.append("type", "issues");
  return new NextRequest(`http://${host}/api/upload/field-media`, {
    method: "POST",
    body: form,
    headers: { host },
  });
}

describe("POST /api/upload/field-media (local)", () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.unstubAllEnvs();
    resetFieldMediaRateLimitForTests();
    tmpRoot = mkdtempSync(join(tmpdir(), "fm-int-"));
    vi.stubEnv("LOCAL_FIELD_MEDIA_ROOT", tmpRoot);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.mocked(getEffectiveSession).mockResolvedValue(
      memberSession as Awaited<ReturnType<typeof getEffectiveSession>>,
    );
  });

  afterEach(() => {
    resetFieldMediaRateLimitForTests();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/upload/field-media/route");
    const res = await POST(makeUploadRequest());
    expect(res.status).toBe(401);
  });

  it("writes a file and returns local storageUrl when service role key is empty", async () => {
    const { POST } = await import("@/app/api/upload/field-media/route");
    const res = await POST(makeUploadRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { storageKey: string; storageUrl: string; mimeType: string };
    expect(body.storageKey).toMatch(/^field-media\/issues\/[^/]+\.jpg$/);
    expect(body.mimeType).toBe("image/jpeg");
    expect(body.storageUrl).toContain("/api/upload/field-media/file?key=");
    expect(body.storageUrl.startsWith("http://localhost:3002/")).toBe(true);

    const onDisk = join(tmpRoot, body.storageKey);
    expect(existsSync(onDisk)).toBe(true);
  });

  it("GET /api/upload/field-media/file returns bytes for a stored key", async () => {
    const { POST } = await import("@/app/api/upload/field-media/route");
    const postRes = await POST(makeUploadRequest());
    const { storageUrl } = (await postRes.json()) as { storageUrl: string };

    const { GET } = await import("@/app/api/upload/field-media/file/route");
    const getRes = await GET(new NextRequest(storageUrl));
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("Content-Type")).toBe("image/jpeg");
    const buf = Buffer.from(await getRes.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
  });

  it("GET returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/upload/field-media/route");
    const postRes = await POST(makeUploadRequest());
    const { storageUrl } = (await postRes.json()) as { storageUrl: string };

    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/upload/field-media/file/route");
    const getRes = await GET(new NextRequest(storageUrl));
    expect(getRes.status).toBe(401);
  });

  it("GET returns 400 for invalid key", async () => {
    const { GET } = await import("@/app/api/upload/field-media/file/route");
    const res = await GET(
      new NextRequest("http://localhost:3002/api/upload/field-media/file?key=evil"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 FIELD_MEDIA_RATE_LIMITED after exceeding per-user burst", async () => {
    const { POST } = await import("@/app/api/upload/field-media/route");
    for (let i = 0; i < FIELD_MEDIA_UPLOADS_PER_MINUTE_LIMIT; i++) {
      const res = await POST(makeUploadRequest());
      expect(res.status).toBe(200);
    }
    const res429 = await POST(makeUploadRequest());
    expect(res429.status).toBe(429);
    const body = (await res429.json()) as { error?: string };
    expect(body.error).toBe("FIELD_MEDIA_RATE_LIMITED");
  });

  it("echoes back imageAnnotation in the response when a valid annotation is supplied", async () => {
    const { POST } = await import("@/app/api/upload/field-media/route");

    const annotation = {
      schemaVersion: 2,
      canvasRef: { width: 100, height: 80 },
      strokes: [
        {
          kind: "stroke",
          color: "#ff0000",
          widthNorm: 0.01,
          points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }],
        },
      ],
      textItems: [],
      shapeItems: [],
    };

    const form = new FormData();
    form.append("file", new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "photo.jpg");
    form.append("type", "observations");
    form.append("imageAnnotation", JSON.stringify(annotation));

    const req = new NextRequest("http://localhost:3002/api/upload/field-media", {
      method: "POST",
      body: form,
      headers: { host: "localhost:3002" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { imageAnnotation?: unknown };
    expect(body.imageAnnotation).toBeDefined();
    const ann = body.imageAnnotation as { schemaVersion: number };
    expect(ann.schemaVersion).toBe(2);
  });

  it("omits imageAnnotation from the response when none is provided", async () => {
    const { POST } = await import("@/app/api/upload/field-media/route");
    const res = await POST(makeUploadRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect("imageAnnotation" in body).toBe(false);
  });

  it("ignores a malformed imageAnnotation and still returns 200", async () => {
    const { POST } = await import("@/app/api/upload/field-media/route");

    const form = new FormData();
    form.append("file", new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "x.jpg");
    form.append("type", "issues");
    form.append("imageAnnotation", "not-valid-json{{{");

    const req = new NextRequest("http://localhost:3002/api/upload/field-media", {
      method: "POST",
      body: form,
      headers: { host: "localhost:3002" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Malformed JSON is silently ignored
    expect("imageAnnotation" in body).toBe(false);
  });

  it("persists capture metadata staging when captureMetadata JSON is valid", async () => {
    vi.mocked(upsertFieldMediaUploadContext).mockClear();
    vi.resetModules();
    const { POST } = await import("@/app/api/upload/field-media/route");
    const form = new FormData();
    form.append("file", new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "x.jpg");
    form.append("type", "issues");
    form.append("projectId", "proj-1");
    form.append(
      "captureMetadata",
      JSON.stringify({
        gpsStatus: "granted",
        captureRecordedAt: "2026-07-24T12:00:00.000Z",
        latitude: 40.77,
        longitude: -111.89,
        deviceType: "iPhone",
        browser: "Safari",
        appShell: "browser_tab",
        captureMethod: "native_camera",
        userAgent: "test-agent",
      }),
    );

    const req = new NextRequest("http://localhost:3002/api/upload/field-media", {
      method: "POST",
      body: form,
      headers: { host: "localhost:3002" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(vi.mocked(upsertFieldMediaUploadContext)).toHaveBeenCalled();
  });
});
