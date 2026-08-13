import type { LevelUnitDetailRow } from "@/lib/level-scope-report";

export interface LevelScopeUnitLine {
  unitLabel: string;
  verifiedPct: number;
  updatedThisPeriod: boolean;
  subcontractor: string | null;
}

export interface LevelUnitExpandModel {
  /** All unit numbers on this level, sorted — one shared vertical stack. */
  unitOrder: string[];
  /** scope → unit → row (missing = no row for that scope). */
  byScope: Record<string, Record<string, LevelScopeUnitLine>>;
}

function unitSort(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

/** Derive location labels for a level (e.g. Level 3 + 18 units → 301…318). */
export function unitLabelsForLevelKey(levelKey: string, totalQty: number): string[] {
  if (totalQty <= 0) return [];
  const match = levelKey.match(/(\d+)\s*$/);
  const levelNum = match ? parseInt(match[1], 10) : 1;
  const base = levelNum * 100;
  return Array.from({ length: totalQty }, (_, i) => String(base + i + 1));
}

export function maxTotalQtyForLevel(
  levelKey: string,
  scopes: string[],
  data: Record<string, Record<string, { totalQty?: number } | undefined>>,
): number {
  let max = 0;
  for (const scope of scopes) {
    const qty = data[levelKey]?.[scope]?.totalQty ?? 0;
    if (qty > max) max = qty;
  }
  return max;
}

export function buildLevelUnitExpandModel(
  rows: LevelUnitDetailRow[],
  scopes: string[],
  allUnitLabels?: string[],
): LevelUnitExpandModel {
  const unitSet = new Set<string>();
  const byScope = Object.fromEntries(
    scopes.map((scopeName) => [scopeName, {} as Record<string, LevelScopeUnitLine>]),
  ) as LevelUnitExpandModel["byScope"];

  for (const row of rows) {
    const scopeMap = byScope[row.scopeName];
    if (!scopeMap) continue;
    unitSet.add(row.unitLabel);
    scopeMap[row.unitLabel] = {
      unitLabel: row.unitLabel,
      verifiedPct: row.verifiedPct,
      updatedThisPeriod: row.updatedThisPeriod,
      subcontractor: row.subcontractor,
    };
  }

  const unitOrder =
    allUnitLabels && allUnitLabels.length > 0
      ? [...allUnitLabels].sort(unitSort)
      : Array.from(unitSet).sort(unitSort);
  return { unitOrder, byScope };
}

/** @deprecated use buildLevelUnitExpandModel */
export type LevelScopeUnitGroup = { scopeName: string; units: LevelScopeUnitLine[] };

export function groupLevelUnitsByScope(
  rows: LevelUnitDetailRow[],
  scopes: string[],
): Record<string, LevelScopeUnitGroup> {
  const model = buildLevelUnitExpandModel(rows, scopes);
  return Object.fromEntries(
    scopes.map((scopeName) => [
      scopeName,
      {
        scopeName,
        units: model.unitOrder
          .map((label) => model.byScope[scopeName]?.[label])
          .filter((line): line is LevelScopeUnitLine => line !== undefined),
      },
    ]),
  );
}
