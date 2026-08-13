import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    projectRow: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    inspectionSubmission: {
      count: vi.fn(),
    },
    clearInspection: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe("reconcileScopeRowInspectionStatus()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears PASSED when no submissions or clear inspections remain", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({ inspectionStatus: "PASSED" } as never);
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(0);
    vi.mocked(db.clearInspection.count).mockResolvedValue(0);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    const { reconcileScopeRowInspectionStatus } = await import(
      "@/lib/inspections/reconcile-scope-inspection-status"
    );
    const cleared = await reconcileScopeRowInspectionStatus(["row-1"]);

    expect(cleared).toBe(1);
    expect(db.projectRow.update).toHaveBeenCalledWith({
      where: { id: "row-1" },
      data: { inspectionStatus: null },
    });
    expect(db.clearInspection.count).toHaveBeenCalledWith({
      where: { rowId: "row-1", deletedAt: null },
    });
  });

  it("preserves READY when no submissions exist", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({ inspectionStatus: "READY" } as never);

    const { reconcileScopeRowInspectionStatus } = await import(
      "@/lib/inspections/reconcile-scope-inspection-status"
    );
    const cleared = await reconcileScopeRowInspectionStatus(["row-1"]);

    expect(cleared).toBe(0);
    expect(db.projectRow.update).not.toHaveBeenCalled();
  });

  it("preserves PASSED when a submission still exists", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findUnique).mockResolvedValue({ inspectionStatus: "PASSED" } as never);
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(1);
    vi.mocked(db.clearInspection.count).mockResolvedValue(0);

    const { reconcileScopeRowInspectionStatus } = await import(
      "@/lib/inspections/reconcile-scope-inspection-status"
    );
    const cleared = await reconcileScopeRowInspectionStatus(["row-1"]);

    expect(cleared).toBe(0);
    expect(db.projectRow.update).not.toHaveBeenCalled();
  });
});

describe("reconcileProjectInspectionStatuses()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hard-deletes only active orphan clears, not soft-deleted history", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.clearInspection.deleteMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([] as never);

    const { reconcileProjectInspectionStatuses } = await import(
      "@/lib/inspections/reconcile-scope-inspection-status"
    );
    const result = await reconcileProjectInspectionStatuses("proj-1");

    expect(result.deletedOrphanClears).toBe(2);
    expect(db.clearInspection.deleteMany).toHaveBeenCalledWith({
      where: {
        row: { projectId: "proj-1" },
        inspectionSubmissionId: null,
        deletedAt: null,
      },
    });
  });
});
