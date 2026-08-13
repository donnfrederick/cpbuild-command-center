import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    release: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    releaseVerification: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    environmentVisit: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/devtools-env", () => ({
  isDevToolsAllowed: vi.fn(() => true),
  DEVTOOLS_BLOCKED_MESSAGE: "DevTools blocked",
}));
// Mock the combined helper so routes only need one mock call per test
vi.mock("@/lib/devtools-auth", () => ({
  requireDevToolsAdmin: vi.fn(),
  requireDevToolsAdminWithSession: vi.fn(),
  getDevToolsAdminSession: vi.fn(),
}));

const ADMIN_SESSION = {
  user: { id: "u-admin", name: "Admin", email: "admin@example.com", role: "ADMIN" },
};
const MEMBER_SESSION = {
  user: { id: "u-member", name: "Member", email: "member@example.com", role: "MEMBER" },
};

/** Helper: mock requireDevToolsAdminWithSession to allow an admin through */
async function allowAdmin() {
  const { requireDevToolsAdminWithSession } = await import("@/lib/devtools-auth");
  vi.mocked(requireDevToolsAdminWithSession).mockResolvedValueOnce(
    { guard: null, session: ADMIN_SESSION } as never
  );
}

/** Helper: mock requireDevToolsAdminWithSession to return 401 */
async function blockUnauthenticated() {
  const { requireDevToolsAdminWithSession } = await import("@/lib/devtools-auth");
  const { NextResponse } = await import("next/server");
  vi.mocked(requireDevToolsAdminWithSession).mockResolvedValueOnce({
    guard: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    session: null,
  } as never);
}

/** Helper: mock requireDevToolsAdminWithSession to return 403 */
async function blockMember() {
  const { requireDevToolsAdminWithSession } = await import("@/lib/devtools-auth");
  const { NextResponse } = await import("next/server");
  vi.mocked(requireDevToolsAdminWithSession).mockResolvedValueOnce({
    guard: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    session: null,
  } as never);
}

