import { describe, expect, it } from "vitest";
import {
  buildLevelScopeReport,
  type LevelScopeReportRow,
} from "@/lib/level-scope-report";

function row(overrides: Partial<LevelScopeReportRow> = {}): LevelScopeReportRow {
  return {
    building: "A",
    level: "1",
    qty: 1,
    scopeStage: null,
    scopeStatus: null,
    scopeType: { name: "Cabinetry", canonicalScopeType: { displayName: "Cabinets" } },
    subScopeInstances: [],
    ...overrides,
  };
}

describe("buildLevelScopeReport", () => {
  it("counts units (not qty) for verified and sub-reported percentages", () => {
    const report = buildLevelScopeReport([
      row({ unit: "101", scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
      row({ unit: "102", scopeStage: "INSTALL", scopeStatus: "PENDING_VERIFICATION" }),
    ]);

    const cell = report.data["1"].Cabinets;
    expect(cell.totalQty).toBe(2);
    expect(cell.installedQty).toBe(1);
    expect(cell.installCompleteSubQty).toBe(1);
    expect(cell.pct).toBe(50);
    expect(cell.subPct).toBe(50);
    expect(report.grandTotalPct).toBe(50);
  });

  it("counts one unit per row when sub-scope instances exist (ignores instance qty)", () => {
    const report = buildLevelScopeReport([
      row({
        unit: "101",
        qty: 100,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        subScopeInstances: [
          { qty: 2, scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
          { qty: 6, scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS" },
        ],
      }),
    ]);

    const cell = report.data["1"].Cabinets;
    expect(cell.totalQty).toBe(1);
    expect(cell.installedQty).toBe(0);
    expect(cell.assemblyQty).toBe(1);
    expect(cell.pct).toBe(0);
  });

  it("marks a unit verified only when all sub-scope instances are verified", () => {
    const report = buildLevelScopeReport([
      row({
        unit: "101",
        subScopeInstances: [
          { qty: 1, scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
          { qty: 1, scopeStage: "INSTALL", scopeStatus: "COMPLETE" },
        ],
      }),
    ]);

    expect(report.data["1"].Cabinets).toMatchObject({
      totalQty: 1,
      installedQty: 1,
      pct: 100,
    });
  });

  it("keys levels by building when multiple buildings exist", () => {
    const report = buildLevelScopeReport([
      row({ building: "A", level: "2", unit: "201", scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
      row({ building: "B", level: "2", unit: "201", scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
    ]);

    expect(report.levels).toEqual(["A › 2", "B › 2"]);
    expect(report.levelToBuilding).toEqual({ "A › 2": "A", "B › 2": "B" });
    expect(report.buildings).toEqual(["A", "B"]);
  });

  it("falls back to scope type name and Unknown scope", () => {
    const report = buildLevelScopeReport([
      row({ scopeType: { name: "Flooring" } }),
      row({ scopeType: null }),
    ]);

    expect(report.scopes).toEqual(["Flooring", "Unknown"]);
  });

  it("excludes INSTALL+COMPLETE with FAILED inspection from verified pct", () => {
    const report = buildLevelScopeReport([
      row({
        unit: "101",
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "FAILED",
      }),
    ]);
    const cell = report.data["1"].Cabinets;
    expect(cell.installedQty).toBe(0);
    expect(cell.installInProgressQty).toBe(1);
    expect(cell.pct).toBe(0);
  });

  it("counts INSTALL+COMPLETE with READY inspection in subPct only", () => {
    const report = buildLevelScopeReport([
      row({
        unit: "101",
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: "READY",
      }),
    ]);
    const cell = report.data["1"].Cabinets;
    expect(cell.installedQty).toBe(0);
    expect(cell.installCompleteSubQty).toBe(1);
    expect(cell.pct).toBe(0);
    expect(cell.subPct).toBe(100);
  });

  it("excludes INSTALL+COMPLETE with open issue from verified pct", () => {
    const report = buildLevelScopeReport([
      row({
        unit: "101",
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        hasOpenIssue: true,
      }),
    ]);
    expect(report.data["1"].Cabinets.pct).toBe(0);
  });

  it("computes level overall from distinct units with all scopes verified", () => {
    const report = buildLevelScopeReport([
      row({
        unit: "101",
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
      }),
      row({
        unit: "101",
        scopeType: { name: "Tile", canonicalScopeType: { displayName: "Tile" } },
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
      }),
      row({
        unit: "102",
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
      }),
      row({
        unit: "102",
        scopeType: { name: "Tile", canonicalScopeType: { displayName: "Tile" } },
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
      }),
    ]);

    expect(report.levelOverallUnits["1"]).toEqual({ installedQty: 1, totalQty: 2 });
    expect(report.overallByLevel["1"]).toBe(50);
  });
});
