import { describe, it, expect } from "vitest";
import {
  buildLevelUnitExpandModel,
  groupLevelUnitsByScope,
  unitLabelsForLevelKey,
} from "@/lib/reports/level-scope-unit-groups";
import type { LevelUnitDetailRow } from "@/lib/level-scope-report";

describe("groupLevelUnitsByScope", () => {
  const scopes = ["Cabinets", "Countertops", "Tile"];

  it("orders units vertically per scope with update flags preserved", () => {
    const rows: LevelUnitDetailRow[] = [
      {
        unitLabel: "303",
        scopeName: "Cabinets",
        verifiedPct: 100,
        updatedThisPeriod: true,
        subcontractor: "HFC Cabinets",
      },
      {
        unitLabel: "301",
        scopeName: "Cabinets",
        verifiedPct: 100,
        updatedThisPeriod: true,
        subcontractor: "Premier Cabinets LLC",
      },
      {
        unitLabel: "302",
        scopeName: "Cabinets",
        verifiedPct: 100,
        updatedThisPeriod: false,
        subcontractor: "Premier Cabinets LLC",
      },
    ];

    const grouped = groupLevelUnitsByScope(rows, scopes);
    expect(grouped.Cabinets.units.map((u) => u.unitLabel)).toEqual(["301", "302", "303"]);
    expect(grouped.Cabinets.units.filter((u) => u.updatedThisPeriod).map((u) => u.unitLabel)).toEqual([
      "301",
      "303",
    ]);
    expect(grouped.Cabinets.units[0]?.subcontractor).toBe("Premier Cabinets LLC");
  });

  it("buildLevelUnitExpandModel uses one shared unit order across scopes", () => {
    const rows: LevelUnitDetailRow[] = [
      {
        unitLabel: "303",
        scopeName: "Cabinets",
        verifiedPct: 100,
        updatedThisPeriod: true,
        subcontractor: "HFC Cabinets",
      },
      {
        unitLabel: "301",
        scopeName: "Countertops",
        verifiedPct: 100,
        updatedThisPeriod: false,
        subcontractor: "Stone Works",
      },
      {
        unitLabel: "302",
        scopeName: "Cabinets",
        verifiedPct: 100,
        updatedThisPeriod: false,
        subcontractor: "Premier Cabinets LLC",
      },
    ];

    const model = buildLevelUnitExpandModel(rows, scopes);
    expect(model.unitOrder).toEqual(["301", "302", "303"]);
    expect(model.byScope.Cabinets["303"]?.subcontractor).toBe("HFC Cabinets");
    expect(model.byScope.Countertops["301"]?.subcontractor).toBe("Stone Works");
    expect(model.byScope.Cabinets["301"]).toBeUndefined();
  });

  it("unitLabelsForLevelKey builds 301…318 for Level 3 with 18 units", () => {
    expect(unitLabelsForLevelKey("Level 3", 18)).toEqual([
      "301",
      "302",
      "303",
      "304",
      "305",
      "306",
      "307",
      "308",
      "309",
      "310",
      "311",
      "312",
      "313",
      "314",
      "315",
      "316",
      "317",
      "318",
    ]);
  });

  it("uses allUnitLabels as the master stack even when a scope has fewer rows", () => {
    const rows: LevelUnitDetailRow[] = [
      {
        unitLabel: "301",
        scopeName: "Countertops",
        verifiedPct: 100,
        updatedThisPeriod: false,
        subcontractor: "Stone & Surface Pro",
      },
    ];
    const allLabels = ["301", "302", "303"];
    const model = buildLevelUnitExpandModel(rows, scopes, allLabels);
    expect(model.unitOrder).toEqual(["301", "302", "303"]);
    expect(model.byScope.Countertops["301"]?.subcontractor).toBe("Stone & Surface Pro");
    expect(model.byScope.Countertops["302"]).toBeUndefined();
  });
});
