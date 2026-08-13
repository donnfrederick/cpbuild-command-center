import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    project: { findFirst: vi.fn() },
    testSeedBatch: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/test-data-seed/seed-test-data", () => ({
  seedTestData: vi.fn(),
  removeTestDataBatch: vi.fn(),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
  resolveActorName: vi.fn().mockResolvedValue("Admin"),
}));

import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { seedTestData, removeTestDataBatch } from "@/lib/test-data-seed/seed-test-data";

const projectParams = (id: string) => ({ params: Promise.resolve({ id }) });
const batchParams = (id: string, batchId: string) => ({
  params: Promise.resolve({ id, batchId }),
});

describe("POST /api/projects/[id]/seed-test-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/projects/[id]/seed-test-data/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ["u1"], issues: { count: 1 } }),
      }),
      projectParams("p1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);
    vi.mocked(db.project.findFirst).mockResolvedValue({ isTestProject: true } as never);
    const { POST } = await import("@/app/api/projects/[id]/seed-test-data/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ["u1"], issues: { count: 1 } }),
      }),
      projectParams("p1")
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 on live (non-test) project", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findFirst).mockResolvedValue({ isTestProject: false } as never);
    const { POST } = await import("@/app/api/projects/[id]/seed-test-data/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ["u1"], issues: { count: 1 } }),
      }),
      projectParams("live-1")
    );
    expect(res.status).toBe(403);
  });

  it("returns 201 on happy path", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findFirst).mockResolvedValue({ isTestProject: true } as never);
    vi.mocked(db.user.findMany).mockResolvedValue([{ id: "u1" }] as never);
    vi.mocked(seedTestData).mockResolvedValue({
      batchId: "batch-1",
      counts: { issues: 2, observations: 1, clearInspections: 0, calibrations: 0, comments: 0, activityLogs: 1 },
    });

    const { POST } = await import("@/app/api/projects/[id]/seed-test-data/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: ["u1"],
          issues: { count: 2 },
          observations: { count: 1 },
        }),
      }),
      projectParams("test-1")
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.batchId).toBe("batch-1");
    expect(body.counts.issues).toBe(2);
  });
});

describe("GET /api/projects/[id]/test-seed-batches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns batches for admin on test project", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findFirst).mockResolvedValue({ isTestProject: true } as never);
    vi.mocked(db.testSeedBatch.findMany).mockResolvedValue([
      {
        id: "b1",
        createdAt: new Date("2026-01-01"),
        counts: { issues: 1, observations: 0, clearInspections: 0, calibrations: 0, comments: 0, activityLogs: 0 },
        config: { issues: { count: 1 }, dateRangeDays: 90 },
        createdBy: { name: "Admin", email: "admin@test.com" },
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/test-seed-batches/route");
    const res = await GET(new Request("http://localhost"), projectParams("test-1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.batches).toHaveLength(1);
    expect(body.batches[0].id).toBe("b1");
  });
});

describe("DELETE /api/projects/[id]/test-seed-batches/[batchId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes batch for admin on test project", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findFirst).mockResolvedValue({ isTestProject: true } as never);
    vi.mocked(removeTestDataBatch).mockResolvedValue({
      issues: 2,
      observations: 0,
      clearInspections: 0,
      calibrations: 0,
      comments: 0,
      activityLogs: 0,
    });

    const { DELETE } = await import("@/app/api/projects/[id]/test-seed-batches/[batchId]/route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), batchParams("test-1", "b1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.batchId).toBe("b1");
    expect(removeTestDataBatch).toHaveBeenCalledWith("test-1", "b1", "admin-1");
  });
});
