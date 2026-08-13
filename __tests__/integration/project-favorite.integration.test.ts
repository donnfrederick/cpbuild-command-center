import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    userProjectFavorite: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/session-db-user", () => ({
  resolveSessionToDbUserId: vi.fn(),
}));

describe("PATCH /api/projects/[id]/favorite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getEffectiveSession } = await import("@/lib/masquerade");
    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null);

    const { PATCH } = await import("@/app/api/projects/[id]/favorite/route");
    const res = await PATCH(
      new Request("http://localhost/api/projects/p1/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("creates a favorite when favorite is true", async () => {
    const { getEffectiveSession } = await import("@/lib/masquerade");
    const { resolveSessionToDbUserId } = await import("@/lib/session-db-user");
    const { db } = await import("@/lib/db");

    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "u1", email: "a@b.com", role: "ADMIN" },
      masquerade: null,
      rolePreview: null,
    } as never);
    vi.mocked(resolveSessionToDbUserId).mockResolvedValueOnce("u1");
    vi.mocked(db.project.findFirst).mockResolvedValueOnce({
      id: "p1",
      deletedAt: null,
      isTestProject: false,
    } as never);
    vi.mocked(db.userProjectFavorite.upsert).mockResolvedValueOnce({
      id: "f1",
      userId: "u1",
      projectId: "p1",
      createdAt: new Date(),
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/favorite/route");
    const res = await PATCH(
      new Request("http://localhost/api/projects/p1/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projectId: "p1", favorite: true });
    expect(db.userProjectFavorite.upsert).toHaveBeenCalled();
  });

  it("returns 404 for hidden test projects", async () => {
    const { getEffectiveSession } = await import("@/lib/masquerade");
    const { resolveSessionToDbUserId } = await import("@/lib/session-db-user");
    const { db } = await import("@/lib/db");

    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "u1", email: "a@b.com", role: "MEMBER" },
      masquerade: null,
      rolePreview: null,
    } as never);
    vi.mocked(resolveSessionToDbUserId).mockResolvedValueOnce("u1");
    vi.mocked(db.project.findFirst).mockResolvedValueOnce({
      id: "p-test",
      deletedAt: null,
      isTestProject: true,
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/favorite/route");
    const res = await PATCH(
      new Request("http://localhost/api/projects/p-test/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: true }),
      }),
      { params: Promise.resolve({ id: "p-test" }) }
    );

    expect(res.status).toBe(404);
  });

  it("removes favorite when favorite is false", async () => {
    const { getEffectiveSession } = await import("@/lib/masquerade");
    const { resolveSessionToDbUserId } = await import("@/lib/session-db-user");
    const { db } = await import("@/lib/db");

    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "u1", email: "a@b.com", role: "ADMIN" },
      masquerade: null,
      rolePreview: null,
    } as never);
    vi.mocked(resolveSessionToDbUserId).mockResolvedValueOnce("u1");
    vi.mocked(db.project.findFirst).mockResolvedValueOnce({
      id: "p1",
      deletedAt: null,
      isTestProject: false,
    } as never);
    vi.mocked(db.userProjectFavorite.deleteMany).mockResolvedValueOnce({ count: 1 } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/favorite/route");
    const res = await PATCH(
      new Request("http://localhost/api/projects/p1/favorite", {
        method: "PATCH",
        body: JSON.stringify({ favorite: false }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projectId: "p1", favorite: false });
    expect(db.userProjectFavorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", projectId: "p1" },
    });
  });
});
