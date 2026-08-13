import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockGetSession() }));

const mockGetSubcontractorsForPicker = vi.fn();
vi.mock("@/lib/unifier/subcontractors", () => ({
  getSubcontractorsForPicker: () => mockGetSubcontractorsForPicker(),
}));

// ── Import handler after mocks ─────────────────────────────────────────────────

const { GET } = await import("@/app/api/unifier/subcontractors/route");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_SUBS = [
  { id: "sub-1", name: "Acme Tile" },
  { id: "sub-2", name: "Best Electrical" },
];

function memberSession() {
  return { user: { id: "user-1", role: "MEMBER" } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/unifier/subcontractors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(memberSession());
    mockGetSubcontractorsForPicker.mockResolvedValue(MOCK_SUBS);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with subcontractor list for authenticated user", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { subcontractors: { id: string; name: string }[] };
    expect(body.subcontractors).toEqual(MOCK_SUBS);
  });

  it("returns 502 when Unifier fetch fails", async () => {
    mockGetSubcontractorsForPicker.mockRejectedValue(new Error("Unifier unavailable"));
    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Failed to load subcontractors");
  });

  it("returns empty array when no active subs exist", async () => {
    mockGetSubcontractorsForPicker.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { subcontractors: unknown[] };
    expect(body.subcontractors).toEqual([]);
  });
});
