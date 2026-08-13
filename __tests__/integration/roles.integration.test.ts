import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { role: { findMany: vi.fn() } },
}));

describe("GET /api/roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/roles/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks INVITE_MEMBER and MANAGE_ROLES", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "MEMBER" },
    } as never);

    const { GET } = await import("@/app/api/roles/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 200 with roles when user has INVITE_MEMBER", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.role.findMany).mockResolvedValueOnce([
      { id: "r1", code: "ADMIN", name: "Admin", description: "Full access" },
      { id: "r2", code: "MEMBER", name: "Member", description: "Base access" },
    ] as never);

    const { GET } = await import("@/app/api/roles/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({ id: "r1", code: "ADMIN", name: "Admin", description: "Full access" });
    expect(body.data[1].code).toBe("MEMBER");
  });
});
