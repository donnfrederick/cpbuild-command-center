import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { user: { findMany: vi.fn() } },
}));

describe("GET /api/team", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/team/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks VIEW_TEAM", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "INVALID" },
    } as never);

    const { GET } = await import("@/app/api/team/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with team members when authorized", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.user.findMany).mockResolvedValueOnce([
      {
        id: "u1",
        name: "Admin",
        email: "a@test.com",
        role: { code: "ADMIN", name: "Admin" },
        createdAt: new Date(),
      },
    ] as never);

    const { GET } = await import("@/app/api/team/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe("a@test.com");
  });
});