function makeRequest(
  url: string,
  init: RequestInit = {}
): Request {
  return new Request(`http://localhost${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

// ── GET /api/devtools/releases ────────────────────────────────────────────────

describe("GET /api/devtools/releases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    await blockUnauthenticated();
    const { GET } = await import("@/app/api/devtools/releases/route");
    const res = await GET(makeRequest("/api/devtools/releases?environment=development") as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as MEMBER", async () => {
    await blockMember();
    const { GET } = await import("@/app/api/devtools/releases/route");
    const res = await GET(makeRequest("/api/devtools/releases?environment=development") as never);
    expect(res.status).toBe(403);
  });

  it("returns releases list with verification status for ADMIN", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    const lastVisit = new Date("2026-03-01T00:00:00Z");
    const mergedAt = new Date("2026-03-03T00:00:00Z");

    vi.mocked(db.environmentVisit.findUnique).mockResolvedValueOnce({
      userId: "u-admin",
      environment: "development",
      lastVisitedAt: lastVisit,
    } as never);

    vi.mocked(db.release.findMany).mockResolvedValueOnce([
      {
        id: "rel-1",
        title: "PR #55 — Open Project Flow",
        prNumber: 55,
        branch: "feat/open-project-flow",
        environment: "all",
        mergedAt,
        changes: [{ id: "c1", description: "New project form", route: "/projects", category: "feature" }],
        createdAt: new Date(),
        verifications: [{ id: "v1", verifiedAt: new Date("2026-03-04T00:00:00Z") }],
      },
    ] as never);

    const { GET } = await import("@/app/api/devtools/releases/route");
    const res = await GET(makeRequest("/api/devtools/releases?environment=development") as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.releases).toHaveLength(1);
    expect(body.releases[0].verified).toBe(true);
    expect(body.releases[0].isNew).toBe(true);
    expect(body.lastVisitedAt).toBeTruthy();
  });

  it("marks isNew=true when lastVisitedAt is null (first visit)", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    vi.mocked(db.environmentVisit.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(db.release.findMany).mockResolvedValueOnce([
      {
        id: "rel-2",
        title: "PR #50",
        prNumber: 50,
        branch: "feat/example",
        environment: "all",
        mergedAt: new Date("2026-01-01T00:00:00Z"),
        changes: [],
        createdAt: new Date(),
        verifications: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/devtools/releases/route");
    const res = await GET(makeRequest("/api/devtools/releases?environment=development") as never);
    const body = await res.json();
    expect(body.releases[0].isNew).toBe(true);
    expect(body.lastVisitedAt).toBeNull();
  });

  it("returns 403 when DevTools are blocked", async () => {
    const { isDevToolsAllowed } = await import("@/lib/devtools-env");
    vi.mocked(isDevToolsAllowed).mockReturnValueOnce(false);

    const { GET } = await import("@/app/api/devtools/releases/route");
    const res = await GET(makeRequest("/api/devtools/releases?environment=development") as never);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/devtools/releases ───────────────────────────────────────────────

describe("POST /api/devtools/releases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a release for ADMIN", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    vi.mocked(db.release.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(db.release.create).mockResolvedValueOnce({
      id: "rel-new",
      title: "PR #60 — Error Wrap Up",
      prNumber: 60,
      branch: "feat/devtools-error-wrap-up",
      environment: "all",
      mergedAt: new Date("2026-02-26T12:00:00Z"),
      changes: [],
      createdAt: new Date(),
    } as never);

    const { POST } = await import("@/app/api/devtools/releases/route");
    const res = await POST(
      makeRequest("/api/devtools/releases", {
        method: "POST",
        body: JSON.stringify({
          title: "PR #60 — Error Wrap Up",
          prNumber: 60,
          branch: "feat/devtools-error-wrap-up",
          environment: "all",
          mergedAt: "2026-02-26T12:00:00.000Z",
          changes: [],
        }),
      }) as never
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("rel-new");
  });

  it("returns 409 when prNumber already exists", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    vi.mocked(db.release.findFirst).mockResolvedValueOnce({ id: "existing" } as never);

    const { POST } = await import("@/app/api/devtools/releases/route");
    const res = await POST(
      makeRequest("/api/devtools/releases", {
        method: "POST",
        body: JSON.stringify({
          title: "Duplicate",
          prNumber: 55,
          mergedAt: "2026-02-26T12:00:00.000Z",
        }),
      }) as never
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 for missing required fields", async () => {
    await allowAdmin();
    const { POST } = await import("@/app/api/devtools/releases/route");
    const res = await POST(
      makeRequest("/api/devtools/releases", {
        method: "POST",
        body: JSON.stringify({ title: "" }),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  it("accepts a release with all optional fields null/empty (external data edge case)", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    vi.mocked(db.release.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(db.release.create).mockResolvedValueOnce({ id: "r-min", title: "Minimal" } as never);

    const { POST } = await import("@/app/api/devtools/releases/route");
    const res = await POST(
      makeRequest("/api/devtools/releases", {
        method: "POST",
        body: JSON.stringify({
          title: "Minimal release",
          prNumber: null,
          branch: "",
          mergedAt: "2026-03-01T00:00:00.000Z",
          changes: [],
        }),
      }) as never
    );
    expect(res.status).toBe(201);
  });

  it("returns 401 when unauthenticated", async () => {
    await blockUnauthenticated();
    const { POST } = await import("@/app/api/devtools/releases/route");
    const res = await POST(
      makeRequest("/api/devtools/releases", {
        method: "POST",
        body: JSON.stringify({ title: "X", mergedAt: "2026-01-01T00:00:00.000Z" }),
      }) as never
    );
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/devtools/releases/[id]/verify ──────────────────────────────────

describe("PATCH /api/devtools/releases/[id]/verify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks a release as verified for ADMIN", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    vi.mocked(db.release.findUnique).mockResolvedValueOnce({ id: "rel-1" } as never);
    vi.mocked(db.releaseVerification.upsert).mockResolvedValueOnce({
      id: "ver-1",
      releaseId: "rel-1",
      userId: "u-admin",
      environment: "development",
      verifiedAt: new Date(),
    } as never);

    const { PATCH } = await import("@/app/api/devtools/releases/[id]/verify/route");
    const res = await PATCH(
      makeRequest("/api/devtools/releases/rel-1/verify", {
        method: "PATCH",
        body: JSON.stringify({ environment: "development" }),
      }) as never,
      { params: Promise.resolve({ id: "rel-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("ver-1");
  });

  it("returns 404 when release does not exist", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    vi.mocked(db.release.findUnique).mockResolvedValueOnce(null as never);

    const { PATCH } = await import("@/app/api/devtools/releases/[id]/verify/route");
    const res = await PATCH(
      makeRequest("/api/devtools/releases/no-such/verify", {
        method: "PATCH",
        body: JSON.stringify({ environment: "development" }),
      }) as never,
      { params: Promise.resolve({ id: "no-such" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid environment value", async () => {
    await allowAdmin();
    const { PATCH } = await import("@/app/api/devtools/releases/[id]/verify/route");
    const res = await PATCH(
      makeRequest("/api/devtools/releases/rel-1/verify", {
        method: "PATCH",
        body: JSON.stringify({ environment: "invalid-env" }),
      }) as never,
      { params: Promise.resolve({ id: "rel-1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    await blockUnauthenticated();
    const { PATCH } = await import("@/app/api/devtools/releases/[id]/verify/route");
    const res = await PATCH(
      makeRequest("/api/devtools/releases/rel-1/verify", {
        method: "PATCH",
        body: JSON.stringify({ environment: "development" }),
      }) as never,
      { params: Promise.resolve({ id: "rel-1" }) }
    );
    expect(res.status).toBe(401);
  });
});

// ── POST /api/devtools/environment-visit ──────────────────────────────────────

describe("POST /api/devtools/environment-visit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts the visit record for ADMIN", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    const visitRecord = { userId: "u-admin", environment: "development", lastVisitedAt: new Date() };
    vi.mocked(db.environmentVisit.upsert).mockResolvedValueOnce(visitRecord as never);

    const { POST } = await import("@/app/api/devtools/environment-visit/route");
    const res = await POST(
      makeRequest("/api/devtools/environment-visit", {
        method: "POST",
        body: JSON.stringify({ environment: "development" }),
      }) as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.environment).toBe("development");
    expect(db.environmentVisit.upsert).toHaveBeenCalledOnce();
  });

  it("returns 400 for missing environment field", async () => {
    await allowAdmin();
    const { POST } = await import("@/app/api/devtools/environment-visit/route");
    const res = await POST(
      makeRequest("/api/devtools/environment-visit", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    await blockUnauthenticated();
    const { POST } = await import("@/app/api/devtools/environment-visit/route");
    const res = await POST(
      makeRequest("/api/devtools/environment-visit", {
        method: "POST",
        body: JSON.stringify({ environment: "development" }),
      }) as never
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when MEMBER tries to update visit", async () => {
    await blockMember();
    const { POST } = await import("@/app/api/devtools/environment-visit/route");
    const res = await POST(
      makeRequest("/api/devtools/environment-visit", {
        method: "POST",
        body: JSON.stringify({ environment: "development" }),
      }) as never
    );
    expect(res.status).toBe(403);
  });
});

// ── DELETE /api/devtools/releases/[id] ───────────────────────────────────────

describe("DELETE /api/devtools/releases/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a release and returns { deleted: true } for ADMIN", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    vi.mocked(db.release.findUnique).mockResolvedValueOnce({ id: "rel-del-1" } as never);
    vi.mocked(db.release.delete).mockResolvedValueOnce({ id: "rel-del-1" } as never);

    const { DELETE } = await import("@/app/api/devtools/releases/[id]/route");
    const res = await DELETE(
      makeRequest("/api/devtools/releases/rel-del-1", { method: "DELETE" }) as never,
      { params: Promise.resolve({ id: "rel-del-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ deleted: true, id: "rel-del-1" });
    expect(vi.mocked(db.release.delete)).toHaveBeenCalledWith({ where: { id: "rel-del-1" } });
  });

  it("returns 404 when the release does not exist", async () => {
    await allowAdmin();
    const { db } = await import("@/lib/db");
    vi.mocked(db.release.findUnique).mockResolvedValueOnce(null);

    const { DELETE } = await import("@/app/api/devtools/releases/[id]/route");
    const res = await DELETE(
      makeRequest("/api/devtools/releases/missing", { method: "DELETE" }) as never,
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    await blockUnauthenticated();
    const { DELETE } = await import("@/app/api/devtools/releases/[id]/route");
    const res = await DELETE(
      makeRequest("/api/devtools/releases/rel-1", { method: "DELETE" }) as never,
      { params: Promise.resolve({ id: "rel-1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    await blockMember();
    const { DELETE } = await import("@/app/api/devtools/releases/[id]/route");
    const res = await DELETE(
      makeRequest("/api/devtools/releases/rel-1", { method: "DELETE" }) as never,
      { params: Promise.resolve({ id: "rel-1" }) }
    );
    expect(res.status).toBe(403);
  });
});
