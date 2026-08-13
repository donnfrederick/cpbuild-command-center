import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    scopeType: { findMany: vi.fn() },
    canonicalScopeType: { findMany: vi.fn() },
    locationType: { findMany: vi.fn() },
    costType: { findMany: vi.fn() },
    installTeam: { findMany: vi.fn() },
    uomType: { findMany: vi.fn() },
  },
}));

describe("GET /api/lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/lookups/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns all lookup tables when authenticated", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1" } } as never);
    vi.mocked(db.scopeType.findMany).mockResolvedValueOnce([{ id: "s1", code: "ST1", name: "Scope 1" }] as never);
    vi.mocked(db.canonicalScopeType.findMany).mockResolvedValueOnce([{ id: "c1", code: "CST1", displayName: "Canon 1" }] as never);
    vi.mocked(db.locationType.findMany).mockResolvedValueOnce([{ id: "l1", code: "LT1", name: "Loc 1" }] as never);
    vi.mocked(db.costType.findMany).mockResolvedValueOnce([{ id: "c1", code: "CT1", name: "Cost 1" }] as never);
    vi.mocked(db.installTeam.findMany).mockResolvedValueOnce([{ id: "i1", code: "IT1", name: "Team 1" }] as never);
    vi.mocked(db.uomType.findMany).mockResolvedValueOnce([{ id: "u1", code: "EA", name: "Each" }] as never);

    const { GET } = await import("@/app/api/lookups/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scopeTypes).toHaveLength(1);
    expect(body.scopeTypes[0]).toEqual({ id: "s1", code: "ST1", name: "Scope 1" });
    expect(body.canonicalScopeTypes).toHaveLength(1);
    expect(body.canonicalScopeTypes[0]).toMatchObject({ code: "CST1" });
    expect(body.locationTypes).toHaveLength(1);
    expect(body.costTypes).toHaveLength(1);
    expect(body.installTeams).toHaveLength(1);
    expect(body.uomTypes).toHaveLength(1);
  });
});
