import { describe, it, expect } from "vitest";
import {
  countInstallCompleteScopes,
  isScopeInstallComplete,
  unitInstallCompletePercent,
  unitQtyInstallCompletePercent,
} from "@/lib/unit-scope-progress";

describe("isScopeInstallComplete()", () => {
  it("returns true for INSTALL + COMPLETE and INSTALL + PENDING_VERIFICATION", () => {
    expect(isScopeInstallComplete("INSTALL", "COMPLETE")).toBe(true);
    expect(isScopeInstallComplete("INSTALL", "PENDING_VERIFICATION")).toBe(true);
  });

  it("returns false for other stage/status combinations", () => {
    expect(isScopeInstallComplete("INSTALL", "IN_PROGRESS")).toBe(false);
    expect(isScopeInstallComplete("STAGING", "COMPLETE")).toBe(false);
    expect(isScopeInstallComplete(null, null)).toBe(false);
  });
});

describe("unitInstallCompletePercent", () => {
  it("returns 0 when there are no scopes", () => {
    expect(unitInstallCompletePercent([])).toBe(0);
    expect(countInstallCompleteScopes([])).toBe(0);
  });

  it("counts install-complete scopes with equal weight per scope row", () => {
    const scopes = [
      { scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const },
      { scopeStage: "INSTALL" as const, scopeStatus: "IN_PROGRESS" as const },
      { scopeStage: "STAGING" as const, scopeStatus: "COMPLETE" as const },
      { scopeStage: null, scopeStatus: null },
    ];
    expect(countInstallCompleteScopes(scopes)).toBe(1);
    expect(unitInstallCompletePercent(scopes)).toBe(25);
  });

  it("rounds to nearest whole percent", () => {
    const scopes = [
      { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
      { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
      { scopeStage: "INSTALL", scopeStatus: "NOT_STARTED" },
    ];
    expect(unitInstallCompletePercent(scopes)).toBe(67);
  });

  it("counts INSTALL + COMPLETE and INSTALL + PENDING_VERIFICATION", () => {
    const scopes = [
      { scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const },
      { scopeStage: "INSTALL" as const, scopeStatus: "PENDING_VERIFICATION" as const },
      { scopeStage: "INSTALL" as const, scopeStatus: "IN_PROGRESS" as const },
      { scopeStage: "STAGING" as const, scopeStatus: "COMPLETE" as const },
    ];
    expect(countInstallCompleteScopes(scopes)).toBe(2);
    expect(unitInstallCompletePercent(scopes)).toBe(50);
  });

  it("uses equal scope weight even when qty differs (FT-0037)", () => {
    // Location card must not show qty-weighted % (e.g. 21% when CAB qty=21, TOP qty=79).
    // One of two scopes install-complete → 50%, not 21%.
    const scopeCountPct = unitInstallCompletePercent([
      { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
      { scopeStage: "INSTALL", scopeStatus: "NOT_STARTED" },
    ]);
    const qtyPct = unitQtyInstallCompletePercent([
      { qty: 21, scopeStage: "INSTALL", scopeStatus: "COMPLETE", subScopeInstances: [] },
      { qty: 79, scopeStage: "INSTALL", scopeStatus: "NOT_STARTED", subScopeInstances: [] },
    ]);
    expect(scopeCountPct).toBe(50);
    expect(qtyPct).toBe(21);
  });

  it("is 100% when every scope is install complete", () => {
    const scopes = [
      { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
      { scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
    ];
    expect(unitInstallCompletePercent(scopes)).toBe(100);
  });
});

describe("unitQtyInstallCompletePercent", () => {
  const noSubs: never[] = [];

  it("returns 0 for empty scopes", () => {
    expect(unitQtyInstallCompletePercent([])).toBe(0);
  });

  it("uses scope qty for scopes without sub-scopes", () => {
    const scopes = [
      { qty: 10, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const, subScopeInstances: noSubs },
      { qty: 10, scopeStage: "INSTALL" as const, scopeStatus: "IN_PROGRESS" as const, subScopeInstances: noSubs },
    ];
    // 10 of 20 installed = 50%
    expect(unitQtyInstallCompletePercent(scopes)).toBe(50);
  });

  it("unequal qtys weight the percentage correctly", () => {
    const scopes = [
      { qty: 90, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const, subScopeInstances: noSubs },
      { qty: 10, scopeStage: "INSTALL" as const, scopeStatus: "NOT_STARTED" as const, subScopeInstances: noSubs },
    ];
    // 90 of 100 installed = 90%
    expect(unitQtyInstallCompletePercent(scopes)).toBe(90);
  });

  it("uses sub-scope instance qtys when sub-scopes are present", () => {
    const scopes = [
      {
        qty: null,
        scopeStage: "INSTALL" as const,
        scopeStatus: "COMPLETE" as const,
        subScopeInstances: [
          { qty: 5, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const },
          { qty: 4, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const },
          { qty: 3, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const },
          { qty: 1, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const },
        ],
      },
      {
        qty: null,
        scopeStage: "INSTALL" as const,
        scopeStatus: "NOT_STARTED" as const,
        subScopeInstances: [
          { qty: 13, scopeStage: "INSTALL" as const, scopeStatus: "NOT_STARTED" as const },
          { qty: 9, scopeStage: "INSTALL" as const, scopeStatus: "NOT_STARTED" as const },
        ],
      },
    ];
    // Cabinetry: 13 installed of 13 total; Ceramic Tile: 0 of 22 → 13/35 ≈ 37%
    expect(unitQtyInstallCompletePercent(scopes)).toBe(37);
  });

  it("falls back to qty=1 per scope when qty is null", () => {
    const scopes = [
      { qty: null, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const, subScopeInstances: noSubs },
      { qty: null, scopeStage: "INSTALL" as const, scopeStatus: "NOT_STARTED" as const, subScopeInstances: noSubs },
    ];
    // 1 of 2 = 50%
    expect(unitQtyInstallCompletePercent(scopes)).toBe(50);
  });

  it("is 100% when all sub-scope instances are install complete", () => {
    const scopes = [
      {
        qty: null,
        scopeStage: "INSTALL" as const,
        scopeStatus: "COMPLETE" as const,
        subScopeInstances: [
          { qty: 13, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const },
          { qty: 9, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const },
        ],
      },
    ];
    expect(unitQtyInstallCompletePercent(scopes)).toBe(100);
  });

  it("non-INSTALL stages do not contribute to installed qty", () => {
    const scopes = [
      { qty: 50, scopeStage: "STAGING" as const, scopeStatus: "COMPLETE" as const, subScopeInstances: noSubs },
      { qty: 50, scopeStage: "INSTALL" as const, scopeStatus: "COMPLETE" as const, subScopeInstances: noSubs },
    ];
    // Staging complete does NOT count — only INSTALL + COMPLETE does: 50/100 = 50%
    expect(unitQtyInstallCompletePercent(scopes)).toBe(50);
  });
});
