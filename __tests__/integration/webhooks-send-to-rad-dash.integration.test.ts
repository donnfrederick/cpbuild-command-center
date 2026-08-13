import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetEffectiveSession = vi.fn();
const mockFeedbackFindMany = vi.fn();
const mockFeedbackUpdate = vi.fn();
const mockFeedbackUpdateMany = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: () => mockGetEffectiveSession(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    feedbackReport: {
      findMany: (...args: unknown[]) => mockFeedbackFindMany(...args),
      update: (...args: unknown[]) => mockFeedbackUpdate(...args),
      updateMany: (...args: unknown[]) => mockFeedbackUpdateMany(...args),
    },
  },
}));

vi.mock("@/lib/production-deployment", () => ({
  isStrictProductionDeployment: vi.fn(() => false),
}));

const WEBHOOK_URL = "https://rad-dash.example.com/api/webhooks/field-tracker";
const WEBHOOK_SECRET = "shared-webhook-secret";

const ADMIN_SESSION = {
  user: {
    id: "admin-1",
    role: "ADMIN",
    specialPermissions: [] as string[],
  },
};

const MEMBER_SESSION = {
  user: {
    id: "member-1",
    role: "MEMBER",
    specialPermissions: [] as string[],
  },
};

const FEEDBACK_ROWS = [
  {
    id: "fb-1",
    shortId: 42,
    type: "BUG" as const,
    title: "Button is broken",
    description: "Clicking submit does nothing.",
    screenshot: null,
    videoUrl: null,
    pageUrl: "https://app.example.com/en/projects",
    priority: "HIGH" as const,
    user: { name: "Phil Amour", email: "phil@example.com" },
    createdAt: new Date("2026-04-22T10:00:00.000Z"),
  },
];

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3002/api/webhooks/send-to-rad-dash", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/send-to-rad-dash", () => {
  let POST: (req: NextRequest) => Promise<Response>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("RAD_DASH_WEBHOOK_URL", WEBHOOK_URL);
    vi.stubEnv("RAD_DASH_WEBHOOK_SECRET", WEBHOOK_SECRET);

    mockGetEffectiveSession.mockReset();
    mockFeedbackFindMany.mockReset();
    mockFeedbackUpdate.mockReset();
    mockFeedbackUpdateMany.mockReset();
    mockFetch.mockReset();

    mockFeedbackUpdate.mockResolvedValue({});
    mockFeedbackUpdateMany.mockResolvedValue({ count: 0 });

    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof globalThis.fetch;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ created: 1, tickets: [{ id: "rd-ticket-1", shortId: 1 }] }),
    } as Response);
    mockFeedbackFindMany.mockResolvedValue(FEEDBACK_ROWS);

    const mod = await import("@/app/api/webhooks/send-to-rad-dash/route");
    POST = mod.POST;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 401 when no session", async () => {
    mockGetEffectiveSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ feedbackIds: ["fb-1"] }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-triage users (MEMBER role)", async () => {
    mockGetEffectiveSession.mockResolvedValue(MEMBER_SESSION);
    const res = await POST(makeRequest({ feedbackIds: ["fb-1"] }));
    expect(res.status).toBe(403);
  });

  it("returns 503 when RAD_DASH_WEBHOOK_URL is not configured", async () => {
    vi.stubEnv("RAD_DASH_WEBHOOK_URL", "");
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeRequest({ feedbackIds: ["fb-1"] }));
    expect(res.status).toBe(503);
  });

  it("returns 503 when RAD_DASH_WEBHOOK_SECRET is not configured", async () => {
    vi.stubEnv("RAD_DASH_WEBHOOK_SECRET", "");
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeRequest({ feedbackIds: ["fb-1"] }));
    expect(res.status).toBe(503);
  });

  it("returns 422 for empty feedbackIds array", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeRequest({ feedbackIds: [] }));
    expect(res.status).toBe(422);
  });

  it("returns 404 when no matching feedback found in DB", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFeedbackFindMany.mockResolvedValue([]);
    const res = await POST(makeRequest({ feedbackIds: ["non-existent"] }));
    expect(res.status).toBe(404);
  });

  it("sends correct payload to Rad-Dash and returns 200 on success", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeRequest({ feedbackIds: ["fb-1"] }));
    expect(res.status).toBe(200);
    const body = await res.json() as { created: number };
    expect(body.created).toBe(1);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(WEBHOOK_URL);
    expect((init.headers as Record<string, string>)["authorization"]).toBe(
      `Bearer ${WEBHOOK_SECRET}`
    );

    const sentPayload = JSON.parse(init.body as string) as {
      environment: string;
      feedbackItems: Array<{ id: string; type: string; title: string }>;
    };
    expect(sentPayload.environment).toBe("dev");
    expect(sentPayload).not.toHaveProperty("projectId");
    expect(sentPayload.feedbackItems).toHaveLength(1);
    expect(sentPayload.feedbackItems[0].id).toBe("fb-1");
    expect(sentPayload.feedbackItems[0].type).toBe("BUG");
    expect(sentPayload.feedbackItems[0].title).toBe("Button is broken");
  });

  it("sends 'prod' environment when isStrictProductionDeployment returns true", async () => {
    const { isStrictProductionDeployment } = await import("@/lib/production-deployment");
    vi.mocked(isStrictProductionDeployment).mockReturnValue(true);

    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    await POST(makeRequest({ feedbackIds: ["fb-1"] }));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sentPayload = JSON.parse(init.body as string) as { environment: string };
    expect(sentPayload.environment).toBe("prod");
  });

  it("returns 502 when Rad-Dash returns a non-ok status", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Invalid payload",
    } as Response);
    const res = await POST(makeRequest({ feedbackIds: ["fb-1"] }));
    expect(res.status).toBe(502);
  });

  it("returns 502 when fetch throws (network error)", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await POST(makeRequest({ feedbackIds: ["fb-1"] }));
    expect(res.status).toBe(502);
  });

  it("sends correct Authorization header with Bearer scheme", async () => {
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    await POST(makeRequest({ feedbackIds: ["fb-1"] }));
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toMatch(/^Bearer .+/);
  });

  it("accepts feedback item where all nullable fields are null", async () => {
    mockFeedbackFindMany.mockResolvedValue([
      {
        id: "fb-sparse",
        shortId: 99,
        type: "FEATURE_REQUEST" as const,
        title: "Sparse feedback",
        description: "Only required fields.",
        screenshot: null,
        videoUrl: null,
        pageUrl: null,
        priority: null,
        user: { name: null, email: "user@example.com" },
        createdAt: new Date("2026-04-22T10:00:00.000Z"),
      },
    ]);
    mockGetEffectiveSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makeRequest({ feedbackIds: ["fb-sparse"] }));
    expect(res.status).toBe(200);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const sentPayload = JSON.parse(init.body as string) as {
      feedbackItems: Array<{ priority: string | null; pageUrl: string | null }>;
    };
    expect(sentPayload.feedbackItems[0].priority).toBeNull();
    expect(sentPayload.feedbackItems[0].pageUrl).toBeNull();
  });
});
