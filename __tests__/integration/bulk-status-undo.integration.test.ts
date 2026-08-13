import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/session-db-user", () => ({
  resolveSessionToDbUserId: vi.fn(async (user: { id: string }) => user.id),
}));
vi.mock("@/lib/db", () => ({
  db: {
    projectRow: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    projectSubScopeInstance: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    clearInspection: {
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    inspectionType: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "insp_type_clear" }),
    },
  },
}));
vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));
vi.mock("@/lib/production-project-access", () => ({
  enforceProductionProjectMutation: vi.fn().mockResolvedValue(null),
}));

async function makeRequest(body: unknown) {
  const { POST } = await import("@/app/api/projects/[id]/units/bulk-status/undo/route");
  return POST(
    new Request("http://localhost/api/projects/proj1/units/bulk-status/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj1" }) }
  );
}

describe("POST /api/projects/[id]/units/bulk-status/undo", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";
    const { db } = await import("@/lib/db");
    // Provide default resolved values so .catch() chaining never throws.
    vi.mocked(db.clearInspection.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.clearInspection.createMany).mockResolvedValue({ count: 0 } as never);
  });

  it("returns 422 when both arrays empty", async () => {
    const res = await makeRequest({ revertRows: [], revertInstances: [] });
    expect(res.status).toBe(422);
  });

  it("restores project rows that belong to the project", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    const res = await makeRequest({
      revertRows: [
        {
          id: "row1",
          scopeStage: "STAGING",
          scopeStatus: "IN_PROGRESS",
          inspectionStatus: null,
        },
      ],
      revertInstances: [],
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { restoredRows: number };
    expect(data.restoredRows).toBe(1);
    expect(db.projectRow.update).toHaveBeenCalledWith({
      where: { id: "row1" },
      data: {
        scopeStage: "STAGING",
        scopeStatus: "IN_PROGRESS",
        inspectionStatus: null,
      },
    });
  });

  it("restores sub-scope instances that belong to the project", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectSubScopeInstance.findMany).mockResolvedValueOnce([{ id: "inst1" } as never]);
    vi.mocked(db.projectSubScopeInstance.update).mockResolvedValue({} as never);

    const res = await makeRequest({
      revertRows: [],
      revertInstances: [
        {
          id: "inst1",
          scopeStage: null,
          scopeStatus: "NOT_STARTED",
          inspectionStatus: null,
        },
      ],
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { restoredInstances: number };
    expect(data.restoredInstances).toBe(1);
    expect(db.projectSubScopeInstance.update).toHaveBeenCalledWith({
      where: { id: "inst1" },
      data: {
        scopeStage: null,
        scopeStatus: "NOT_STARTED",
        inspectionStatus: null,
      },
    });
  });

  describe("ClearInspection sync on undo", () => {
    it("soft-deletes active ClearInspection records when reverting to inspectionStatus: null", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      await makeRequest({
        revertRows: [
          { id: "row1", scopeStage: "STAGING", scopeStatus: "IN_PROGRESS", inspectionStatus: null },
        ],
        revertInstances: [],
      });

      expect(db.clearInspection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rowId: { in: ["row1"] }, deletedAt: null },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        })
      );
      expect(db.clearInspection.createMany).not.toHaveBeenCalled();
    });

    it("soft-deletes active ClearInspection records when reverting to READY", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      await makeRequest({
        revertRows: [
          { id: "row1", scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: "READY" },
        ],
        revertInstances: [],
      });

      expect(db.clearInspection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rowId: { in: ["row1"] }, deletedAt: null },
        })
      );
      expect(db.clearInspection.createMany).not.toHaveBeenCalled();
    });

    it("creates a new ClearInspection record when reverting to PASSED", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      await makeRequest({
        revertRows: [
          { id: "row1", scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: "PASSED" },
        ],
        revertInstances: [],
      });

      // First soft-deletes any active records, then re-creates for PASSED
      expect(db.clearInspection.updateMany).toHaveBeenCalled();
      expect(db.clearInspection.createMany).toHaveBeenCalledWith({
        data: [{ rowId: "row1", status: "PASSED", inspectionTypeId: "insp_type_clear", inspectedById: "dev-user" }],
      });
    });

    it("creates a new ClearInspection record when reverting to FAILED", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([{ id: "row1" } as never]);
      vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

      await makeRequest({
        revertRows: [
          { id: "row1", scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: "FAILED" },
        ],
        revertInstances: [],
      });

      expect(db.clearInspection.updateMany).toHaveBeenCalled();
      expect(db.clearInspection.createMany).toHaveBeenCalledWith({
        data: [{ rowId: "row1", status: "FAILED", inspectionTypeId: "insp_type_clear", inspectedById: "dev-user" }],
      });
    });
  });
});
