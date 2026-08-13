/**
 * Level × Scope progress report.
 *
 * Aggregates install-complete % broken down by (building ›) level × scope type
 * for a given project. Percentages and x/y counts are **unit-based** (locations
 * on that level), not quantity-weighted.
 */

import { db } from "@/lib/db";
import { buildLevelKey } from "@/lib/level-scope-report-keys";

export { buildLevelKey } from "@/lib/level-scope-report-keys";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface LevelScopeCellData {
  pct: number;
  /** INSTALL + PENDING_VERIFICATION unit %. */
  subPct: number;
  /** Units verified install-complete on this level × scope. */
  installedQty: number;
  /** Total units with this scope on this level. */
  totalQty: number;
  notStartedQty: number;
  stagingQty: number;
  assemblyQty: number;
  installInProgressQty: number;
  installCompleteSubQty: number;
  /** ISO date (YYYY-MM-DD) — first status update on this level × scope. */
  startedOn?: string | null;
  /** ISO date (YYYY-MM-DD) — most recent status change on any unit in this level × scope. */
  lastUpdatedOn?: string | null;
  /** ISO date (YYYY-MM-DD) — verified install complete (100%) on this level × scope. Only present when pct === 100. */
  completedOn?: string | null;
  /** Verified install % change vs the selected compare period (portfolio report). */
  verifiedDelta?: number | null;
  /** Verified location count change vs the compare period (portfolio report). */
  verifiedUnitDelta?: number | null;
}

export interface LevelScopeReportData {
  /** Sorted level keys (e.g. "Level 2", "Level 3", …). */
  levels: string[];
  /** Sorted scope display names (e.g. "CABIU", "TOPIU"). */
  scopes: string[];
  /**
   * data[levelKey][scopeName] = cell stats.
   * Missing entries mean no rows for that combination.
   */
  data: Record<string, Record<string, LevelScopeCellData>>;
  /** Overall install-complete % per level (across all scopes). */
  overallByLevel: Record<string, number>;
  /** Overall install-complete % per scope (across all levels). */
  overallByScope: Record<string, number>;
  /** Grand-total install-complete % across the whole project. */
  grandTotalPct: number;
  /** Per-level overall unit counts (all scopes on the level must be verified). */
  levelOverallUnits: Record<string, { installedQty: number; totalQty: number }>;
  /** Sorted building names (single-element array for single-building projects). */
  buildings: string[];
  /** Maps each level key to its building name. */
  levelToBuilding: Record<string, string>;
  /** Scope-level verified % change for the footer row (portfolio compare period). */
  overallDeltaByScope?: Record<string, number | null>;
  /** Scope-level verified unit count change for the footer row (portfolio compare period). */
  overallUnitDeltaByScope?: Record<string, number | null>;
  /**
   * Optional per-level location rows for portfolio drill-down (unit × scope on that level).
   * Backend: GET /api/reports/global-progress?include=levelUnits
   */
  levelUnitDetails?: Record<string, LevelUnitDetailRow[]>;
}

/** One location row in the level drill-down table (wireframe + live API). */
export interface LevelUnitDetailRow {
  unitLabel: string;
  scopeName: string;
  verifiedPct: number;
  updatedThisPeriod: boolean;
  subcontractor: string | null;
  verifiedOn?: string | null;
}

export interface LevelScopeReportRow {
  id?: string;
  building: string;
  level: string;
  unit?: string;
  qty: number | null;
  scopeStage: string | null;
  scopeStatus: string | null;
  /** QC inspection clearance state. FAILED and READY scopes do not count as verified complete. */
  inspectionStatus?: string | null;
  /** True when at least one open ProjectIssue is tagged to this scope row. */
  hasOpenIssue?: boolean;
  scopeType: {
    name: string;
    canonicalScopeType?: { displayName: string } | null;
  } | null;
  installer?: { name: string } | null;
  unifierSubId?: string | null;
  subScopeInstances: {
    id?: string;
    qty: number | null;
    scopeStage: string | null;
    scopeStatus: string | null;
    /** QC inspection clearance state. FAILED and READY scopes do not count as verified complete. */
    inspectionStatus?: string | null;
    /** True when at least one open ProjectIssue is tagged to this sub-scope instance. */
    hasOpenIssue?: boolean;
    subScope?: { name: string };
  }[];
}

// ─── Internal accumulators ────────────────────────────────────────────────────

interface QtyAcc {
  installedQty: number;
  totalQty: number;
  notStartedQty: number;
  stagingQty: number;
  assemblyQty: number;
  installInProgressQty: number;
  installCompleteSubQty: number;
}

function makeAcc(): QtyAcc {
  return {
    installedQty: 0,
    totalQty: 0,
    notStartedQty: 0,
    stagingQty: 0,
    assemblyQty: 0,
    installInProgressQty: 0,
    installCompleteSubQty: 0,
  };
}

function toPct({ installedQty, totalQty }: QtyAcc): number {
  return totalQty === 0 ? 0 : Math.round((installedQty / totalQty) * 100);
}

