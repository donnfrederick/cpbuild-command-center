import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetEffectiveSession = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: () => mockGetEffectiveSession(),
}));

const WEBHOOK_URL = "https://rad-dash.example.com/api/webhooks/field-tracker";
const WEBHOOK_SECRET = "shared-webhook-secret";

const RAD_DASH_PROJECTS = [
  { id: "proj-1", name: "Alpha" },
  { id: "proj-2", name: "Beta" },
];

const ADMIN_SESSION = {
  user: { id: "admin-1", role: "ADMIN", specialPermissions: [] as string[] },
};

const MEMBER_SESSION = {
  user: { id: "member-1", role: "MEMBER", specialPermissions: [] as string[] },
};

describe("GET /api/webhooks/rad-dash-projects", () => {
  let GET: () => Promise<Response>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("RAD_DASH_WEBHOOK_URL", WEBHOOK_URL);
    vi.stubEnv("RAD_DASH_WEBHOOK_SECRET", WEBHOOK_SECRET);

    mockGetEffectiveSession.mockReset();
    mockFetch.mockReset();

    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof globalThis.fetch;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => RAD_DASH_PROJECTS,
    } as Response);

    const mod = await import("@/app/api/webhooks/rad-dash-projects/route");
    GET = mod.GET;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 401 when no session", async () => {
    mockGetEffectiveSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-triage users (MEMBER role)", async () => {
    mockGetEffectiveSession.mockResolvedValue(MEMBER_SESSION);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 503 when RAD_DASH_WEBHOOK_URL is not configured", async () => {
    vi.stubEnv("RAD_DASH_WEBHOOK_URL", "");
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("returns 503 when RAD_DASH_WEBHOOK_SECRET is not configured", async () => {
    vi.stubEnv("RAD_DASH_WEBHOOK_SECRET", "");
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("fetches /api/projects from the rad-dash origin and returns a normalised list", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as { id: string; name: string }[];
    expect(body).toHaveLength(2);
    // id and name are normalised to strings regardless of source field type
    expect(body[0].id).toBe("proj-1");
    expect(body[1].name).toBe("Beta");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://rad-dash.example.com/api/projects");
    expect((init.headers as Record<string, string>)["authorization"]).toBe(
      `Bearer ${WEBHOOK_SECRET}`
    );
  });

  it("derives the base URL correctly — strips the webhook path", async () => {
    vi.stubEnv(
      "RAD_DASH_WEBHOOK_URL",
      "https://rad-dash.example.com/api/webhooks/field-tracker"
    );
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    await GET();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://rad-dash.example.com/api/projects");
  });

  it("normalises { projects: [] } response shape to a plain array", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ projects: RAD_DASH_PROJECTS }),
    } as Response);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe("proj-1");
  });

  it("normalises { data: [] } response shape to a plain array", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: RAD_DASH_PROJECTS }),
    } as Response);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe("proj-1");
  });

  it("normalises projects that use _id (MongoDB) instead of id", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { _id: "mongo-1", name: "Alpha" },
        { _id: "mongo-2", name: "Beta" },
      ],
    } as Response);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string }[];
    expect(body[0].id).toBe("mongo-1");
    expect(body[1].id).toBe("mongo-2");
  });

  it("normalises projects that use projectId field", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ projectId: "pid-99", name: "Gamma" }],
    } as Response);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string }[];
    expect(body[0].id).toBe("pid-99");
  });

  it("normalises projects with numeric id to string", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 7, name: "Delta" }],
    } as Response);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string }[];
    expect(body[0].id).toBe("7");
    expect(typeof body[0].id).toBe("string");
  });

  it("returns 502 when rad-dash returns an unexpected shape", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: "shape" }),
    } as Response);
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("returns 502 when rad-dash returns a non-ok status", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);
    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("returns 502 when fetch throws (network error)", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
