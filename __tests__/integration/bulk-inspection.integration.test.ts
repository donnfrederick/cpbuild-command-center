import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/session-db-user", () => ({
  resolveSessionToDbUserId: vi.fn(async (user: { id: string }) => user.id),
}));
vi.mock("@/lib/db", () => ({
  db: {
    project: { findFirst: vi.fn() },
    projectRow: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    projectSubScopeInstance: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    clearInspection: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    inspectionType: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "insp_type_clear" }),
    },
    inspectionSubmission: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
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
  const { POST } = await import("@/app/api/projects/[id]/units/bulk-inspection/route");
  return POST(
    new Request("http://localhost/api/projects/proj1/units/bulk-inspection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj1" }) }
  );
}

describe("POST /api/projects/[id]/units/bulk-inspection", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({
      id: "proj1", deletedAt: null, isTestProject: false,
    } as never);
    // Provide default resolved values so .catch() chaining never throws.
    vi.mocked(db.clearInspection.create).mockResolvedValue({ id: "clear-1" } as never);
    vi.mocked(db.clearInspection.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([] as never);
    vi.mocked(db.inspectionSubmission.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({ id: "sub-1" } as never);
    vi.mocked(db.$transaction).mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const res = await makeRequest({ rowIds: ["row1"], inspectionStatus: "READY" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_UNIT_STATUS", async () => {
    process.env.DEV_USER_ROLE = "MEMBER";
    const res = await makeRequest({ rowIds: ["row1"], inspectionStatus: "READY" });
    expect(res.status).toBe(403);
  });

  it("returns 422 when both rowIds and subScopeInstanceIds are empty", async () => {
    const res = await makeRequest({ rowIds: [], subScopeInstanceIds: [], inspectionStatus: "READY" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when inspectionStatus is an invalid value", async () => {
    const res = await makeRequest({ rowIds: ["row1"], inspectionStatus: "STARTED" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when inspectionStatus is missing entirely", async () => {
    const res = await makeRequest({ rowIds: ["row1"] });
    expect(res.status).toBe(422);
  });

  describe("READY — forces INSTALL + COMPLETE + inspectionStatus", () => {
    it("updates a parent row to INSTALL/COMPLETE/READY", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      const res = await makeRequest({ rowIds: ["row1"], inspectionStatus: "READY" });

      expect(res.status).toBe(200);
      const data = await res.json() as { updated: number; appliedRowIds: string[] };
      expect(data.updated).toBe(1);
      expect(data.appliedRowIds).toEqual(["row1"]);
      expect(vi.mocked(db.projectRow.update).mock.calls[0][0]).toMatchObject({
        where: { id: "row1" },
        data: { scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: "READY" },
      });
    });

    it("soft-deletes active ClearInspection records (not creates) for READY", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      await makeRequest({ rowIds: ["row1"], inspectionStatus: "READY" });

      expect(db.clearInspection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rowId: { in: ["row1"] }, deletedAt: null },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        })
      );
      expect(db.clearInspection.create).not.toHaveBeenCalled();
      expect(db.inspectionSubmission.deleteMany).toHaveBeenCalledWith({
        where: { scopeRowId: { in: ["row1"] }, source: "BACKFILL" },
      });
    });

    it("updates a sub-scope instance to INSTALL/COMPLETE/READY", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectSubScopeInstance.findMany).mockResolvedValueOnce([
        { id: "inst1", rowId: "parentRow1" } as never,
      ]);
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "parentRow1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);
      vi.mocked(db.projectSubScopeInstance.update).mockResolvedValue({} as never);

      const res = await makeRequest({
        rowIds: [],
        subScopeInstanceIds: ["inst1"],
        inspectionStatus: "READY",
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { updated: number; appliedSubScopeInstanceIds: string[] };
      // 1 parent row (synthesised from inst1) + 1 instance = 2 total updates
      expect(data.updated).toBe(2);
      expect(data.appliedSubScopeInstanceIds).toEqual(["inst1"]);
      expect(vi.mocked(db.projectSubScopeInstance.update).mock.calls[0][0]).toMatchObject({
        where: { id: "inst1" },
        data: { scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: "READY" },
      });
    });
  });

  describe("PASSED — forces INSTALL + COMPLETE + inspectionStatus", () => {
    it("writes scopeStage=INSTALL, scopeStatus=COMPLETE, inspectionStatus=PASSED", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      const res = await makeRequest({ rowIds: ["row1"], inspectionStatus: "PASSED" });

      expect(res.status).toBe(200);
      expect(vi.mocked(db.projectRow.update).mock.calls[0][0]).toMatchObject({
        data: { scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: "PASSED" },
      });
    });

    it("creates linked BACKFILL submission and ClearInspection records for PASSED", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      await makeRequest({ rowIds: ["row1"], inspectionStatus: "PASSED" });

      expect(db.$transaction).toHaveBeenCalled();
      expect(db.clearInspection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rowId: { in: ["row1"] }, deletedAt: null },
        })
      );
      expect(db.inspectionSubmission.deleteMany).toHaveBeenCalledWith({
        where: { scopeRowId: { in: ["row1"] }, source: "BACKFILL" },
      });
      expect(db.inspectionSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: "BACKFILL",
          scopeRowId: "row1",
          outcome: "PASS",
          clearInspection: {
            create: {
              rowId: "row1",
              status: "PASSED",
              inspectionTypeId: "insp_type_clear",
              inspectedById: "dev-user",
            },
          },
        }),
      });
      expect(db.clearInspection.create).not.toHaveBeenCalled();
    });
  });

  describe("FAILED — forces INSTALL + COMPLETE + inspectionStatus", () => {
    it("writes scopeStage=INSTALL, scopeStatus=COMPLETE, inspectionStatus=FAILED", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      const res = await makeRequest({ rowIds: ["row1"], inspectionStatus: "FAILED" });

      expect(res.status).toBe(200);
      expect(vi.mocked(db.projectRow.update).mock.calls[0][0]).toMatchObject({
        data: { scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: "FAILED" },
      });
    });

    it("creates linked BACKFILL submission and ClearInspection records for FAILED", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      await makeRequest({ rowIds: ["row1"], inspectionStatus: "FAILED" });

      expect(db.inspectionSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: "BACKFILL",
          outcome: "FAIL",
          clearInspection: {
            create: {
              rowId: "row1",
              status: "FAILED",
              inspectionTypeId: "insp_type_clear",
              inspectedById: "dev-user",
            },
          },
        }),
      });
      expect(db.clearInspection.create).not.toHaveBeenCalled();
    });
  });

  describe("null (Clear) — clears inspectionStatus only, no stage/status change", () => {
    it("writes only inspectionStatus: null to a parent row", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      const res = await makeRequest({ rowIds: ["row1"], inspectionStatus: null });

      expect(res.status).toBe(200);
      const data = await res.json() as { updated: number };
      expect(data.updated).toBe(1);
      const updateCall = vi.mocked(db.projectRow.update).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateCall.data.inspectionStatus).toBeNull();
      expect(updateCall.data.scopeStage).toBeUndefined();
      expect(updateCall.data.scopeStatus).toBeUndefined();
    });

    it("soft-deletes active ClearInspection records when clearing", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      await makeRequest({ rowIds: ["row1"], inspectionStatus: null });

      expect(db.clearInspection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rowId: { in: ["row1"] }, deletedAt: null },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        })
      );
      expect(db.clearInspection.create).not.toHaveBeenCalled();
      expect(db.inspectionSubmission.deleteMany).toHaveBeenCalledWith({
        where: { scopeRowId: { in: ["row1"] }, source: "BACKFILL" },
      });
    });

    it("writes only inspectionStatus: null to a sub-scope instance", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectSubScopeInstance.findMany).mockResolvedValueOnce([
        { id: "inst1", rowId: "parentRow1" } as never,
      ]);
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "parentRow1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);
      vi.mocked(db.projectSubScopeInstance.update).mockResolvedValue({} as never);

      const res = await makeRequest({
        rowIds: [],
        subScopeInstanceIds: ["inst1"],
        inspectionStatus: null,
      });

      expect(res.status).toBe(200);
      const updateCall = vi.mocked(db.projectSubScopeInstance.update).mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateCall.data.inspectionStatus).toBeNull();
      expect(updateCall.data.scopeStage).toBeUndefined();
      expect(updateCall.data.scopeStatus).toBeUndefined();
    });
  });

  // NOTE: Earlier versions had a hasSubScopeInstances guard that skipped parent rows
  // when sub-scope instances existed. That guard was removed in the bulk-inspection
  // fix — all specified rows are always updated directly.
  it("does NOT skip rows — all rows are updated regardless of sub-scope configuration", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    const res = await makeRequest({ rowIds: ["row1"], inspectionStatus: "READY" });

    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number; skipped: number };
    expect(data.updated).toBe(1);
    expect(data.skipped).toBe(0);
    expect(db.projectRow.update).toHaveBeenCalledOnce();
  });

  it("activity-log-only mode: accepts empty rowIds when appliedRowIds is non-empty", async () => {
    const res = await makeRequest({
      rowIds: [],
      subScopeInstanceIds: [],
      inspectionStatus: "PASSED",
      skipActivityLog: false,
      appliedRowIds: ["row1", "row2"],
      appliedSubScopeInstanceIds: [],
    });

    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number };
    expect(data.updated).toBe(0);
  });

  it("silently ignores rowIds that do not belong to the project", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([]); // none owned

    const res = await makeRequest({ rowIds: ["foreign-row"], inspectionStatus: "READY" });

    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number };
    expect(data.updated).toBe(0);
    expect(db.projectRow.update).not.toHaveBeenCalled();
  });

  it("returns appliedRowIds and appliedSubScopeInstanceIds in the response", async () => {
    const { db } = await import("@/lib/db");
    // Both rowIds and subScopeInstanceIds point to the same parent row (row1).
    // The route deduplicates via allAffectedRowIds so only one row update fires.
    vi.mocked(db.projectSubScopeInstance.findMany).mockResolvedValueOnce([
      { id: "inst1", rowId: "row1" } as never,
    ]);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);
    vi.mocked(db.projectSubScopeInstance.update).mockResolvedValue({} as never);

    const res = await makeRequest({
      rowIds: ["row1"],
      subScopeInstanceIds: ["inst1"],
      inspectionStatus: "PASSED",
      skipActivityLog: true,
    });

    expect(res.status).toBe(200);
    const data = await res.json() as { updated: number; appliedRowIds: string[]; appliedSubScopeInstanceIds: string[] };
    // 1 row (row1) + 1 instance (inst1) = 2 total updates
    expect(data.updated).toBe(2);
    expect(data.appliedRowIds).toEqual(["row1"]);
    expect(data.appliedSubScopeInstanceIds).toEqual(["inst1"]);
  });
});
