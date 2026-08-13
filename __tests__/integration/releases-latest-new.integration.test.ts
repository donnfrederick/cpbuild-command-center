import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

const mockReleaseFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    release: {
      findFirst: (...args: unknown[]) => mockReleaseFindFirst(...args),
    },
  },
}));

// ── Import handler after mocks ─────────────────────────────────────────────────

const { GET } = await import("@/app/api/releases/latest-new/route");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_RELEASE = {
  id: "rel-1",
  version: "1.0.5",
  title: "Unit Cards refresh",
  body: "Improved layout",
  mergedAt: new Date("2026-03-10T12:00:00Z"),
  tour: {
    id: "tour-1",
    releaseId: "rel-1",
    steps: [
      { id: "s1", order: 1, title: "What's new", body: "New unit cards layout", voiceText: null, action: null },
    ],
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/releases/latest-new", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 204 when no release with a tour exists", async () => {
    mockReleaseFindFirst.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(204);
  });

  it("returns 204 when release exists but has no tour", async () => {
    mockReleaseFindFirst.mockResolvedValue({ ...MOCK_RELEASE, tour: null });
    const res = await GET();
    expect(res.status).toBe(204);
  });

  it("returns 200 with release and tour on success", async () => {
    mockReleaseFindFirst.mockResolvedValue(MOCK_RELEASE);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { release: { id: string }; tour: { id: string } };
    expect(body.release.id).toBe("rel-1");
    expect(body.tour.id).toBe("tour-1");
  });

  it("queries for the most recently merged release with a tour", async () => {
    mockReleaseFindFirst.mockResolvedValue(MOCK_RELEASE);
    await GET();
    expect(mockReleaseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tour: { isNot: null } },
        orderBy: { mergedAt: "desc" },
      })
    );
  });
});
