import { describe, it, expect } from "vitest";
import type { LevelScopeReportData } from "@/lib/level-scope-report";
import {
  pctFromQty,
  sumQtyGrandTotal,
  sumUnitDeltaForScopeInLevels,
  verifiedDeltaForScopeInLevels,
} from "@/lib/reports/level-scope-qty";

const data: LevelScopeReportData["data"] = {
  "Building A › Level 1": {
    Cabinets: {
      pct: 50,
      subPct: 0,
      installedQty: 5,
      totalQty: 10,
      notStartedQty: 0,
      stagingQty: 0,
      assemblyQty: 0,
      installInProgressQty: 0,
      installCompleteSubQty: 0,
      verifiedDelta: 10,
      verifiedUnitDelta: 1,
    },
  },
  "Building A › Level 2": {
    Cabinets: {
      pct: 100,
      subPct: 0,
      installedQty: 10,
      totalQty: 10,
      notStartedQty: 0,
      stagingQty: 0,
      assemblyQty: 0,
      installInProgressQty: 0,
      installCompleteSubQty: 0,
      verifiedDelta: 5,
      verifiedUnitDelta: 2,
    },
  },
};

describe("level-scope-qty building rollups", () => {
  it("pctFromQty rounds installed share of total locations", () => {
    expect(pctFromQty(15, 20)).toBe(75);
    expect(pctFromQty(0, 0)).toBe(0);
  });

  it("sumQtyGrandTotal aggregates only the given building levels", () => {
    const qty = sumQtyGrandTotal(
      ["Building A › Level 1", "Building A › Level 2"],
      ["Cabinets"],
      data,
    );
    expect(qty).toEqual({ installedQty: 15, totalQty: 20 });
  });

  it("sumUnitDeltaForScopeInLevels sums cell unit deltas in a building", () => {
    expect(
      sumUnitDeltaForScopeInLevels("Cabinets", ["Building A › Level 1", "Building A › Level 2"], data),
    ).toBe(3);
  });

  it("verifiedDeltaForScopeInLevels derives scope % change from unit delta", () => {
    expect(
      verifiedDeltaForScopeInLevels("Cabinets", ["Building A › Level 1", "Building A › Level 2"], data),
    ).toBe(15);
  });
});
