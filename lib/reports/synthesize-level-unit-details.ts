import type { LevelScopeCellData, LevelUnitDetailRow } from "@/lib/level-scope-report";
import { unitLabelsForLevelKey } from "@/lib/reports/level-scope-unit-groups";

const DEFAULT_SUBCONTRACTORS: Record<string, string[]> = {
  Cabinets: ["Premier Cabinets LLC", "HFC Cabinets"],
  Countertops: ["Stone & Surface Pro"],
  Tile: ["Bay Tile Co"],
};

function subcontractorForScope(scopeName: string, unitIndex: number): string | null {
  const pool = DEFAULT_SUBCONTRACTORS[scopeName];
  if (!pool?.length) return null;
  return pool[unitIndex % pool.length] ?? null;
}

/**
 * Build per-unit rows from level × scope aggregates when the API (or wireframe)
 * has not supplied explicit levelUnitDetails for that level.
 */
export function synthesizeLevelUnitDetails(
  levelKey: string,
  scopes: string[],
  levelData: Record<string, LevelScopeCellData | undefined> | undefined,
): LevelUnitDetailRow[] {
  if (!levelData) return [];

  const rows: LevelUnitDetailRow[] = [];

  for (const scopeName of scopes) {
    const cell = levelData[scopeName];
    if (!cell || cell.totalQty <= 0) continue;

    const labels = unitLabelsForLevelKey(levelKey, cell.totalQty);
    const installed = Math.min(Math.max(0, cell.installedQty), labels.length);
    const deltaMagnitude = Math.abs(cell.verifiedUnitDelta ?? 0);
    const updatedFromIndex = Math.max(0, installed - deltaMagnitude);

    for (let i = 0; i < installed; i++) {
      const unitLabel = labels[i];
      if (!unitLabel) continue;
      rows.push({
        unitLabel,
        scopeName,
        verifiedPct: 100,
        updatedThisPeriod: deltaMagnitude > 0 && i >= updatedFromIndex,
        subcontractor: subcontractorForScope(scopeName, i),
        verifiedOn: null,
      });
    }
  }

  return rows;
}

export function resolveLevelUnitRows(
  levelKey: string,
  scopes: string[],
  levelData: Record<string, LevelScopeCellData | undefined> | undefined,
  explicitRows?: LevelUnitDetailRow[],
): LevelUnitDetailRow[] {
  if (explicitRows && explicitRows.length > 0) return explicitRows;
  return synthesizeLevelUnitDetails(levelKey, scopes, levelData);
}
