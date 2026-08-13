import type { LevelScopeReportData } from "@/lib/level-scope-report";

export function sumQtyForLevel(
  lk: string,
  scopes: string[],
  data: LevelScopeReportData["data"],
  levelOverallUnits?: LevelScopeReportData["levelOverallUnits"],
): { installedQty: number; totalQty: number } {
  if (levelOverallUnits?.[lk]) {
    return levelOverallUnits[lk];
  }
  let installedQty = 0;
  let totalQty = 0;
  for (const scope of scopes) {
    const cell = data[lk]?.[scope];
    if (!cell || cell.totalQty <= 0) continue;
    installedQty += cell.installedQty;
    totalQty += cell.totalQty;
  }
  return { installedQty, totalQty };
}

export function sumQtyForScope(
  scope: string,
  levels: string[],
  data: LevelScopeReportData["data"],
): { installedQty: number; totalQty: number } {
  let installedQty = 0;
  let totalQty = 0;
  for (const lk of levels) {
    const cell = data[lk]?.[scope];
    if (!cell || cell.totalQty <= 0) continue;
    installedQty += cell.installedQty;
    totalQty += cell.totalQty;
  }
  return { installedQty, totalQty };
}

export function sumQtyGrandTotal(
  levels: string[],
  scopes: string[],
  data: LevelScopeReportData["data"],
  levelOverallUnits?: LevelScopeReportData["levelOverallUnits"],
): { installedQty: number; totalQty: number } {
  let installedQty = 0;
  let totalQty = 0;
  for (const lk of levels) {
    const q = sumQtyForLevel(lk, scopes, data, levelOverallUnits);
    installedQty += q.installedQty;
    totalQty += q.totalQty;
  }
  return { installedQty, totalQty };
}

export function pctFromQty(installedQty: number, totalQty: number): number {
  return totalQty === 0 ? 0 : Math.round((installedQty / totalQty) * 100);
}

export function sumUnitDeltaForScopeInLevels(
  scope: string,
  levels: string[],
  data: LevelScopeReportData["data"],
): number | null {
  let sum = 0;
  let any = false;
  for (const lk of levels) {
    const unitDelta = data[lk]?.[scope]?.verifiedUnitDelta;
    if (unitDelta == null) continue;
    sum += unitDelta;
    any = true;
  }
  return any ? sum : null;
}

/** Verified % change for a scope within a building, derived from summed unit delta. */
export function verifiedDeltaForScopeInLevels(
  scope: string,
  levels: string[],
  data: LevelScopeReportData["data"],
): number | null {
  const scopeQty = sumQtyForScope(scope, levels, data);
  if (scopeQty.totalQty <= 0) return null;
  const unitDelta = sumUnitDeltaForScopeInLevels(scope, levels, data);
  if (unitDelta == null) return null;
  const currentPct = pctFromQty(scopeQty.installedQty, scopeQty.totalQty);
  const startInstalledQty = Math.max(0, scopeQty.installedQty - unitDelta);
  const startPct = pctFromQty(startInstalledQty, scopeQty.totalQty);
  const delta = currentPct - startPct;
  return delta === 0 ? null : delta;
}

export function levelDisplayLabel(levelKey: string): string {
  return levelKey.includes(" › ") ? levelKey.split(" › ")[1]! : levelKey;
}
