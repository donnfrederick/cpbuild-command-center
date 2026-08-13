import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("@/lib/inspections/reconcile-scope-inspection-status", () => ({
  reconcileScopeRowInspectionStatus: vi.fn().mockResolvedValue(0),
}));

import {
  TOSH_VALIDATION_ORPHAN_ID,
  orphanClearInspectionWhere,
  summarizeOrphansByProject,
  purgeOrphanClearInspections,
  type OrphanClearInspectionRow,
} from "../../scripts/purge-orphan-clear-inspections";
import { reconcileScopeRowInspectionStatus } from "@/lib/inspections/reconcile-scope-inspection-status";

function makeDbMock(overrides: {
  orphans?: OrphanClearInspectionRow[];
  updateManyCount?: number;
} = {}): PrismaClient {
  const orphanRows =
    overrides.orphans ??
    ([
      {
        id: TOSH_VALIDATION_ORPHAN_ID,
        rowId: "row-1",
        status: "PASSED",
        projectId: "proj-1",
        projectName: "Jefferson Westchester",
        unifierPid: "1515",
      },
      {
        id: "orphan-2",
        rowId: "row-2",
        status: "FAILED",
        projectId: "proj-1",
        projectName: "Jefferson Westchester",
        unifierPid: "1515",
      },
    ] satisfies OrphanClearInspectionRow[]);

  return {
    clearInspection: {
      findMany: vi.fn().mockResolvedValue(
        orphanRows.map((o) => ({
          id: o.id,
          rowId: o.rowId,
          status: o.status,
          row: {
            projectId: o.projectId,
            project: { unifierPid: o.unifierPid, sourceUnifierPid: null },
          },
        }))
      ),
      updateMany: vi.fn().mockResolvedValue({ count: overrides.updateManyCount ?? orphanRows.length }),
    },
  } as unknown as PrismaClient;
}

describe("orphanClearInspectionWhere()", () => {
  it("requires active rows on non-test projects without submission link", () => {
    expect(orphanClearInspectionWhere()).toEqual({
      deletedAt: null,
      inspectionSubmissionId: null,
      row: {
        project: {
          isTestProject: false,
          deletedAt: null,
        },
      },
    });
  });
});

describe("summarizeOrphansByProject()", () => {
  it("groups orphans by project and sorts by count descending", () => {
    const summary = summarizeOrphansByProject([
      {
        id: "a",
        rowId: "r1",
        status: "PASSED",
        projectId: "p1",
        projectName: "Henley",
        unifierPid: "1515",
      },
      {
        id: "b",
        rowId: "r2",
        status: "PASSED",
        projectId: "p2",
        projectName: "Other",
        unifierPid: "100",
      },
      {
        id: "c",
        rowId: "r3",
        status: "FAILED",
        projectId: "p1",
        projectName: "Henley",
        unifierPid: "1515",
      },
    ]);

    expect(summary).toHaveLength(2);
    expect(summary[0].projectId).toBe("p1");
    expect(summary[0].count).toBe(2);
    expect(summary[1].projectId).toBe("p2");
    expect(summary[1].count).toBe(1);
  });
});

describe("purgeOrphanClearInspections()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dry-run returns counts without mutating", async () => {
    const db = makeDbMock();
    const result = await purgeOrphanClearInspections(db, false);

    expect(result.orphanCount).toBe(2);
    expect(result.softDeleted).toBe(0);
    expect(result.affectedProjects).toBe(1);
    expect(db.clearInspection.updateMany).not.toHaveBeenCalled();
    expect(reconcileScopeRowInspectionStatus).not.toHaveBeenCalled();
  });

  it("execute soft-deletes orphans and reconciles affected scope rows", async () => {
    const db = makeDbMock({ updateManyCount: 2 });
    const result = await purgeOrphanClearInspections(db, true);

    expect(result.softDeleted).toBe(2);
    expect(db.clearInspection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: orphanClearInspectionWhere(),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
    expect(reconcileScopeRowInspectionStatus).toHaveBeenCalledWith(["row-1", "row-2"], db);
  });

  it("execute with zero orphans skips update and reconcile", async () => {
    const db = makeDbMock({ orphans: [] });
    const result = await purgeOrphanClearInspections(db, true);

    expect(result.orphanCount).toBe(0);
    expect(result.softDeleted).toBe(0);
    expect(db.clearInspection.updateMany).not.toHaveBeenCalled();
    expect(reconcileScopeRowInspectionStatus).not.toHaveBeenCalled();
  });
});
