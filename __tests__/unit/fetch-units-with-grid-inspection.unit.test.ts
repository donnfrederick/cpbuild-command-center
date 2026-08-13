import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchUnitsWithGridInspection } from "@/lib/inspections/fetch-units-with-grid-inspection";

vi.mock("@/lib/inspections/submissionsApi", () => ({
  listByProject: vi.fn(),
}));

import { listByProject } from "@/lib/inspections/submissionsApi";

describe("fetchUnitsWithGridInspection()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          units: [{ id: "row-cab", gridInspectionStatus: null, latestInspectionCategory: null }],
        }),
      }),
    );
  });

  it("merges project submissions into unit rows for grid loads", async () => {
    vi.mocked(listByProject).mockResolvedValue([
      {
        id: "sub-1",
        formId: "f1",
        formNameSnapshot: "Clear",
        categorySnapshot: "CLEAR_INSPECTION",
        level: "scope",
        projectId: "p1",
        unitId: "u1",
        scopeRowId: "row-cab",
        submittedAt: "2026-06-01T12:00:00Z",
        submittedBy: "Alice",
        outcome: "PASS",
        deficiencyCount: 0,
        payload: {},
        source: "FORM",
      },
    ]);

    const { page, submissions } = await fetchUnitsWithGridInspection(
      "p1",
      "/api/projects/p1/units",
      true,
    );

    expect(submissions).toHaveLength(1);
    expect(page.units[0]).toMatchObject({
      gridInspectionStatus: "PASSED",
      latestInspectionCategory: "CLEAR_INSPECTION",
    });
  });

  it("merges pending TWO_AREA_CLEAR fail onto unit rows for grid loads", async () => {
    vi.mocked(listByProject).mockResolvedValue([
      {
        id: "local-2ac",
        formId: "form-2ac",
        formNameSnapshot: "2 Area Clear",
        categorySnapshot: "TWO_AREA_CLEAR",
        formCategory: "TWO_AREA_CLEAR",
        level: "scope",
        projectId: "p1",
        unitId: "1B|4|S238",
        scopeRowId: "row-til",
        submittedAt: "2026-06-12T21:00:00.000Z",
        submittedBy: "Inspector",
        outcome: "FAIL",
        deficiencyCount: 1,
        payload: {},
        source: "FORM",
        _pendingSync: true,
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          units: [{ id: "row-til", gridInspectionStatus: null, latestInspectionCategory: null }],
        }),
      }),
    );

    const { page } = await fetchUnitsWithGridInspection(
      "p1",
      "/api/projects/p1/units",
      true,
    );

    expect(page.units[0]).toMatchObject({
      gridInspectionStatus: "FAILED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
  });

  it("returns server-enriched units when listByProject fails", async () => {
    vi.mocked(listByProject).mockRejectedValue(new Error("network"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          units: [{
            id: "row-cab",
            gridInspectionStatus: "FAILED",
            latestInspectionCategory: "TWO_AREA_CLEAR",
          }],
        }),
      }),
    );

    const { page, submissions } = await fetchUnitsWithGridInspection(
      "p1",
      "/api/projects/p1/units",
      true,
    );

    expect(submissions).toEqual([]);
    expect(page.units[0]).toMatchObject({
      id: "row-cab",
      gridInspectionStatus: "FAILED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
  });
});
