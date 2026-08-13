import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockGetSession() }));

const mockUserFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
  },
}));

const mockSuggestUserLinks = vi.fn();
vi.mock("@/lib/unifier/users", () => ({
  getUnifierUsers: vi.fn(),
  suggestUserLinks: (...args: unknown[]) => mockSuggestUserLinks(...args),
}));

// ── Import handler after mocks ─────────────────────────────────────────────────

const { GET } = await import("@/app/api/users/link-suggestions/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
  return { user: { id: "admin-1", role: "ADMIN" } };
}

function memberSession() {
  return { user: { id: "member-1", role: "MEMBER" } };
}

const CC_USERS = [
  { id: "cc-1", email: "alice@cpbuild.com", name: "Alice Smith", unifierUserId: null },
  { id: "cc-2", email: "bob@cpbuild.com", name: "Bob Jones", unifierUserId: "u2" },
];

const SUGGESTIONS = [
  { ccUserId: "cc-1", ccEmail: "alice@cpbuild.com", unifierUserId: "u1", confidence: "high" },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/users/link-suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession());
    mockUserFindMany.mockResolvedValue(CC_USERS);
    mockSuggestUserLinks.mockResolvedValue(SUGGESTIONS);
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

  it("returns 200 with suggestions for ADMIN", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(body.data).toEqual(SUGGESTIONS);
    expect(body.total).toBe(1);
  });

  it("passes CC users to suggestUserLinks", async () => {
    await GET();
    expect(mockSuggestUserLinks).toHaveBeenCalledWith(CC_USERS);
  });

  it("returns 502 when Unifier fetch fails", async () => {
    mockSuggestUserLinks.mockRejectedValue(new Error("Unifier API error"));
    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unifier API error");
  });

  it("returns empty suggestions when all CC users are already linked", async () => {
    mockSuggestUserLinks.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});
