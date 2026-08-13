import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useScopeInspectionSubmissions } from "@/lib/inspections/useScopeInspectionSubmissions";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

vi.mock("@/lib/inspections/submissionsApi", () => ({
  listByScope: vi.fn(),
}));

import { listByScope } from "@/lib/inspections/submissionsApi";

const twoAreaPass: InspectionSubmission = {
  id: "sub-2ac",
  formId: "form-2ac",
  formNameSnapshot: "2 Area Clear",
  categorySnapshot: "TWO_AREA_CLEAR",
  level: "scope",
  projectId: "proj-1",
  unitId: "unit-1",
  scopeRowId: "row-cab",
  submittedAt: "2026-06-01T12:00:00Z",
  submittedBy: "Alice",
  outcome: "PASS",
  deficiencyCount: 0,
  payload: {},
  source: "FORM",
};

describe("useScopeInspectionSubmissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds from initialSubmissions before listByScope returns", async () => {
    vi.mocked(listByScope).mockImplementation(() => new Promise(() => {}));
    const applyLocalScopeUpdates = vi.fn();

    const { result } = renderHook(() =>
      useScopeInspectionSubmissions("row-cab", {
        initialSubmissions: [twoAreaPass],
        applyLocalScopeUpdates,
      }),
    );

    expect(result.current.hydrated).toBe(true);
    expect(result.current.submissions).toHaveLength(1);
    expect(applyLocalScopeUpdates).toHaveBeenCalledWith({
      gridInspectionStatus: "PASSED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
  });

  it("applies local grid fields for 2AC pass without PATCH when scope is not install-complete", async () => {
    vi.mocked(listByScope).mockResolvedValue([twoAreaPass]);
    const applyLocalScopeUpdates = vi.fn();
    const patchScopeRow = vi.fn().mockResolvedValue(true);

    renderHook(() =>
      useScopeInspectionSubmissions("row-cab", {
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
        inspectionStatus: null,
        applyLocalScopeUpdates,
        patchScopeRow,
      }),
    );

    await waitFor(() => {
      expect(applyLocalScopeUpdates).toHaveBeenCalledWith({
        gridInspectionStatus: "PASSED",
        latestInspectionCategory: "TWO_AREA_CLEAR",
      });
    });

    expect(patchScopeRow).not.toHaveBeenCalled();
  });

  it("PATCHes inspectionStatus when install-complete and DB value is stale", async () => {
    vi.mocked(listByScope).mockResolvedValue([twoAreaPass]);
    const patchScopeRow = vi.fn().mockResolvedValue(true);

    renderHook(() =>
      useScopeInspectionSubmissions("row-cab", {
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        patchScopeRow,
      }),
    );

    await waitFor(() => {
      expect(patchScopeRow).toHaveBeenCalledWith({ inspectionStatus: "PASSED" });
    });
  });
});
