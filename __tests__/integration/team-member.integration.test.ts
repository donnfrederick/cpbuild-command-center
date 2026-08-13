import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/team/user-2", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── PATCH /api/team/[id] ──────────────────────────────────────────────────────

describe("PATCH /api/team/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest({ roleId: "role-1" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role lacks MANAGE_ROLES permission", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin-1", role: "MEMBER" },
    } as never);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest({ roleId: "role-1" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when admin tries to change their own role", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    } as never);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest({ roleId: "role-1" }), {
      params: Promise.resolve({ id: "admin-1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot change your own role/i);
  });

  it("returns 422 when roleId is missing", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    } as never);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest({}), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 when target user does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValueOnce(null as never);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest({ roleId: "role-1" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 and updated member on successful role change", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({ id: "user-2" } as never);
    vi.mocked(db.user.update).mockResolvedValueOnce({
      id: "user-2",
      email: "member@test.com",
      name: "Member",
      role: { code: "PM", name: "Project Manager" },
    } as never);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest({ roleId: "role-pm" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe("PM");
    expect(body.data.email).toBe("member@test.com");
  });
});

// ─── DELETE /api/team/[id] ─────────────────────────────────────────────────────

describe("DELETE /api/team/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function makeDeleteRequest(): Request {
    return new Request("http://localhost/api/team/user-2", { method: "DELETE" });
  }

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when role lacks REMOVE_MEMBER permission", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin-1", role: "MEMBER" },
    } as never);

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when admin tries to remove themselves", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    } as never);

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "admin-1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot remove yourself/i);
  });

  it("returns 404 when target user does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValueOnce(null as never);

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful member removal", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({ id: "user-2" } as never);
    vi.mocked(db.user.delete).mockResolvedValueOnce({ id: "user-2" } as never);

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeDeleteRequest(), {
      params: Promise.resolve({ id: "user-2" }),
    });
    expect(res.status).toBe(204);
  });
});
