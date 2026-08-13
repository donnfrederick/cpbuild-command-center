import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockGetSession() }));

const mockGetUnifierUsers = vi.fn();
vi.mock("@/lib/unifier/users", () => ({
  getUnifierUsers: () => mockGetUnifierUsers(),
  suggestUserLinks: vi.fn(),
}));

// ── Import handler after mocks ─────────────────────────────────────────────────

const { GET } = await import("@/app/api/unifier/users/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
  return { user: { id: "admin-1", role: "ADMIN" } };
}

function memberSession() {
  return { user: { id: "member-1", role: "MEMBER" } };
}

const MOCK_UNIFIER_USERS = [
  { PERSON_ID: "u1", FULL_NAME: "Alice Smith", EMAIL: "alice@cpbuild.com" },
  { PERSON_ID: "u2", FULL_NAME: "Bob Jones", EMAIL: "bob@cpbuild.com" },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/unifier/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession());
    mockGetUnifierUsers.mockResolvedValue(MOCK_UNIFIER_USERS);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not ADMIN", async () => {
    mockGetSession.mockResolvedValue(memberSession());
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with user list for ADMIN", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(body.data).toEqual(MOCK_UNIFIER_USERS);
    expect(body.total).toBe(2);
  });

  it("returns 502 when Unifier fetch fails", async () => {
    mockGetUnifierUsers.mockRejectedValue(new Error("Unifier unavailable"));
    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unifier unavailable");
  });

  it("returns empty list when Unifier returns no users", async () => {
    mockGetUnifierUsers.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});
