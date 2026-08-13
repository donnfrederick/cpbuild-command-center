import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { invite: { findUnique: vi.fn() } },
}));

describe("GET /api/invites/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when token is missing", async () => {
    const { GET } = await import("@/app/api/invites/validate/route");
    const req = new Request("http://localhost/api/invites/validate");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when invite not found", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/invites/validate/route");
    const req = new Request("http://localhost/api/invites/validate?token=bad");
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns 410 when invite already accepted", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "i1",
      email: "x@test.com",
      roleId: "r1",
      role: { code: "MEMBER", name: "Member" },
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: new Date(),
    } as never);

    const { GET } = await import("@/app/api/invites/validate/route");
    const req = new Request("http://localhost/api/invites/validate?token=valid");
    const res = await GET(req);
    expect(res.status).toBe(410);
  });

  it("returns 410 when invite expired", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "i1",
      email: "x@test.com",
      roleId: "r1",
      role: { code: "MEMBER", name: "Member" },
      expiresAt: new Date(Date.now() - 86400000),
      acceptedAt: null,
    } as never);

    const { GET } = await import("@/app/api/invites/validate/route");
    const req = new Request("http://localhost/api/invites/validate?token=valid");
    const res = await GET(req);
    expect(res.status).toBe(410);
  });

  it("returns 200 with invite data when valid", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "i1",
      email: "new@test.com",
      roleId: "r1",
      role: { code: "MEMBER", name: "Member" },
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
    } as never);

    const { GET } = await import("@/app/api/invites/validate/route");
    const req = new Request("http://localhost/api/invites/validate?token=valid");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.email).toBe("new@test.com");
    expect(body.data.role).toBe("MEMBER");
    expect(body.data.roleName).toBe("Member");
  });
});
