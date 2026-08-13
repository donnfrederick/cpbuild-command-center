import { describe, it, expect, vi } from "vitest";
import { getOverwriteBlockStatus } from "@/lib/units-overwrite-guard";

function makeDb(counts: {
  submissions?: number;
  clearInspections?: number;
  rowsWithProgress?: number;
  issues?: number;
  observations?: number;
}) {
  return {
    inspectionSubmission: {
      count: vi.fn().mockResolvedValue(counts.submissions ?? 0),
    },
    clearInspection: {
      count: vi.fn().mockResolvedValue(counts.clearInspections ?? 0),
    },
    projectRow: {
      count: vi.fn().mockResolvedValue(counts.rowsWithProgress ?? 0),
    },
    projectIssue: {
      count: vi.fn().mockResolvedValue(counts.issues ?? 0),
    },
    projectObservation: {
      count: vi.fn().mockResolvedValue(counts.observations ?? 0),
    },
  };
}

describe("getOverwriteBlockStatus", () => {
  it("returns blocked=false when all counts are zero", async () => {
    const db = makeDb({});
    const status = await getOverwriteBlockStatus(db as never, "p1");
    expect(status.blocked).toBe(false);
    expect(status.counts).toEqual({
      submissions: 0,
      clearInspections: 0,
      rowsWithProgress: 0,
      issues: 0,
      observations: 0,
    });
  });

  it("returns blocked=true when any blocking signal is non-zero", async () => {
    const db = makeDb({ issues: 2 });
    const status = await getOverwriteBlockStatus(db as never, "p1");
    expect(status.blocked).toBe(true);
    expect(status.counts.issues).toBe(2);
  });

  it("queries clear inspections via project row relation", async () => {
    const db = makeDb({});
    await getOverwriteBlockStatus(db as never, "p1");
    expect(db.clearInspection.count).toHaveBeenCalledWith({
      where: { row: { projectId: "p1" } },
    });
  });

  it("queries projectRow progress fields with OR filter", async () => {
    const db = makeDb({ rowsWithProgress: 1 });
    await getOverwriteBlockStatus(db as never, "p1");
    expect(db.projectRow.count).toHaveBeenCalledWith({
      where: {
        projectId: "p1",
        OR: [
          { scopeStage: { not: null } },
          { scopeStatus: { not: null } },
          { inspectionStatus: { not: null } },
        ],
      },
    });
  });
});
