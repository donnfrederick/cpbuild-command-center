import { describe, it, expect } from "vitest";
import {
  resolveLevelUnitRows,
  synthesizeLevelUnitDetails,
} from "@/lib/reports/synthesize-level-unit-details";
import type { LevelScopeCellData } from "@/lib/level-scope-report";

function cell(partial: Partial<LevelScopeCellData> & Pick<LevelScopeCellData, "pct" | "installedQty" | "totalQty">): LevelScopeCellData {
  return {
    notStartedQty: 0,
    stagingQty: 0,
    assemblyQty: 0,
    installInProgressQty: 0,
    installCompleteSubQty: 0,
    ...partial,
  };
}

describe("synthesizeLevelUnitDetails", () => {
  it("creates complete unit rows matching installedQty per scope", () => {
    const levelData = {
      Cabinets: cell({ pct: 28, installedQty: 5, totalQty: 18, verifiedUnitDelta: 1 }),
      Countertops: cell({ pct: 22, installedQty: 4, totalQty: 18, verifiedUnitDelta: 1 }),
    };
    const rows = synthesizeLevelUnitDetails("Level 6", ["Cabinets", "Countertops"], levelData);
    expect(rows.filter((r) => r.scopeName === "Cabinets").map((r) => r.unitLabel)).toEqual([
      "601",
      "602",
      "603",
      "604",
      "605",
    ]);
    expect(rows.filter((r) => r.scopeName === "Countertops").map((r) => r.unitLabel)).toEqual([
      "601",
      "602",
      "603",
      "604",
    ]);
    expect(rows.find((r) => r.scopeName === "Cabinets" && r.unitLabel === "605")?.updatedThisPeriod).toBe(
      true,
    );
  });

  it("marks units as updated when verifiedUnitDelta is negative", () => {
    const levelData = {
      Tile: cell({ pct: 28, installedQty: 3, totalQty: 18, verifiedUnitDelta: -1 }),
    };
    const rows = synthesizeLevelUnitDetails("Level 3", ["Tile"], levelData);
    const tileRows = rows.filter((r) => r.scopeName === "Tile");
    expect(tileRows).toHaveLength(3);
    expect(tileRows.filter((r) => r.updatedThisPeriod)).toHaveLength(1);
    expect(tileRows.find((r) => r.updatedThisPeriod)?.unitLabel).toBe("303");
  });

  it("resolveLevelUnitRows prefers explicit fixtures when present", () => {
    const explicit = [
      {
        unitLabel: "301",
        scopeName: "Cabinets",
        verifiedPct: 100,
        updatedThisPeriod: true,
        subcontractor: "Custom Sub",
      },
    ];
    const resolved = resolveLevelUnitRows(
      "Level 3",
      ["Cabinets"],
      { Cabinets: cell({ pct: 70, installedQty: 13, totalQty: 18 }) },
      explicit,
    );
    expect(resolved).toEqual(explicit);
  });
});
