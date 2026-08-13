import { describe, it, expect } from "vitest";
import {
  outcomeToInspectionHistoryStatus,
  shouldCreateInspectionHistoryRow,
  shouldSyncScopeInspectionStatus,
} from "@/lib/inspections/inspection-history-sync";

describe("shouldCreateInspectionHistoryRow()", () => {
  it("returns true for all inspection types with scopeRowId", () => {
    expect(
      shouldCreateInspectionHistoryRow({ scopeRowId: "row-1", category: "CLEAR_INSPECTION" }),
    ).toBe(true);
    expect(
      shouldCreateInspectionHistoryRow({
        scopeRowId: "row-1",
        category: "CALIBRATION_INSPECTION",
      }),
    ).toBe(true);
    expect(
      shouldCreateInspectionHistoryRow({
        scopeRowId: "row-1",
        category: "FIELD_VERIFICATION",
      }),
    ).toBe(true);
    expect(
      shouldCreateInspectionHistoryRow({
        scopeRowId: "row-1",
        category: "TWO_AREA_CLEAR",
      }),
    ).toBe(true);
  });

  it("returns false without scopeRowId or unknown category", () => {
    expect(
      shouldCreateInspectionHistoryRow({ scopeRowId: null, category: "CLEAR_INSPECTION" }),
    ).toBe(false);
    expect(
      shouldCreateInspectionHistoryRow({ scopeRowId: "row-1", category: "PRE_INSTALL" }),
    ).toBe(false);
  });
});

describe("shouldSyncScopeInspectionStatus()", () => {
  it("syncs all non-calibration categories with scopeRowId", () => {
    expect(
      shouldSyncScopeInspectionStatus({
        category: "CLEAR_INSPECTION",
        scopeRowId: "row-1",
      }),
    ).toBe(true);
    expect(
      shouldSyncScopeInspectionStatus({
        category: "FIELD_VERIFICATION",
        scopeRowId: "row-1",
      }),
    ).toBe(true);
    expect(
      shouldSyncScopeInspectionStatus({
        category: "CALIBRATION_INSPECTION",
        scopeRowId: "row-1",
      }),
    ).toBe(false);
    expect(
      shouldSyncScopeInspectionStatus({
        category: "CLEAR_INSPECTION",
        scopeRowId: null,
      }),
    ).toBe(false);
  });
});

describe("outcomeToInspectionHistoryStatus()", () => {
  it("maps FAIL to FAILED and pass outcomes to PASSED", () => {
    expect(outcomeToInspectionHistoryStatus("FAIL")).toBe("FAILED");
    expect(outcomeToInspectionHistoryStatus("PASS")).toBe("PASSED");
    expect(outcomeToInspectionHistoryStatus("COMPLETE")).toBe("PASSED");
  });
});
