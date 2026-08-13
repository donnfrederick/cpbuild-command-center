/**
 * Integration tests for POST /api/automation/release-tour.
 *
 * Covers:
 * - 401 when AUTOMATION_SECRET is wrong and no session
 * - 401 when AUTOMATION_SECRET env var is not set and no session
 * - 410 when valid bearer token (CI automation disabled; session auth still allowed)
 * - 503 when GEMINI_API_KEY is not configured (session auth)
 * - 400 when body is invalid (session auth)
 * - 201 happy path — creates Release + ReleaseTour (session auth)
 * - 200 skipped — tour already exists for the release (session auth)
 * - Admin session auth path (no bearer token)
 * - Fixture with all-empty Unifier-like change fields (no description, no route)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    release: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    releaseTour: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/ai/gemini", () => ({
  generateReleaseTour: vi.fn(),
  isAIEnabled: vi.fn(),
}));

const VALID_BODY = {
  prNumber: 99,
  title: "March 5 Release — fixes and tour",
  branch: "feat/auto-tour",
  environment: "development",
  mergedAt: "2026-03-05T12:00:00.000Z",
  changes: [
    { id: "c1", description: "Add project export", route: "/en/projects", category: "feature" },
    { id: "c2", description: "Fix mobile nav", route: "/en/", category: "bug-fix" },
  ],
};

const GENERATED_STEPS = [
  {
    order: 0,
    pageUrl: "/en/projects",
    elementSelector: '[data-testid="projects-table"]',
    title: "Export your projects",
    description: "You can now export project data to CSV.",
    voiceText: "You can now export project data to CSV.",
  },
];

const MOCK_RELEASE = {
  id: "release-1",
  ...VALID_BODY,
  mergedAt: new Date(VALID_BODY.mergedAt),
  changes: VALID_BODY.changes,
  createdAt: new Date(),
};

const MOCK_TOUR = {
  id: "tour-1",
  releaseId: "release-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  steps: GENERATED_STEPS.map((s, i) => ({ ...s, id: `step-${i}`, tourId: "tour-1" })),
};

function makeRequest(body: unknown, bearerToken?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
  return new Request("http://localhost/api/automation/release-tour", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/automation/release-tour", () => {
  beforeEach(() => {
    // Do not call vi.resetModules() / vi.clearAllMocks() here — they break
    // mockResolvedValueOnce on the shared @/lib/auth mock across tests.
    process.env.AUTOMATION_SECRET = "test-automation-secret";
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("returns 401 when no bearer token and no session", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer token is wrong and no session", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(VALID_BODY, "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when AUTOMATION_SECRET env var is not set and no session", async () => {
    delete process.env.AUTOMATION_SECRET;
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(VALID_BODY, "some-token"));
    expect(res.status).toBe(401);
  });

  it("returns 410 when bearer token is valid (CI automatic tours disabled)", async () => {
    // Do not mock auth() here — isAuthorized returns before calling auth when the
    // bearer matches, and a queued mockResolvedValueOnce(null) would leak to the
    // next test and make session-based cases see 401 first.
    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(VALID_BODY, "test-automation-secret"));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/disabled/i);
  });

  it("returns 503 when GEMINI_API_KEY is not configured", async () => {
    const { auth } = await import("@/lib/auth");
    const { isAIEnabled } = await import("@/lib/ai/gemini");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(isAIEnabled).mockReturnValue(false);

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/GEMINI_API_KEY/i);
  });

  it("returns 400 when body is missing required title", async () => {
    const { auth } = await import("@/lib/auth");
    const { isAIEnabled } = await import("@/lib/ai/gemini");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(isAIEnabled).mockReturnValue(true);

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest({ prNumber: 1 }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with release and tour on happy path (admin session)", async () => {
    const { auth } = await import("@/lib/auth");
    const { isAIEnabled, generateReleaseTour } = await import("@/lib/ai/gemini");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(isAIEnabled).mockReturnValue(true);
    vi.mocked(db.release.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(db.release.create).mockResolvedValueOnce(MOCK_RELEASE as never);
    vi.mocked(db.releaseTour.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(generateReleaseTour).mockResolvedValueOnce(GENERATED_STEPS as never);
    vi.mocked(db.$transaction).mockResolvedValueOnce([MOCK_TOUR] as never);

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.release.id).toBe("release-1");
    expect(body.tour.id).toBe("tour-1");
    expect(body.tour.steps).toHaveLength(1);
  });

  it("returns 200 skipped when tour already exists (idempotent)", async () => {
    const { auth } = await import("@/lib/auth");
    const { isAIEnabled } = await import("@/lib/ai/gemini");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(isAIEnabled).mockReturnValue(true);
    vi.mocked(db.release.findFirst).mockResolvedValueOnce(MOCK_RELEASE as never);
    vi.mocked(db.releaseTour.findUnique).mockResolvedValueOnce({ id: "tour-1" } as never);

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("skipped");
    expect(body.releaseId).toBe("release-1");
  });

  it("rejects MEMBER session (must be ADMIN to call without bearer)", async () => {
    const { auth } = await import("@/lib/auth");
    const { isAIEnabled } = await import("@/lib/ai/gemini");

    // MEMBER role does not have MANAGE_ROLES permission
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u2", role: "MEMBER" } } as never);
    vi.mocked(isAIEnabled).mockReturnValue(true);

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("handles changes with all-empty descriptions (Unifier null-field fixture)", async () => {
    // Unifier can return empty strings for all change description fields.
    const { auth } = await import("@/lib/auth");
    const { isAIEnabled, generateReleaseTour } = await import("@/lib/ai/gemini");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(isAIEnabled).mockReturnValue(true);

    const emptyChangesBody = {
      ...VALID_BODY,
      changes: [
        { id: "c1", description: "", route: undefined, category: undefined },
      ],
    };

    const emptyChangesRelease = {
      ...MOCK_RELEASE,
      changes: emptyChangesBody.changes,
    };

    vi.mocked(db.release.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(db.release.create).mockResolvedValueOnce(emptyChangesRelease as never);
    vi.mocked(db.releaseTour.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(generateReleaseTour).mockResolvedValueOnce(GENERATED_STEPS as never);
    vi.mocked(db.$transaction).mockResolvedValueOnce([MOCK_TOUR] as never);

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(emptyChangesBody));
    // Should succeed — Gemini call is mocked, Zod allows empty description via .default("")
    expect(res.status).toBe(201);
  });

  it("returns 502 when Gemini throws an error", async () => {
    const { auth } = await import("@/lib/auth");
    const { isAIEnabled, generateReleaseTour } = await import("@/lib/ai/gemini");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(isAIEnabled).mockReturnValue(true);
    vi.mocked(db.release.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(db.release.create).mockResolvedValueOnce(MOCK_RELEASE as never);
    vi.mocked(db.releaseTour.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(generateReleaseTour).mockRejectedValueOnce(new Error("Gemini quota exceeded"));

    const { POST } = await import("@/app/api/automation/release-tour/route");
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/generation failed/i);
  });
});
