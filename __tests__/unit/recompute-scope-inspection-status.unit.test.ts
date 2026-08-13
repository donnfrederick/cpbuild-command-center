import { describe, it, expect, vi, beforeEach } from "vitest";
import { recomputeScopeInspectionStatusFromSubmissions } from "@/lib/inspections/recompute-scope-inspection-status";

describe("recomputeScopeInspectionStatusFromSubmissions()", () => {
  const projectRow = { update: vi.fn() };
  const inspectionSubmission = { findMany: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets PASSED from latest non-calibration submission", async () => {
    inspectionSubmission.findMany.mockResolvedValue([
      {
        outcome: "PASS",
        source: "FORM",
        templateSnapshot: { category: "FIELD_VERIFICATION" },
        form: { category: "FIELD_VERIFICATION" },
      },
    ]);
    await recomputeScopeInspectionStatusFromSubmissions("row-1", {
      inspectionSubmission,
      projectRow,
    } as never);
    expect(projectRow.update).toHaveBeenCalledWith({
      where: { id: "row-1" },
      data: { inspectionStatus: "PASSED" },
    });
  });

  it("uses form category when legacy stub stores PRE_INSTALL", async () => {
    inspectionSubmission.findMany.mockResolvedValue([
      {
        outcome: "PASS",
        source: "FORM",
        templateSnapshot: { category: "PRE_INSTALL" },
        form: { category: "TWO_AREA_CLEAR" },
      },
    ]);
    await recomputeScopeInspectionStatusFromSubmissions("row-1", {
      inspectionSubmission,
      projectRow,
    } as never);
    expect(projectRow.update).toHaveBeenCalledWith({
      where: { id: "row-1" },
      data: { inspectionStatus: "PASSED" },
    });
  });

  it("clears status when no qualifying submissions remain", async () => {
    inspectionSubmission.findMany.mockResolvedValue([
      {
        outcome: "PASS",
        source: "FORM",
        templateSnapshot: { category: "CALIBRATION_INSPECTION" },
        form: { category: "CLEAR_INSPECTION" },
      },
    ]);
    await recomputeScopeInspectionStatusFromSubmissions("row-1", {
      inspectionSubmission,
      projectRow,
    } as never);
    expect(projectRow.update).toHaveBeenCalledWith({
      where: { id: "row-1" },
      data: { inspectionStatus: null },
    });
  });
});
