import { describe, expect, it } from "vitest";
import { portfolioSnapshotToLevelScopeReport } from "@/lib/reports/portfolio-snapshot-to-grid";
import type { PortfolioProjectSnapshot } from "@/lib/reports/portfolio-progress-types";

const snapshot: PortfolioProjectSnapshot = {
  id: "p1",
  name: "Sample",
  unifierPid: null,
  projectManagerName: "",
  installManagerName: null,
  hasChangesInPeriod: true,
  scopeSummaries: [
    {
      scopeName: "Cabinets",
      verifiedPct: 70,
      verifiedDelta: 5,
      verifiedUnitDelta: 2,
      subPct: 10,
      subDelta: 1,
      subUnitDelta: 1,
    },
  ],
  buildings: [
    {
      buildingName: "Main",
      levels: [
        {
          levelLabel: "Level 2",
          cells: [
            {
              scopeName: "Cabinets",
              verifiedPct: 70,
              verifiedDelta: 5,
              verifiedUnitDelta: 2,
              subPct: 10,
              subDelta: 1,
              subUnitDelta: 1,
              startedOn: "2025-01-06",
              completedOn: null,
              totalUnits: 10,
            },
          ],
          units: [
            {
              unitLabel: "201",
              scopeName: "Cabinets",
              verifiedPct: 100,
              updatedThisPeriod: true,
              subcontractor: "Premier LLC",
              verifiedOn: "2025-06-01",
            },
          ],
        },
      ],
    },
  ],
};

describe("portfolioSnapshotToLevelScopeReport", () => {
  it("maps snapshot cells into LevelScopeReportData with subPct and deltas", () => {
    const report = portfolioSnapshotToLevelScopeReport(snapshot);
    expect(report.levels).toEqual(["Level 2"]);
    expect(report.scopes).toEqual(["Cabinets"]);
    const cell = report.data["Level 2"]?.Cabinets;
    expect(cell?.pct).toBe(70);
    expect(cell?.subPct).toBe(10);
    expect(cell?.totalQty).toBe(10);
    expect(cell?.installedQty).toBe(7);
    expect(cell?.installCompleteSubQty).toBe(1);
    expect(cell?.verifiedDelta).toBe(5);
    expect(report.overallDeltaByScope?.Cabinets).toBe(5);
  });

  it("includes level unit details keyed by level", () => {
    const report = portfolioSnapshotToLevelScopeReport(snapshot);
    expect(report.levelUnitDetails?.["Level 2"]).toHaveLength(1);
    expect(report.levelUnitDetails?.["Level 2"]?.[0]?.unitLabel).toBe("201");
  });
});
