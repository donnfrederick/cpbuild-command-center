import { describe, it, expect } from "vitest";
import {
  formatExportUnitsInline,
  formatExportDeltaText,
} from "@/lib/reports/portfolio-export-format";
import {
  sumQtyForLevel,
  sumQtyGrandTotal,
  levelDisplayLabel,
} from "@/lib/reports/level-scope-qty";

describe("portfolio-export-format", () => {
  it("formats unit inline labels with plural rules", () => {
    expect(formatExportUnitsInline(1, "en")).toBe("(1 unit)");
    expect(formatExportUnitsInline(6, "en")).toBe("(6 units)");
    expect(formatExportUnitsInline(1, "es")).toBe("(1 unidad)");
    expect(formatExportUnitsInline(6, "es")).toBe("(6 unidades)");
  });

  it("formats delta text", () => {
    expect(formatExportDeltaText(4, "—")).toBe("+4%");
    expect(formatExportDeltaText(-2, "—")).toBe("0%");
    expect(formatExportDeltaText(null, "—")).toBe("0%");
  });
});

describe("level-scope-qty", () => {
  it("sums installed and total qty for a level when levelOverallUnits is absent", () => {
    const data = {
      "Level 3": {
        Cabinets: { pct: 70, installedQty: 13, totalQty: 18 },
        Countertops: { pct: 45, installedQty: 8, totalQty: 18 },
      },
    };
    expect(sumQtyForLevel("Level 3", ["Cabinets", "Countertops"], data)).toEqual({
      installedQty: 21,
      totalQty: 36,
    });
  });

  it("uses levelOverallUnits for the overall column when provided", () => {
    const data = {
      "Level 3": {
        Cabinets: { pct: 70, installedQty: 13, totalQty: 18 },
        Countertops: { pct: 45, installedQty: 8, totalQty: 18 },
      },
    };
    const levelOverallUnits = {
      "Level 3": { installedQty: 9, totalQty: 18 },
    };
    expect(
      sumQtyForLevel("Level 3", ["Cabinets", "Countertops"], data, levelOverallUnits),
    ).toEqual({ installedQty: 9, totalQty: 18 });
  });

  it("computes grand totals across levels", () => {
    const data = {
      "Level 3": {
        Cabinets: { pct: 70, installedQty: 13, totalQty: 18 },
      },
      "Level 4": {
        Cabinets: { pct: 100, installedQty: 18, totalQty: 18 },
      },
    };
    expect(sumQtyGrandTotal(["Level 3", "Level 4"], ["Cabinets"], data)).toEqual({
      installedQty: 31,
      totalQty: 36,
    });
  });

  it("strips building prefix from level labels", () => {
    expect(levelDisplayLabel("Building A › Level 3")).toBe("Level 3");
    expect(levelDisplayLabel("Level 3")).toBe("Level 3");
  });
});