function toSubPct({ installCompleteSubQty, totalQty }: QtyAcc): number {
  return totalQty === 0 ? 0 : Math.round((installCompleteSubQty / totalQty) * 100);
}

/** Display name for a scope type row (matches grid aggregation). */
export function scopeDisplayName(
  scopeType: LevelScopeReportRow["scopeType"],
  subScopeName?: string | null,
): string {
  if (subScopeName) return subScopeName;
  return (
    scopeType?.canonicalScopeType?.displayName ??
    scopeType?.name ??
    "Unknown"
  );
}

type ScopeBucketKey = Exclude<keyof QtyAcc, "totalQty">;

function classifyScopeUnit(
  scopeStage: string | null,
  scopeStatus: string | null,
  inspectionStatus?: string | null,
  hasOpenIssue?: boolean,
): ScopeBucketKey {
  if (scopeStage === "INSTALL" && scopeStatus === "COMPLETE") {
    if (inspectionStatus === "FAILED" || hasOpenIssue) return "installInProgressQty";
    if (inspectionStatus === "READY") return "installCompleteSubQty";
    return "installedQty";
  }
  if (scopeStage === "INSTALL" && scopeStatus === "PENDING_VERIFICATION") {
    return "installCompleteSubQty";
  }
  if (
    scopeStage === "INSTALL" &&
    (scopeStatus === "IN_PROGRESS" || scopeStatus === "BLOCKED")
  ) {
    return "installInProgressQty";
  }
  if (scopeStage === "ASSEMBLY") return "assemblyQty";
  if (scopeStage === "STAGING" && (scopeStatus === "IN_PROGRESS" || scopeStatus === "COMPLETE")) {
    return "stagingQty";
  }
  return "notStartedQty";
}

const BUCKET_PRIORITY: Record<ScopeBucketKey, number> = {
  notStartedQty: 0,
  stagingQty: 1,
  assemblyQty: 2,
  installInProgressQty: 3,
  installCompleteSubQty: 4,
  installedQty: 5,
};

function classifyRowUnit(row: LevelScopeReportRow): ScopeBucketKey {
  if (row.subScopeInstances.length === 0) {
    return classifyScopeUnit(
      row.scopeStage,
      row.scopeStatus,
      row.inspectionStatus,
      row.hasOpenIssue,
    ) ?? "notStartedQty";
  }

  const buckets = row.subScopeInstances.map((inst) =>
    classifyScopeUnit(
      inst.scopeStage,
      inst.scopeStatus,
      inst.inspectionStatus ?? row.inspectionStatus,
      inst.hasOpenIssue || row.hasOpenIssue,
    ) ?? "notStartedQty",
  );

  if (buckets.every((b) => b === "installedQty")) return "installedQty";
  if (buckets.every((b) => b === "installedQty" || b === "installCompleteSubQty")) {
    return buckets.some((b) => b === "installCompleteSubQty")
      ? "installCompleteSubQty"
      : "installedQty";
  }

  return buckets.reduce((worst, bucket) =>
    BUCKET_PRIORITY[bucket] < BUCKET_PRIORITY[worst] ? bucket : worst,
  );
}

function isRowVerifiedComplete(row: LevelScopeReportRow): boolean {
  return classifyRowUnit(row) === "installedQty";
}

function rowUnitKey(row: LevelScopeReportRow, rowIndex: number): string {
  const unit = row.unit?.trim();
  if (unit) return `${row.building}|${row.level}|${unit}`;
  if (row.id) return `row:${row.id}`;
  const scopeName =
    row.scopeType?.canonicalScopeType?.displayName ??
    row.scopeType?.name ??
    "Unknown";
  return `anon:${row.building}|${row.level}|${scopeName}|${rowIndex}`;
}

function accumulateUnit(acc: QtyAcc, bucket: ScopeBucketKey): void {
  acc.totalQty += 1;
  acc[bucket] += 1;
}

// ─── Level key helper ─────────────────────────────────────────────────────────

/**
 * Natural sort for level strings — handles "Level 2", "Level 10", plain numbers, etc.
 */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

// ─── Main exports ─────────────────────────────────────────────────────────────

