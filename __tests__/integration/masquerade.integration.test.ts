import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.stubEnv("AUTH_SECRET", "test-secret-for-integration-tests");

const mockAuth = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockAuth() }));

const mockCookieGet = vi.fn();
const mockCookiesModule = {
  cookies: vi.fn().mockResolvedValue({ get: mockCookieGet }),
};
vi.mock("next/headers", () => mockCookiesModule);

const mockMasqueradeLogCreate  = vi.fn();
const mockMasqueradeLogUpdate  = vi.fn();
const mockMasqueradeLogFindMany = vi.fn();
const mockMasqueradeLogCount   = vi.fn();
const mockUserFindUnique       = vi.fn();
const mockTransaction          = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    masqueradeLog: {
      create:   (...args: unknown[]) => mockMasqueradeLogCreate(...args),
      update:   (...args: unknown[]) => mockMasqueradeLogUpdate(...args),
      findMany: (...args: unknown[]) => mockMasqueradeLogFindMany(...args),
      count:    (...args: unknown[]) => mockMasqueradeLogCount(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// ── Import handlers after mocks ─────────────────────────────────────────────

const { POST, DELETE } = await import("@/app/api/admin/masquerade/route");
const { GET: GET_LOG }  = await import("@/app/api/admin/masquerade/log/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
  return {
    user: { id: "admin-1", email: "admin@cpbuild.com", name: "Phil", role: "ADMIN" },
  };
}

function memberSession() {
  return {
    user: { id: "member-1", email: "member@cpbuild.com", name: "Member", role: "MEMBER" },
  };
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/masquerade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest() {
  return new NextRequest("http://localhost/api/admin/masquerade", { method: "DELETE" });
}

function makeLogRequest(page = 1) {
  return new NextRequest(`http://localhost/api/admin/masquerade/log?page=${page}`);
}

// ── POST /api/admin/masquerade ────────────────────────────────────────────────

describe("POST /api/admin/masquerade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieGet.mockReturnValue(undefined); // no existing masquerade cookie
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makePostRequest({ targetUserId: "target-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller lacks MASQUERADE_USER permission", async () => {
    mockAuth.mockResolvedValue(memberSession());
    const res = await POST(makePostRequest({ targetUserId: "target-1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when targetUserId is missing", async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when masquerading as yourself", async () => {
    mockAuth.mockResolvedValue(adminSession());
    const res = await POST(makePostRequest({ targetUserId: "admin-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when target user does not exist", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockUserFindUnique.mockResolvedValue(null);
    const res = await POST(makePostRequest({ targetUserId: "nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("returns 201 and sets a Set-Cookie header on success", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockUserFindUnique.mockResolvedValue({
      id: "member-1",
      email: "member@cpbuild.com",
      name: "Member",
      role: { code: "MEMBER" },
    });
    mockMasqueradeLogCreate.mockResolvedValue({ id: "log-1" });

    const res = await POST(makePostRequest({ targetUserId: "member-1" }));
    expect(res.status).toBe(201);

    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("cc-masquerade=");
    expect(setCookie).toContain("HttpOnly");

    const body = await res.json();
    expect(body.logId).toBe("log-1");
    expect(body.targetUser.id).toBe("member-1");
  });

  it("returns 409 when already masquerading", async () => {
    mockAuth.mockResolvedValue(adminSession());
    // Simulate existing masquerade cookie
    // We need a real signed cookie for this test
    const { signMasqueradeCookie } = await import("@/lib/masquerade");
    const signed = await signMasqueradeCookie({
      actorId: "admin-1",
      targetUserId: "member-1",
      logId: "old-log",
      iat: Math.floor(Date.now() / 1000),
    });
    mockCookieGet.mockReturnValue({ value: signed });

    const res = await POST(makePostRequest({ targetUserId: "member-2" }));
    expect(res.status).toBe(409);
  });
});

// ── DELETE /api/admin/masquerade ──────────────────────────────────────────────

describe("DELETE /api/admin/masquerade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockCookieGet.mockReturnValue(undefined);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("returns 200 and clears cookie when no active masquerade cookie", async () => {
    mockAuth.mockResolvedValue(memberSession());
    mockCookieGet.mockReturnValue(undefined);
    const res = await DELETE();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("updates MasqueradeLog.endedAt and clears cookie on valid exit", async () => {
    mockAuth.mockResolvedValue(adminSession());
    const { signMasqueradeCookie } = await import("@/lib/masquerade");
    const signed = await signMasqueradeCookie({
      actorId: "admin-1",
      targetUserId: "member-1",
      logId: "log-1",
      iat: Math.floor(Date.now() / 1000),
    });
    mockCookieGet.mockReturnValue({ value: signed });
    mockMasqueradeLogUpdate.mockResolvedValue({});

    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(mockMasqueradeLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-1" },
        data: expect.objectContaining({ endedAt: expect.any(Date) }),
      })
    );
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("Max-Age=0");
  });
});

// ── GET /api/admin/masquerade/log ─────────────────────────────────────────────

describe("GET /api/admin/masquerade/log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET_LOG(makeLogRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller lacks MASQUERADE_USER permission", async () => {
    mockAuth.mockResolvedValue(memberSession());
    const res = await GET_LOG(makeLogRequest());
    expect(res.status).toBe(403);
  });

  it("returns paginated log for ADMIN", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockTransaction.mockResolvedValue([
      2,
      [
        {
          id: "log-1",
          startedAt: new Date("2026-03-05T10:00:00Z"),
          endedAt: new Date("2026-03-05T10:15:00Z"),
          actor: { id: "super-1", name: "Phil", email: "phil@cpbuild.com" },
          target: {
            id: "member-1",
            name: "Member",
            email: "member@cpbuild.com",
            role: { code: "MEMBER", name: "Member" },
          },
        },
        {
          id: "log-2",
          startedAt: new Date("2026-03-05T11:00:00Z"),
          endedAt: null,
          actor: { id: "super-1", name: "Phil", email: "phil@cpbuild.com" },
          target: {
            id: "admin-1",
            name: "Admin",
            email: "admin@cpbuild.com",
            role: { code: "ADMIN", name: "Admin" },
          },
        },
      ],
    ]);

    const res = await GET_LOG(makeLogRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].id).toBe("log-1");
  });
});
