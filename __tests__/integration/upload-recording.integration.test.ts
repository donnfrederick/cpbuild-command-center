import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Auth mock ──────────────────────────────────────────────────────────────
const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockGetSession() }));

// ─── fetch mock ─────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function memberSession() {
  return { user: { id: "u1", role: "MEMBER", email: "m@test.com", name: "Member" } };
}

function makeFormRequest(blob?: Blob): NextRequest {
  const formData = new FormData();
  if (blob) formData.append("recording", blob);
  return new NextRequest("http://localhost/api/feedback/upload-recording", {
    method: "POST",
    body: formData,
  });
}

const SUPABASE_URL = "https://test-ref.supabase.co";
const SERVICE_ROLE_KEY = "test-service-role-key";

// Supabase sign endpoint returns a path WITHOUT /storage/v1 prefix — e.g. "/object/sign/..."
// Our route must normalize this before returning the full URL.
const SIGNED_URL_RESPONSE = { signedURL: "/object/sign/feedback-recordings/test.webm?token=abc" };

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("POST /api/feedback/upload-recording", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockGetSession.mockReset();
    mockFetch.mockReset();
    ({ POST } = await import("@/app/api/feedback/upload-recording/route"));
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeFormRequest(new Blob(["data"], { type: "video/webm" })));
    expect(res.status).toBe(401);
  });

  it("returns 503 when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    mockGetSession.mockResolvedValue(memberSession());
    const res = await POST(makeFormRequest(new Blob(["data"], { type: "video/webm" })));
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("returns 503 when storage URL cannot be determined", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("DATABASE_URL", ""); // Can't derive from empty DATABASE_URL
    mockGetSession.mockResolvedValue(memberSession());
    const res = await POST(makeFormRequest(new Blob(["data"], { type: "video/webm" })));
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("configured");
  });

  it("returns 400 when no recording file is provided", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    mockGetSession.mockResolvedValue(memberSession());
    // No blob appended
    const res = await POST(makeFormRequest());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("recording");
  });

  it("returns 413 when recording exceeds 100 MB", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    mockGetSession.mockResolvedValue(memberSession());

    // NextRequest serializes FormData, losing subclass info — mock formData() directly.
    // Use Object.create(Blob.prototype) so instanceof Blob passes, then override size getter.
    const oversizedBlob = Object.create(Blob.prototype) as Blob;
    Object.defineProperty(oversizedBlob, "size", { get: () => 101 * 1024 * 1024, configurable: true });
    Object.defineProperty(oversizedBlob, "type", { get: () => "video/webm", configurable: true });
    const req = {
      formData: async () => ({ get: (_k: string) => oversizedBlob }),
    } as unknown as import("next/server").NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(413);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("100 MB");
  });

  it("returns 502 when Supabase upload fails", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    mockGetSession.mockResolvedValue(memberSession());

    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "Bucket not found",
    });

    const res = await POST(makeFormRequest(new Blob(["data"], { type: "video/webm" })));
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Upload failed");
  });

  it("returns 502 when signed URL generation fails", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    mockGetSession.mockResolvedValue(memberSession());

    // Upload succeeds, sign fails
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => "" })
      .mockResolvedValueOnce({ ok: false, text: async () => "Sign error" });

    const res = await POST(makeFormRequest(new Blob(["data"], { type: "video/webm" })));
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("recording URL");
  });

  it("returns 200 with url on successful webm upload and normalizes /storage/v1 prefix", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    mockGetSession.mockResolvedValue(memberSession());

    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => "" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => SIGNED_URL_RESPONSE,
      });

    const res = await POST(makeFormRequest(new Blob(["data"], { type: "video/webm" })));
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string };
    // Supabase returns "/object/sign/..." — route must normalize to "/storage/v1/object/sign/..."
    expect(body.url).toBe(`${SUPABASE_URL}/storage/v1/object/sign/feedback-recordings/test.webm?token=abc`);
  });

  it("returns 200 with url on successful mp4 upload (Safari format)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
    vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
    mockGetSession.mockResolvedValue(memberSession());

    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => "" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ signedURL: "https://signed.supabase.co/test.mp4?token=xyz" }),
      });

    // Safari sends mp4
    const res = await POST(makeFormRequest(new Blob(["data"], { type: "video/mp4" })));
    expect(res.status).toBe(200);

    // Verify the upload Content-Type was mp4
    const uploadCall = mockFetch.mock.calls[0];
    expect((uploadCall[1] as RequestInit).headers).toMatchObject({ "Content-Type": "video/mp4" });
  });

  it("derives SUPABASE_URL from DATABASE_URL when SUPABASE_URL not set", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres.testref1234:password@host:5432/db");
    mockGetSession.mockResolvedValue(memberSession());

    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => "" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ signedURL: "https://testref1234.supabase.co/signed.mp4" }),
      });

    const res = await POST(makeFormRequest(new Blob(["data"], { type: "video/webm" })));
    expect(res.status).toBe(200);

    // Verify upload URL used the derived Supabase URL
    const uploadUrl = mockFetch.mock.calls[0][0] as string;
    expect(uploadUrl).toContain("testref1234.supabase.co");
  });
});