export function buildLevelScopeReport(rows: LevelScopeReportRow[]): LevelScopeReportData {
  // Determine whether multiple buildings are in use
  const buildingSet = new Set(rows.map((r) => r.building.trim()).filter(Boolean));
  const multiBuilding = buildingSet.size > 1;
  // Fallback name for rows with no building value
  const fallbackBuilding = buildingSet.size === 1 ? Array.from(buildingSet)[0] : "Building";

  // Accumulator maps (unit counts — one per project row)
  const cellAcc = new Map<string, Map<string, QtyAcc>>(); // levelKey → scopeName → acc
  const scopeAcc = new Map<string, QtyAcc>();             // scopeName → acc
  const grandAcc = makeAcc();
  const levelToBuildingMap = new Map<string, string>();   // levelKey → building name
  /** levelKey → unitKey → scopeName → verified */
  const unitScopeVerified = new Map<string, Map<string, Map<string, boolean>>>();
  /** levelKey → set of unit keys on that level */
  const unitsOnLevel = new Map<string, Set<string>>();

  rows.forEach((row, rowIndex) => {
    const lk = buildLevelKey(row.building, row.level, multiBuilding);
    const buildingName = row.building.trim() || fallbackBuilding;
    if (!levelToBuildingMap.has(lk)) levelToBuildingMap.set(lk, buildingName);
    const scopeName =
      row.scopeType?.canonicalScopeType?.displayName ??
      row.scopeType?.name ??
      "Unknown";

    const bucket = classifyRowUnit(row);
    const unitKey = rowUnitKey(row, rowIndex);
    const verified = isRowVerifiedComplete(row);

    if (!unitsOnLevel.has(lk)) unitsOnLevel.set(lk, new Set());
    unitsOnLevel.get(lk)!.add(unitKey);

    if (!unitScopeVerified.has(lk)) unitScopeVerified.set(lk, new Map());
    const byUnit = unitScopeVerified.get(lk)!;
    if (!byUnit.has(unitKey)) byUnit.set(unitKey, new Map());
    byUnit.get(unitKey)!.set(scopeName, verified);

    const contributeUnit = (acc: QtyAcc) => accumulateUnit(acc, bucket);

    // cell
    if (!cellAcc.has(lk)) cellAcc.set(lk, new Map());
    const byScope = cellAcc.get(lk)!;
    if (!byScope.has(scopeName)) byScope.set(scopeName, makeAcc());
    contributeUnit(byScope.get(scopeName)!);

    // scope total
    if (!scopeAcc.has(scopeName)) scopeAcc.set(scopeName, makeAcc());
    contributeUnit(scopeAcc.get(scopeName)!);

    // grand total
    contributeUnit(grandAcc);
  });

  // Build sorted output arrays
  const levels = Array.from(cellAcc.keys()).sort(naturalCompare);
  const scopeSet = new Set<string>();
  for (const byScope of cellAcc.values()) {
    for (const name of byScope.keys()) scopeSet.add(name);
  }
  const scopes = Array.from(scopeSet).sort(naturalCompare);

  const data: LevelScopeReportData["data"] = {};
  for (const lk of levels) {
    data[lk] = {};
    const byScope = cellAcc.get(lk)!;
    for (const scope of scopes) {
      const acc = byScope.get(scope);
      if (acc) {
        data[lk][scope] = {
          pct: toPct(acc),
          subPct: toSubPct(acc),
          installedQty: acc.installedQty,
          totalQty: acc.totalQty,
          notStartedQty: acc.notStartedQty,
          stagingQty: acc.stagingQty,
          assemblyQty: acc.assemblyQty,
          installInProgressQty: acc.installInProgressQty,
          installCompleteSubQty: acc.installCompleteSubQty,
        };
      }
    }
  }

  const levelOverallUnits: LevelScopeReportData["levelOverallUnits"] = {};
  const overallByLevel: Record<string, number> = {};
  for (const lk of levels) {
    const unitKeys = unitsOnLevel.get(lk) ?? new Set<string>();
    const scopeByUnit = unitScopeVerified.get(lk) ?? new Map();
    let installedQty = 0;
    for (const uk of unitKeys) {
      const scopesForUnit = scopeByUnit.get(uk);
      if (scopesForUnit && [...scopesForUnit.values()].every(Boolean)) {
        installedQty += 1;
      }
    }
    const totalQty = unitKeys.size;
    levelOverallUnits[lk] = { installedQty, totalQty };
    overallByLevel[lk] =
      totalQty === 0 ? 0 : Math.round((installedQty / totalQty) * 100);
  }

  const overallByScope: Record<string, number> = {};
  for (const [scope, acc] of scopeAcc) overallByScope[scope] = toPct(acc);

  const levelToBuilding: Record<string, string> = {};
  for (const [lk, b] of levelToBuildingMap) levelToBuilding[lk] = b;

  const buildings = Array.from(new Set(Object.values(levelToBuilding))).sort(naturalCompare);

  return {
    levels,
    scopes,
    data,
    overallByLevel,
    overallByScope,
    grandTotalPct: toPct(grandAcc),
    levelOverallUnits,
    buildings,
    levelToBuilding,
  };
}

export async function computeLevelScopeReport(
  projectId: string
): Promise<LevelScopeReportData> {
  const rows = await db.projectRow.findMany({
    where: { projectId },
    select: {
      id: true,
      building: true,
      level: true,
      unit: true,
      qty: true,
      scopeStage: true,
      scopeStatus: true,
      inspectionStatus: true,
      scopeType: {
        select: {
          name: true,
          canonicalScopeType: { select: { displayName: true } },
        },
      },
      subScopeInstances: {
        select: {
          qty: true,
          scopeStage: true,
          scopeStatus: true,
          inspectionStatus: true,
        },
      },
    },
  });

  return buildLevelScopeReport(
    rows.map((row) => ({
      ...row,
      unit: row.unit ?? undefined,
      qty: row.qty !== null ? Number(row.qty) : null,
      subScopeInstances: row.subScopeInstances.map((inst) => ({
        ...inst,
        qty: inst.qty !== null ? Number(inst.qty) : null,
      })),
    }))
  );
}
