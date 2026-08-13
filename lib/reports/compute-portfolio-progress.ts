import type { LevelUnitDetailRow } from "@/lib/level-scope-report";
import { buildLevelKey } from "@/lib/level-scope-report-keys";
import {
  buildLevelScopeReport,
  scopeDisplayName,
  type LevelScopeReportRow,
} from "@/lib/level-scope-report";
import type {
  BuildingDetailSnapshot,
  LevelDetailSnapshot,
  LevelScopeCellSnapshot,
  LevelUnitDetailSnapshot,
  PortfolioProjectSnapshot,
  ScopeProgressSnapshot,
} from "@/lib/reports/portfolio-progress-types";
import type { PortfolioProgressDeltaResult } from "@/lib/reports/compute-portfolio-deltas";

export interface PortfolioProgressDbRow {
  id: string;
  building: string;
  level: string;
  unit: string;
  qty: number | null;
  scopeStage: string | null;
  scopeStatus: string | null;
  /** QC inspection clearance state. FAILED and READY scopes do not count as verified complete. */
  inspectionStatus: string | null;
  /** True when at least one open ProjectIssue is tagged to this scope row. */
  hasOpenIssue: boolean;
  unifierSubId: string | null;
  scopeType: {
    name: string;
    canonicalScopeType: { displayName: string } | null;
  } | null;
  installer: { name: string } | null;
  subScopeInstances: {
    id: string;
    qty: number | null;
    scopeStage: string | null;
    scopeStatus: string | null;
    /** QC inspection clearance state. FAILED and READY scopes do not count as verified complete. */
    inspectionStatus: string | null;
    /** True when at least one open ProjectIssue is tagged to this sub-scope instance. */
    hasOpenIssue: boolean;
    subScope: { name: string };
  }[];
}

export function mapDbRowsToReportRows(rows: PortfolioProgressDbRow[]): LevelScopeReportRow[] {
  return rows.map((row) => ({
    id: row.id,
    building: row.building,
    level: row.level,
    unit: row.unit,
    qty: row.qty,
    scopeStage: row.scopeStage,
    scopeStatus: row.scopeStatus,
    inspectionStatus: row.inspectionStatus,
    hasOpenIssue: row.hasOpenIssue,
    scopeType: row.scopeType,
    installer: row.installer,
    unifierSubId: row.unifierSubId,
    subScopeInstances: row.subScopeInstances.map((inst) => ({
      id: inst.id,
      qty: inst.qty,
      scopeStage: inst.scopeStage,
      scopeStatus: inst.scopeStatus,
      inspectionStatus: inst.inspectionStatus,
      hasOpenIssue: inst.hasOpenIssue,
      subScope: inst.subScope,
      // subScopeTags not forwarded to LevelScopeReportRow — not needed for qty accumulation
    })),
  }));
}

function subcontractorLabel(row: PortfolioProgressDbRow): string | null {
  if (row.installer?.name) return row.installer.name;
  return null;
}

function unitVerifiedPct(
  stage: string | null,
  status: string | null,
  inspectionStatus?: string | null,
  hasOpenIssue?: boolean,
): number {
  if (stage === "INSTALL" && status === "COMPLETE") {
    if (inspectionStatus === "FAILED" || hasOpenIssue) return 0; // needs rework / has blocker
    if (inspectionStatus === "READY") return 50;                  // inspection pending
    return 100;                                                    // null (not required) or PASSED
  }
  if (stage === "INSTALL" && status === "PENDING_VERIFICATION") return 100;
  if (stage === "INSTALL" && (status === "IN_PROGRESS" || status === "BLOCKED")) return 50;
  return 0;
}

export function buildLevelUnitDetailsFromRows(
  rows: PortfolioProgressDbRow[],
  multiBuilding: boolean,
  updatedUnitKeys: ReadonlySet<string>,
  verifiedOnByUnitKey: ReadonlyMap<string, string>,
): Record<string, LevelUnitDetailRow[]> {
  const byLevel = new Map<string, LevelUnitDetailRow[]>();

  for (const row of rows) {
    const lk = buildLevelKey(row.building, row.level, multiBuilding);
    const parentScope = scopeDisplayName(row.scopeType);
    const sub = subcontractorLabel(row);

    if (row.subScopeInstances.length > 0) {
      for (const inst of row.subScopeInstances) {
        const unitKey = `inst:${inst.id}`;
        // Fall back to parent row's values when the instance has no inspection result of its own.
        const effectiveInspectionStatus = inst.inspectionStatus ?? row.inspectionStatus;
        const effectiveHasOpenIssue = inst.hasOpenIssue || row.hasOpenIssue;
        const detail: LevelUnitDetailRow = {
          unitLabel: row.unit || "—",
          scopeName: parentScope,
          verifiedPct: unitVerifiedPct(inst.scopeStage, inst.scopeStatus, effectiveInspectionStatus, effectiveHasOpenIssue),
          updatedThisPeriod: updatedUnitKeys.has(unitKey),
          subcontractor: sub,
          verifiedOn: verifiedOnByUnitKey.get(unitKey) ?? null,
        };
        if (!byLevel.has(lk)) byLevel.set(lk, []);
        byLevel.get(lk)!.push(detail);
      }
    } else {
      const unitKey = `row:${row.id}`;
      const detail: LevelUnitDetailRow = {
        unitLabel: row.unit || "—",
        scopeName: parentScope,
        verifiedPct: unitVerifiedPct(row.scopeStage, row.scopeStatus, row.inspectionStatus, row.hasOpenIssue),
        updatedThisPeriod: updatedUnitKeys.has(unitKey),
        subcontractor: sub,
        verifiedOn: verifiedOnByUnitKey.get(unitKey) ?? null,
      };
      if (!byLevel.has(lk)) byLevel.set(lk, []);
      byLevel.get(lk)!.push(detail);
    }
  }

  for (const [lk, list] of byLevel) {
    list.sort((a, b) => {
      const u = a.unitLabel.localeCompare(b.unitLabel, "en", { numeric: true });
      if (u !== 0) return u;
      return a.scopeName.localeCompare(b.scopeName);
    });
    byLevel.set(lk, list);
  }

  return Object.fromEntries(byLevel);
}

