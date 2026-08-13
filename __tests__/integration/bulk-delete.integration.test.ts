import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    project: { findUnique: vi.fn(), findFirst: vi.fn() },
    projectRow: { deleteMany: vi.fn(), findMany: vi.fn() },
  },
}));

describe("POST /api/projects/[id]/units/bulk-delete", () => {
  const params = { params: Promise.resolve({ id: "proj_1" }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    process.env.NODE_ENV = "test";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "proj_1", deletedAt: null, isTestProject: false } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([] as never);
  });

  async function callRoute(body: unknown, projectId = "proj_1") {
    const { POST } = await import("@/app/api/projects/[id]/units/bulk-delete/route");
    return POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: projectId }) }
    );
  }

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const res = await callRoute({ rowIds: ["r1"] });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks MANAGE_PROJECTS permission", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const res = await callRoute({ rowIds: ["r1"] });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 404 when project does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findFirst).mockResolvedValueOnce(null as never);

    const res = await callRoute({ rowIds: ["r1"] });
    expect(res.status).toBe(404);
  });

  it("returns 422 when rowIds is empty", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const res = await callRoute({ rowIds: [] });
    expect(res.status).toBe(422);
  });

  it("returns 422 when rowIds exceeds 500 items", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const res = await callRoute({ rowIds: Array.from({ length: 501 }, (_, i) => `r${i}`) });
    expect(res.status).toBe(422);
  });

  it("returns 400 when body is invalid JSON", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/bulk-delete/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: "not-json",
        headers: { "Content-Type": "application/json" },
      }),
      params
    );
    expect(res.status).toBe(400);
  });

  it("deletes rows and returns count on success", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.deleteMany).mockResolvedValueOnce({ count: 3 } as never);

    const res = await callRoute({ rowIds: ["r1", "r2", "r3"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(3);
    expect(vi.mocked(db.projectRow.deleteMany)).toHaveBeenCalledWith({
      where: { id: { in: ["r1", "r2", "r3"] }, projectId: "proj_1" },
    });
  });

  it("bypasses auth in dev mode and allows ADMIN bypass session", async () => {
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.NODE_ENV = "test";

    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.deleteMany).mockResolvedValueOnce({ count: 1 } as never);

    const res = await callRoute({ rowIds: ["r1"] });
    expect(res.status).toBe(200);
  });
});
