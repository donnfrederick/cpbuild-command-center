import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    project: { findFirst: vi.fn() },
    projectIssue: { count: vi.fn() },
    projectRow: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    projectSubScopeInstance: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/sub-scopes", () => ({
  hasSubScopeInstances: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
  resolveActorName: vi.fn().mockResolvedValue("Test User"),
}));

async function makeRequest(body: unknown) {
  const { POST } = await import("@/app/api/projects/[id]/units/bulk-status/route");
  return POST(
    new Request("http://localhost/api/projects/proj1/units/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj1" }) }
  );
}

describe("POST /api/projects/[id]/units/bulk-status", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "proj1", deletedAt: null, isTestProject: false } as never);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0);
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const res = await makeRequest({ rowIds: ["row1"], scopeStatus: "IN_PROGRESS" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_UNIT_STATUS", async () => {
    process.env.DEV_USER_ROLE = "MEMBER";
    const res = await makeRequest({ rowIds: ["row1"], scopeStatus: "IN_PROGRESS" });
    expect(res.status).toBe(403);
  });

  it("returns 422 when both rowIds and subScopeInstanceIds are empty", async () => {
    const res = await makeRequest({ rowIds: [], subScopeInstanceIds: [], scopeStatus: "IN_PROGRESS" });
    expect(res.status).toBe(422);
  });

  it("accepts request with only subScopeInstanceIds (no rowIds) — Unifier-style null projectManagerName", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectSubScopeInstance.findMany).mockResolvedValueOnce([{ id: "inst1" } as never]);
    vi.mocked(db.projectSubScopeInstance.update).mockResolvedValue({} as never);

    const res = await makeRequest({
      rowIds: [],
      subScopeInstanceIds: ["inst1"],
      scopeStatus: "IN_PROGRESS",
      scopeStage: "INSTALL",
    });

    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number };
    expect(data.updated).toBe(1);
    expect(db.projectSubScopeInstance.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.projectSubScopeInstance.update).mock.calls[0][0]).toMatchObject({
      where: { id: "inst1" },
      data: { scopeStage: "INSTALL", scopeStatus: "IN_PROGRESS", inspectionStatus: null },
    });
  });

  it("returns 422 when scopeStatus is invalid", async () => {
    const res = await makeRequest({ rowIds: ["row1"], scopeStatus: "GIBBERISH" });
    expect(res.status).toBe(422);
  });

  it("updates rows that belong to the project and have no sub-scopes", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      { id: "row1" } as never,
      { id: "row2" } as never,
    ]);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    const res = await makeRequest({
      rowIds: ["row1", "row2"],
      scopeStage: "INSTALL",
      scopeStatus: "IN_PROGRESS",
    });

    expect(res.status).toBe(200);
    const data = await res.json() as {
      updated: number;
      skipped: number;
      appliedRowIds: string[];
      appliedSubScopeInstanceIds: string[];
    };
    expect(data.updated).toBe(2);
    expect(data.skipped).toBe(0);
    expect(data.appliedRowIds).toEqual(["row1", "row2"]);
    expect(data.appliedSubScopeInstanceIds).toEqual([]);
    expect(db.projectRow.update).toHaveBeenCalledTimes(2);
  });

  it("does not write activity when skipActivityLog is true", async () => {
    const { logActivity } = await import("@/lib/activity-logger");
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    const res = await makeRequest({
      rowIds: ["row1"],
      scopeStatus: "IN_PROGRESS",
      skipActivityLog: true,
    });

    expect(res.status).toBe(200);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("skips rows that have sub-scope instances", async () => {
    const { db } = await import("@/lib/db");
    const { hasSubScopeInstances } = await import("@/lib/sub-scopes");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      { id: "row1" } as never,
      { id: "row2" } as never,
    ]);
    // row1 has sub-scopes → skip; row2 does not → update
    vi.mocked(hasSubScopeInstances)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    const res = await makeRequest({ rowIds: ["row1", "row2"], scopeStatus: "COMPLETE" });

    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number; skipped: number };
    expect(data.updated).toBe(1);
    expect(data.skipped).toBe(1);
    // Only row2 was updated
    expect(db.projectRow.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.projectRow.update).mock.calls[0][0]).toMatchObject({
      where: { id: "row2" },
    });
  });

  it("silently ignores row IDs that don't belong to the project", async () => {
    const { db } = await import("@/lib/db");
    // Only row1 is returned (row2 belongs to a different project)
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    const res = await makeRequest({ rowIds: ["row1", "row-other-project"], scopeStatus: "NOT_STARTED" });

    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number };
    expect(data.updated).toBe(1);
    expect(db.projectRow.update).toHaveBeenCalledTimes(1);
  });

  it("clears inspectionStatus when not moving to INSTALL+COMPLETE", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    await makeRequest({ rowIds: ["row1"], scopeStage: "STAGING", scopeStatus: "IN_PROGRESS" });

    expect(vi.mocked(db.projectRow.update).mock.calls[0][0]).toMatchObject({
      data: { scopeStage: "STAGING", scopeStatus: "IN_PROGRESS", inspectionStatus: null },
    });
  });

  it("does NOT clear inspectionStatus when moving to INSTALL+COMPLETE", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "row1",
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
      } as never,
    ]);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    await makeRequest({ rowIds: ["row1"], scopeStage: "INSTALL", scopeStatus: "COMPLETE" });

    const updateCall = vi.mocked(db.projectRow.update).mock.calls[0][0];
    expect(updateCall).toMatchObject({
      data: { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
    });
    // inspectionStatus should NOT be in the update data
    expect((updateCall as { data: Record<string, unknown> }).data).not.toHaveProperty("inspectionStatus");
  });

  it("skips INSTALL+COMPLETE and lists blockedByBlockingIssue when an open blocking issue tags the row (FB-0027)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "row1",
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
      } as never,
    ]);
    vi.mocked(db.projectIssue.count).mockResolvedValueOnce(1);

    const res = await makeRequest({
      rowIds: ["row1"],
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
    });

    expect(res.status).toBe(200);
    const data = await res.json() as {
      updated: number;
      blockedByBlockingIssue: string[];
    };
    expect(data.updated).toBe(0);
    expect(data.blockedByBlockingIssue).toEqual(["row1"]);
    expect(db.projectRow.update).not.toHaveBeenCalled();
  });

  it("omits scopeStage from update when not provided (preserves existing stage)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    await makeRequest({ rowIds: ["row1"], scopeStatus: "NOT_STARTED" });

    const updateCall = vi.mocked(db.projectRow.update).mock.calls[0][0];
    expect((updateCall as { data: Record<string, unknown> }).data).not.toHaveProperty("scopeStage");
  });
});