function scopeSummariesFromReport(
  reportRows: LevelScopeReportRow[],
  deltas: PortfolioProgressDeltaResult,
): ScopeProgressSnapshot[] {
  const current = buildLevelScopeReport(reportRows);
  const start = buildLevelScopeReport(deltas.startReportRows);

  const scopeNames = new Set<string>([...current.scopes, ...start.scopes]);
  const summaries: ScopeProgressSnapshot[] = [];

  for (const scopeName of Array.from(scopeNames).sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
  )) {
    const verifiedPct = current.overallByScope[scopeName] ?? 0;
    const subPct = current.scopes.includes(scopeName)
      ? subPctForScope(scopeName, current)
      : 0;
    const startVerified = start.overallByScope[scopeName] ?? 0;
    const startSub = start.scopes.includes(scopeName) ? subPctForScope(scopeName, start) : 0;

    const scopeDelta = deltas.scopeDeltas[scopeName];
    summaries.push({
      scopeName,
      verifiedPct,
      verifiedDelta: scopeDelta?.verifiedDelta ?? pctDelta(verifiedPct, startVerified),
      verifiedUnitDelta: scopeDelta?.verifiedUnitDelta ?? null,
      subPct,
      subDelta: scopeDelta?.subDelta ?? pctDelta(subPct, startSub),
      subUnitDelta: scopeDelta?.subUnitDelta ?? null,
    });
  }

  return summaries;
}

function subPctForScope(
  scopeName: string,
  report: ReturnType<typeof buildLevelScopeReport>,
): number {
  let subQty = 0;
  let totalQty = 0;
  for (const lk of report.levels) {
    const cell = report.data[lk]?.[scopeName];
    if (!cell) continue;
    subQty += cell.installCompleteSubQty;
    totalQty += cell.totalQty;
  }
  return totalQty === 0 ? 0 : Math.round((subQty / totalQty) * 100);
}

function pctDelta(current: number, start: number): number | null {
  const delta = current - start;
  if (delta === 0) return null;
  return delta;
}

function parseLevelKey(
  levelKey: string,
  levelToBuilding: Readonly<Record<string, string>>,
): { buildingName: string; levelLabel: string } {
  if (levelKey.includes(" › ")) {
    const [buildingName, levelLabel] = levelKey.split(" › ", 2);
    return { buildingName: buildingName!, levelLabel: levelLabel! };
  }
  return {
    buildingName: levelToBuilding[levelKey] ?? "Building",
    levelLabel: levelKey,
  };
}

