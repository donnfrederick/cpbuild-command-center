import { buildLevelKey } from "@/lib/level-scope-report-keys";
import type { LevelScopeCellData, LevelScopeReportData, LevelUnitDetailRow } from "@/lib/level-scope-report";
import type { PortfolioProjectSnapshot } from "@/lib/reports/portfolio-progress-types";

/** Converts a live snapshot into LevelScopeReportData for the expanded grid (client-safe). */
export function portfolioSnapshotToLevelScopeReport(
  snapshot: PortfolioProjectSnapshot,
): LevelScopeReportData {
  const buildingNames = snapshot.buildings.map((b) => b.buildingName);
  const multiBuilding = buildingNames.length > 1;
  const levels: string[] = [];
  const levelToBuilding: Record<string, string> = {};
  const data: Record<string, Record<string, LevelScopeCellData>> = {};
  const levelUnitDetails: Record<string, LevelUnitDetailRow[]> = {};

  for (const building of snapshot.buildings) {
    for (const level of building.levels) {
      const lk = buildLevelKey(building.buildingName, level.levelLabel, multiBuilding);
      levels.push(lk);
      levelToBuilding[lk] = building.buildingName;
      data[lk] = {};
      for (const cell of level.cells) {
        const totalQty = cell.totalUnits ?? 0;
        const installedQty =
          totalQty > 0 ? Math.min(totalQty, Math.round((cell.verifiedPct / 100) * totalQty)) : 0;
        const subQtyRaw =
          totalQty > 0 ? Math.min(totalQty, Math.round((cell.subPct / 100) * totalQty)) : 0;
        const subQty = Math.min(subQtyRaw, Math.max(0, totalQty - installedQty));
        data[lk][cell.scopeName] = {
          pct: cell.verifiedPct,
          subPct: cell.subPct,
          installedQty,
          totalQty,
          notStartedQty: Math.max(0, totalQty - installedQty - subQty),
          stagingQty: 0,
          assemblyQty: 0,
          installInProgressQty: 0,
          installCompleteSubQty: subQty,
          startedOn: cell.startedOn ?? null,
          lastUpdatedOn: cell.lastUpdatedOn ?? null,
          completedOn: cell.completedOn ?? null,
          verifiedDelta: cell.verifiedDelta ?? null,
          verifiedUnitDelta: cell.verifiedUnitDelta ?? null,
        };
      }
      if (level.units?.length) {
        levelUnitDetails[lk] = level.units.map((u) => ({
          unitLabel: u.unitLabel,
          scopeName: u.scopeName,
          verifiedPct: u.verifiedPct,
          updatedThisPeriod: u.updatedThisPeriod,
          subcontractor: u.subcontractor,
          verifiedOn: u.verifiedOn ?? null,
        }));
      }
    }
  }

  const scopes = snapshot.scopeSummaries.map((s) => s.scopeName);
  const sortedLevels = Array.from(new Set(levels)).sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
  );

  const overallByLevel: Record<string, number> = {};
  const levelOverallUnits: LevelScopeReportData["levelOverallUnits"] = {};
  for (const lk of sortedLevels) {
    const unitRows = levelUnitDetails[lk];
    if (unitRows?.length) {
      const byUnit = new Map<string, boolean[]>();
      for (const u of unitRows) {
        if (!byUnit.has(u.unitLabel)) byUnit.set(u.unitLabel, []);
        byUnit.get(u.unitLabel)!.push(u.verifiedPct >= 100);
      }
      let installedQty = 0;
      for (const statuses of byUnit.values()) {
        if (statuses.length > 0 && statuses.every(Boolean)) installedQty += 1;
      }
      const totalQty = byUnit.size;
      levelOverallUnits[lk] = { installedQty, totalQty };
      overallByLevel[lk] =
        totalQty === 0 ? 0 : Math.round((installedQty / totalQty) * 100);
    } else {
      const totalQty = Math.max(0, ...scopes.map((s) => data[lk]?.[s]?.totalQty ?? 0));
      const installedQty = Math.max(0, ...scopes.map((s) => data[lk]?.[s]?.installedQty ?? 0));
      levelOverallUnits[lk] = { installedQty, totalQty };
      overallByLevel[lk] =
        totalQty === 0 ? 0 : Math.round((installedQty / totalQty) * 100);
    }
  }

  const overallByScope: Record<string, number> = {};
  for (const summary of snapshot.scopeSummaries) {
    overallByScope[summary.scopeName] = summary.verifiedPct;
  }

  const grandTotalPct =
    snapshot.scopeSummaries.length === 0
      ? 0
      : Math.round(
          snapshot.scopeSummaries.reduce((sum, s) => sum + s.verifiedPct, 0) /
            snapshot.scopeSummaries.length,
        );

  return {
    levels: sortedLevels,
    scopes,
    data,
    overallByLevel,
    overallByScope,
    grandTotalPct,
    levelOverallUnits,
    buildings: Array.from(new Set(buildingNames)).sort((a, b) =>
      a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
    ),
    levelToBuilding,
    overallDeltaByScope: Object.fromEntries(
      snapshot.scopeSummaries.map((s) => [s.scopeName, s.verifiedDelta]),
    ),
    overallUnitDeltaByScope: Object.fromEntries(
      snapshot.scopeSummaries.map((s) => [s.scopeName, s.verifiedUnitDelta ?? null]),
    ),
    levelUnitDetails,
  };
}
