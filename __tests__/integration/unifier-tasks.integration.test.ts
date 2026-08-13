import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockGetSession() }));

const mockUserFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

const mockFetchAllRows = vi.fn();
vi.mock("@/lib/unifier/client", () => ({
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
}));

vi.mock("@/lib/unifier/schema-definition", () => ({
  getTableDef: () => ({
    columns: [
      { code: "ID" }, { code: "TASK_NAME" }, { code: "ASSIGNEE_ID" },
    ],
  }),
}));

// ── Import handler after mocks ─────────────────────────────────────────────────

const { GET } = await import("@/app/api/users/[id]/unifier-tasks/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(userId: string) {
  return {
    req: new NextRequest(`http://localhost/api/users/${userId}/unifier-tasks`),
    ctx: { params: Promise.resolve({ id: userId }) },
  };
}

function adminSession(id = "admin-1") {
  return { user: { id, role: "ADMIN" } };
}

function memberSession(id = "member-1") {
  return { user: { id, role: "MEMBER" } };
}

const MOCK_USER_LINKED = {
  id: "user-1",
  email: "alice@cpbuild.com",
  unifierUserId: "u42",
  unifierUsername: "alice",
};

const MOCK_USER_UNLINKED = {
  id: "user-2",
  email: "bob@cpbuild.com",
  unifierUserId: null,
  unifierUsername: null,
};

const MOCK_TASKS = [
  { ID: "t1", TASK_NAME: "Review plan", ASSIGNEE_ID: "u42" },
  { ID: "t2", TASK_NAME: "Sign off", ASSIGNEE_ID: "u99" },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/users/[id]/unifier-tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession());
    mockUserFindUnique.mockResolvedValue(MOCK_USER_LINKED);
    mockFetchAllRows.mockResolvedValue(MOCK_TASKS);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const { req, ctx } = makeRequest("user-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when a MEMBER requests another user's tasks", async () => {
    mockGetSession.mockResolvedValue(memberSession("member-1"));
    const { req, ctx } = makeRequest("different-user");
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it("allows a member to fetch their own tasks", async () => {
    mockGetSession.mockResolvedValue(memberSession("user-1"));
    mockUserFindUnique.mockResolvedValue(MOCK_USER_LINKED);
    const { req, ctx } = makeRequest("user-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
  });

  it("returns 404 when the user does not exist", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const { req, ctx } = makeRequest("no-such-user");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns empty tasks when user has no linked Unifier account", async () => {
    mockUserFindUnique.mockResolvedValue(MOCK_USER_UNLINKED);
    const { req, ctx } = makeRequest("user-2");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; total: number; message: string };
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.message).toContain("no linked Unifier account");
  });

  it("returns only tasks assigned to the user's Unifier ID", async () => {
    const { req, ctx } = makeRequest("user-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; total: number; unifierUserId: string };
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.unifierUserId).toBe("u42");
  });

  it("returns 502 when Unifier fetch fails", async () => {
    mockFetchAllRows.mockRejectedValue(new Error("Unifier connection refused"));
    // Advance time past the 5-minute TTL to bypass the module-level tasks cache
    vi.useFakeTimers();
    vi.advanceTimersByTime(6 * 60 * 1000);
    try {
      const { req, ctx } = makeRequest("user-1");
      const res = await GET(req, ctx);
      expect(res.status).toBe(502);
      const body = await res.json() as { error: string };
      expect(body.error).toBe("Unifier connection refused");
    } finally {
      vi.useRealTimers();
    }
  });
});