export function buildPortfolioProjectSnapshot(
  project: {
    id: string;
    name: string;
    unifierPid: string | null;
    projectManagerName: string;
    installManagerName: string | null;
  },
  dbRows: PortfolioProgressDbRow[],
  deltas: PortfolioProgressDeltaResult,
  startedOnByCell: ReadonlyMap<string, string>,
  lastUpdatedOnByCell: ReadonlyMap<string, string>,
  completedOnByCell: ReadonlyMap<string, string>,
): PortfolioProjectSnapshot {
  const reportRows = mapDbRowsToReportRows(dbRows);
  const current = buildLevelScopeReport(reportRows);
  const scopeSummaries = scopeSummariesFromReport(reportRows, deltas);

  // Build sets of cell keys (levelKey|scopeName) that block the finish date:
  //   openIssueCells       — cell has at least one OPEN (pending) issue
  //   failedInspectionCells — cell has at least one unit with inspectionStatus=FAILED
  // The finish date only appears when pct=100 AND neither set contains the cell.
  const multiBuilding = current.buildings.length > 1;
  const openIssueCells = new Set<string>();
  const failedInspectionCells = new Set<string>();
  for (const row of dbRows) {
    const lk = buildLevelKey(row.building, row.level, multiBuilding);
    const scopeName =
      row.scopeType?.canonicalScopeType?.displayName ?? row.scopeType?.name ?? "Unknown";
    const cellKey = `${lk}|${scopeName}`;

    const hasOpenIssueOnRow = row.hasOpenIssue;
    const hasOpenIssueOnSubScope = row.subScopeInstances.some((inst) => inst.hasOpenIssue);
    if (hasOpenIssueOnRow || hasOpenIssueOnSubScope) {
      openIssueCells.add(cellKey);
    }

    if (row.subScopeInstances.length > 0) {
      if (
        row.subScopeInstances.some(
          (inst) => (inst.inspectionStatus ?? row.inspectionStatus) === "FAILED",
        )
      ) {
        failedInspectionCells.add(cellKey);
      }
    } else if (row.inspectionStatus === "FAILED") {
      failedInspectionCells.add(cellKey);
    }
  }

  const buildingMap = new Map<string, Map<string, LevelDetailSnapshot>>();

  for (const lk of current.levels) {
    const { buildingName, levelLabel } = parseLevelKey(lk, current.levelToBuilding);
    if (!buildingMap.has(buildingName)) buildingMap.set(buildingName, new Map());
    const levelMap = buildingMap.get(buildingName)!;

    const cells: LevelScopeCellSnapshot[] = [];
    for (const scopeName of current.scopes) {
      const cell = current.data[lk]?.[scopeName];
      if (!cell) continue;
      const cellKey = `${lk}|${scopeName}`;
      const cellDelta = deltas.cellDeltas[cellKey];
      // Show finish date only when: pct=100 AND no open issues AND no failed inspections
      const isFullyResolved =
        cell.pct >= 100 &&
        !openIssueCells.has(cellKey) &&
        !failedInspectionCells.has(cellKey);
      cells.push({
        scopeName,
        verifiedPct: cell.pct,
        verifiedDelta: cellDelta?.verifiedDelta ?? null,
        verifiedUnitDelta: cellDelta?.verifiedUnitDelta ?? null,
        subPct: cell.subPct,
        subDelta: cellDelta?.subDelta ?? null,
        subUnitDelta: cellDelta?.subUnitDelta ?? null,
        startedOn: startedOnByCell.get(cellKey) ?? null,
        lastUpdatedOn: lastUpdatedOnByCell.get(cellKey) ?? null,
        completedOn: isFullyResolved ? (completedOnByCell.get(cellKey) ?? null) : null,
        totalUnits: cell.totalQty,
      });
    }

    if (cells.length === 0) continue;

    const unitRows = buildLevelUnitDetailsFromRows(
      dbRows.filter((r) => buildLevelKey(r.building, r.level, current.buildings.length > 1) === lk),
      current.buildings.length > 1,
      deltas.updatedUnitKeys,
      deltas.verifiedOnByUnitKey,
    );

    levelMap.set(levelLabel, {
      levelLabel,
      cells,
      units: (unitRows[lk] ?? []).map(
        (u): LevelUnitDetailSnapshot => ({
          unitLabel: u.unitLabel,
          scopeName: u.scopeName,
          verifiedPct: u.verifiedPct,
          updatedThisPeriod: u.updatedThisPeriod,
          subcontractor: u.subcontractor,
          verifiedOn: u.verifiedOn ?? null,
        }),
      ),
    });
  }

  const buildings: BuildingDetailSnapshot[] = Array.from(buildingMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .map(([buildingName, levelMap]) => ({
      buildingName,
      levels: Array.from(levelMap.values()).sort((a, b) =>
        a.levelLabel.localeCompare(b.levelLabel, "en", { numeric: true }),
      ),
    }));

  const hasChangesInPeriod =
    scopeSummaries.some((s) => s.verifiedDelta !== null || s.subDelta !== null) ||
    deltas.updatedUnitKeys.size > 0;

  return {
    id: project.id,
    name: project.name,
    unifierPid: project.unifierPid,
    projectManagerName: project.projectManagerName,
    installManagerName: project.installManagerName,
    hasChangesInPeriod,
    scopeSummaries,
    buildings,
  };
}

export function buildPortfolioListItem(
  project: {
    id: string;
    name: string;
    unifierPid: string | null;
    projectManagerName: string;
    installManagerName: string | null;
  },
  dbRows: PortfolioProgressDbRow[],
  deltas: PortfolioProgressDeltaResult,
): {
  id: string;
  name: string;
  unifierPid: string | null;
  projectManagerName: string;
  installManagerName: string | null;
  hasChangesInPeriod: boolean;
  scopeSummaries: ScopeProgressSnapshot[];
} {
  const reportRows = mapDbRowsToReportRows(dbRows);
  const scopeSummaries = scopeSummariesFromReport(reportRows, deltas);
  const hasChangesInPeriod =
    scopeSummaries.some((s) => s.verifiedDelta !== null || s.subDelta !== null) ||
    deltas.updatedUnitKeys.size > 0;

  return {
    id: project.id,
    name: project.name,
    unifierPid: project.unifierPid,
    projectManagerName: project.projectManagerName,
    installManagerName: project.installManagerName,
    hasChangesInPeriod,
    scopeSummaries,
  };
}

export { portfolioSnapshotToLevelScopeReport } from "@/lib/reports/portfolio-snapshot-to-grid";
