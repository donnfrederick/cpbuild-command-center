import { describe, it, expect } from "vitest";
import {
  getClearInspectionScopeLockReason,
  isProjectRowInstallCompleteForClearInspection,
} from "@/lib/inspections/clear-inspection-scope-gate";

describe("isProjectRowInstallCompleteForClearInspection()", () => {
  it("returns true for INSTALL+COMPLETE parent row", () => {
    expect(
      isProjectRowInstallCompleteForClearInspection({
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
      }),
    ).toBe(true);
  });

  it("returns false when parent row is still in progress", () => {
    expect(
      isProjectRowInstallCompleteForClearInspection({
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
      }),
    ).toBe(false);
  });

  it("returns true for INSTALL+COMPLETE parent even when sub-scope instances are incomplete", () => {
    expect(
      isProjectRowInstallCompleteForClearInspection({
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        subScopeInstances: [
          { scopeStage: "INSTALL", scopeStatus: "IN_PROGRESS" },
        ],
      }),
    ).toBe(true);
  });

  it("returns false when parent row is not Install Complete-Verified", () => {
    expect(
      isProjectRowInstallCompleteForClearInspection({
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
        subScopeInstances: [
          { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
          { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
        ],
      }),
    ).toBe(false);
  });
});

describe("scopeNeedsClearInspectionPrepGate()", () => {
  it("returns true when subcontractor is missing", async () => {
    const { scopeNeedsClearInspectionPrepGate } = await import(
      "@/lib/inspections/clear-inspection-scope-gate"
    );
    expect(scopeNeedsClearInspectionPrepGate({ unifierSubId: null }, true)).toBe(true);
  });

  it("returns true when install is incomplete", async () => {
    const { scopeNeedsClearInspectionPrepGate } = await import(
      "@/lib/inspections/clear-inspection-scope-gate"
    );
    expect(scopeNeedsClearInspectionPrepGate({ unifierSubId: "sub-1" }, false)).toBe(true);
  });

  it("returns false when subcontractor is assigned and install is complete", async () => {
    const { scopeNeedsClearInspectionPrepGate } = await import(
      "@/lib/inspections/clear-inspection-scope-gate"
    );
    expect(scopeNeedsClearInspectionPrepGate({ unifierSubId: "sub-1" }, true)).toBe(false);
  });
});

describe("getClearInspectionScopeLockReason()", () => {
  it("returns install_complete when scope is not Install · Complete", () => {
    expect(
      getClearInspectionScopeLockReason({
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
        unifierSubId: "sub-1",
      }),
    ).toBe("install_complete");
  });

  it("returns subcontractor when install is complete but no sub is assigned", () => {
    expect(
      getClearInspectionScopeLockReason({
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        unifierSubId: null,
      }),
    ).toBe("subcontractor");
  });

  it("returns null when install is complete and a subcontractor is assigned", () => {
    expect(
      getClearInspectionScopeLockReason({
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        unifierSubId: "sub-1",
      }),
    ).toBeNull();
  });

  it("prefers install_complete over subcontractor when both are missing", () => {
    expect(
      getClearInspectionScopeLockReason({
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
        unifierSubId: null,
      }),
    ).toBe("install_complete");
  });
});
