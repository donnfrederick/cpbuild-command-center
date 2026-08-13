import { describe, it, expect } from "vitest";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import {
  buildScopeGridInspectionMapFromSortedRows,
  clearLocalScopeInspectionUpdates,
  deriveScopeGridInspectionFromSubmissions,
  localScopeUpdatesFromBackfillOutcome,
  localScopeUpdatesFromSubmission,
  mergeGridInspectionFromSubmissions,
} from "@/lib/inspections/scope-grid-inspection-display";

function submission(
  partial: Partial<InspectionSubmission> & Pick<InspectionSubmission, "id" | "categorySnapshot">,
): InspectionSubmission {
  return {
    formId: "form-1",
    formNameSnapshot: "Test",
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
    ...partial,
  };
}

describe("deriveScopeGridInspectionFromSubmissions", () => {
  it("derives PASSED + TWO_AREA_CLEAR from newest authoritative submission", () => {
    const preInstall = submission({
      id: "sub-pre",
      categorySnapshot: "PRE_INSTALL",
      submittedAt: "2026-06-01T10:00:00Z",
    });
    const twoArea = submission({
      id: "sub-2ac",
      categorySnapshot: "TWO_AREA_CLEAR",
      submittedAt: "2026-06-01T12:00:00Z",
    });

    const derived = deriveScopeGridInspectionFromSubmissions([twoArea, preInstall]);
    expect(derived).toEqual({
      gridInspectionStatus: "PASSED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
  });

  it("returns null when only non-authoritative categories exist", () => {
    const preInstall = submission({ id: "sub-pre", categorySnapshot: "PRE_INSTALL" });
    expect(deriveScopeGridInspectionFromSubmissions([preInstall])).toBeNull();
  });

  it("derives TWO_AREA_CLEAR fail from legacy PRE_INSTALL categorySnapshot when template is hydrated", () => {
    const legacyFail = submission({
      id: "sub-2ac-fail",
      categorySnapshot: "PRE_INSTALL",
      outcome: "FAIL",
      templateSnapshot: {
        category: "TWO_AREA_CLEAR",
        name: "2 Area Clear",
        sections: [{ id: "s1", title: "S", questions: [] }],
      },
    });

    expect(deriveScopeGridInspectionFromSubmissions([legacyFail])).toEqual({
      gridInspectionStatus: "FAILED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
  });
});

describe("buildScopeGridInspectionMapFromSortedRows", () => {
  it("maps newest authoritative row per scopeRowId", () => {
    const map = buildScopeGridInspectionMapFromSortedRows([
      {
        scopeRowId: "row-cab",
        outcome: "PASS",
        source: "FORM",
        category: "TWO_AREA_CLEAR",
      },
      {
        scopeRowId: "row-top",
        outcome: "FAIL",
        source: "FORM",
        category: "CLEAR_INSPECTION",
      },
    ]);

    expect(map.get("row-cab")).toEqual({
      gridInspectionStatus: "PASSED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
    expect(map.get("row-top")).toEqual({
      gridInspectionStatus: "FAILED",
      latestInspectionCategory: "CLEAR_INSPECTION",
    });
  });
});

describe("mergeGridInspectionFromSubmissions", () => {
  it("overlays grid shields onto unit rows from project submissions", () => {
    const rows = [
      {
        id: "row-cab",
        gridInspectionStatus: null,
        latestInspectionCategory: null,
      },
      {
        id: "row-other",
        gridInspectionStatus: null,
        latestInspectionCategory: null,
      },
    ];
    const merged = mergeGridInspectionFromSubmissions(rows, [
      submission({
        id: "sub-2ac",
        scopeRowId: "row-cab",
        categorySnapshot: "TWO_AREA_CLEAR",
        outcome: "PASS",
      }),
    ]);
    expect(merged[0]).toMatchObject({
      gridInspectionStatus: "PASSED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
    expect(merged[1].gridInspectionStatus).toBeNull();
  });

  it("resolves legacy PRE_INSTALL categorySnapshot via hydrated template category", () => {
    const merged = mergeGridInspectionFromSubmissions(
      [{ id: "row-cab", gridInspectionStatus: null, latestInspectionCategory: null }],
      [
        submission({
          id: "sub-2ac-fail",
          scopeRowId: "row-cab",
          categorySnapshot: "PRE_INSTALL",
          outcome: "FAIL",
          templateSnapshot: { category: "TWO_AREA_CLEAR", name: "2AC", sections: [] },
        }),
      ],
    );
    expect(merged[0]).toMatchObject({
      gridInspectionStatus: "FAILED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
  });

  it("derives grid shield from formCategory when legacy full template still stores PRE_INSTALL", () => {
    const merged = mergeGridInspectionFromSubmissions(
      [{ id: "row-til", gridInspectionStatus: null, latestInspectionCategory: null }],
      [
        submission({
          id: "sub-2ac-fail",
          scopeRowId: "row-til",
          categorySnapshot: "PRE_INSTALL",
          formCategory: "TWO_AREA_CLEAR",
          outcome: "FAIL",
          templateSnapshot: {
            category: "PRE_INSTALL",
            name: "Legacy",
            sections: [{ id: "s1", title: "S", questions: [] }],
          },
        }),
      ],
    );
    expect(merged[0]).toMatchObject({
      gridInspectionStatus: "FAILED",
      latestInspectionCategory: "TWO_AREA_CLEAR",
    });
  });

  it("merges latestCalibrationOutcome without overwriting clear grid status", () => {
    const merged = mergeGridInspectionFromSubmissions(
      [{ id: "row-til", gridInspectionStatus: null, latestInspectionCategory: null }],
      [
        submission({
          id: "sub-cal-fail",
          scopeRowId: "row-til",
          categorySnapshot: "CALIBRATION_INSPECTION",
          templateSnapshot: { category: "CALIBRATION_INSPECTION" },
          outcome: "FAIL",
          submittedAt: "2026-06-02T12:00:00Z",
        }),
        submission({
          id: "sub-clear-pass",
          scopeRowId: "row-til",
          categorySnapshot: "CLEAR_INSPECTION",
          outcome: "PASS",
          submittedAt: "2026-06-01T12:00:00Z",
        }),
      ],
    );
    expect(merged[0]).toMatchObject({
      gridInspectionStatus: "PASSED",
      latestInspectionCategory: "CLEAR_INSPECTION",
      latestCalibrationOutcome: "FAIL",
    });
  });

  it("keeps green CI grid tile when hydrated calibration template fails after clear pass", () => {
    const merged = mergeGridInspectionFromSubmissions(
      [{ id: "row-cab", gridInspectionStatus: null, latestInspectionCategory: null }],
      [
        submission({
          id: "sub-cal-fail",
          scopeRowId: "row-cab",
          categorySnapshot: "CALIBRATION_INSPECTION",
          formCategory: "CLEAR_INSPECTION",
          templateSnapshot: {
            category: "CALIBRATION_INSPECTION",
            name: "Clear Inspection",
            sections: [{ id: "s1", title: "Checks", questions: [] }],
          },
          outcome: "FAIL",
          submittedAt: "2026-06-02T12:00:00Z",
        }),
        submission({
          id: "sub-clear-pass",
          scopeRowId: "row-cab",
          categorySnapshot: "CLEAR_INSPECTION",
          formCategory: "CLEAR_INSPECTION",
          outcome: "PASS",
          submittedAt: "2026-06-01T12:00:00Z",
        }),
      ],
    );
    expect(merged[0]).toMatchObject({
      gridInspectionStatus: "PASSED",
      latestInspectionCategory: "CLEAR_INSPECTION",
      latestCalibrationOutcome: "FAIL",
    });
  });
});

describe("localScopeUpdatesFromSubmission", () => {
  it("returns grid + inspectionStatus for authoritative clear inspection", () => {
    const clearFail = submission({
      id: "sub-clear",
      categorySnapshot: "CLEAR_INSPECTION",
      outcome: "FAIL",
    });
    expect(localScopeUpdatesFromSubmission(clearFail)).toEqual({
      gridInspectionStatus: "FAILED",
      latestInspectionCategory: "CLEAR_INSPECTION",
      inspectionStatus: "FAILED",
    });
  });

  it("returns null for calibration submissions", () => {
    const cal = submission({
      id: "sub-cal",
      categorySnapshot: "CALIBRATION_INSPECTION",
    });
    expect(localScopeUpdatesFromSubmission(cal)).toBeNull();
  });
});

describe("localScopeUpdatesFromBackfillOutcome", () => {
  it("maps PASS to PASSED with BACKFILL category", () => {
    expect(localScopeUpdatesFromBackfillOutcome("PASS")).toEqual({
      gridInspectionStatus: "PASSED",
      latestInspectionCategory: "BACKFILL",
      inspectionStatus: "PASSED",
    });
  });
});

describe("clearLocalScopeInspectionUpdates", () => {
  it("clears all local inspection display fields", () => {
    expect(clearLocalScopeInspectionUpdates()).toEqual({
      gridInspectionStatus: null,
      latestInspectionCategory: null,
      inspectionStatus: null,
    });
  });
});
