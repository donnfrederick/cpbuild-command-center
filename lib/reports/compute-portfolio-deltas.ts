import type { ActivityLog } from "@prisma/client";
import {
  buildLevelKey,
  buildLevelScopeReport,
  scopeDisplayName,
  type LevelScopeReportRow,
} from "@/lib/level-scope-report";
import type { PortfolioProgressDbRow } from "@/lib/reports/compute-portfolio-progress";
import { mapDbRowsToReportRows } from "@/lib/reports/compute-portfolio-progress";

type Stage = string | null;
type Status = string | null;

interface TrackableState {
  row: PortfolioProgressDbRow;
  scopeName: string;
  qty: number;
  stage: Stage;
  status: Status;
  key: string;
  levelKey: string;
}

export interface ScopeDelta {
  verifiedDelta: number | null;
  verifiedUnitDelta: number | null;
  subDelta: number | null;
  subUnitDelta: number | null;
}

export interface CellDelta {
  verifiedDelta: number | null;
  verifiedUnitDelta: number | null;
  subDelta: number | null;
  subUnitDelta: number | null;
}

export interface PortfolioProgressDeltaResult {
  startReportRows: LevelScopeReportRow[];
  scopeDeltas: Record<string, ScopeDelta>;
  cellDeltas: Record<string, CellDelta>;
  updatedUnitKeys: Set<string>;
  verifiedOnByUnitKey: Map<string, string>;
  startedOnByCell: Map<string, string>;
  lastUpdatedOnByCell: Map<string, string>;
  completedOnByCell: Map<string, string>;
}

function isVerifiedComplete(stage: Stage, status: Status): boolean {
  return stage === "INSTALL" && status === "COMPLETE";
}

function isSubComplete(stage: Stage, status: Status): boolean {
  return stage === "INSTALL" && status === "PENDING_VERIFICATION";
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildTrackables(
  dbRows: PortfolioProgressDbRow[],
  multiBuilding: boolean,
): TrackableState[] {
  const trackables: TrackableState[] = [];
  for (const row of dbRows) {
    const lk = buildLevelKey(row.building, row.level, multiBuilding);
    if (row.subScopeInstances.length > 0) {
      for (const inst of row.subScopeInstances) {
        trackables.push({
          row,
          scopeName: scopeDisplayName(row.scopeType),
          qty: inst.qty ?? 1,
          stage: inst.scopeStage,
          status: inst.scopeStatus,
          key: `inst:${inst.id}`,
          levelKey: lk,
        });
      }
    } else {
      trackables.push({
        row,
        scopeName: scopeDisplayName(row.scopeType),
        qty: row.qty ?? 1,
        stage: row.scopeStage,
        status: row.scopeStatus,
        key: `row:${row.id}`,
        levelKey: lk,
      });
    }
  }
  return trackables;
}

function trackablesToReportRows(trackables: TrackableState[]): LevelScopeReportRow[] {
  const byRowId = new Map<string, LevelScopeReportRow>();

  for (const t of trackables) {
    if (!byRowId.has(t.row.id)) {
      byRowId.set(t.row.id, {
        id: t.row.id,
        building: t.row.building,
        level: t.row.level,
        unit: t.row.unit,
        qty: t.row.qty,
        scopeStage: null,
        scopeStatus: null,
        scopeType: t.row.scopeType,
        installer: t.row.installer,
        unifierSubId: t.row.unifierSubId,
        subScopeInstances: [],
      });
    }
    const reportRow = byRowId.get(t.row.id)!;
    if (t.key.startsWith("inst:")) {
      const instId = t.key.slice(5);
      const existing = reportRow.subScopeInstances.find((i) => i.id === instId);
      if (existing) {
        existing.scopeStage = t.stage;
        existing.scopeStatus = t.status;
        existing.qty = t.qty;
      } else {
        reportRow.subScopeInstances.push({
          id: instId,
          qty: t.qty,
          scopeStage: t.stage,
          scopeStatus: t.status,
          subScope: { name: t.scopeName },
        });
      }
    } else {
      reportRow.scopeStage = t.stage;
      reportRow.scopeStatus = t.status;
      reportRow.qty = t.qty;
    }
  }

  return Array.from(byRowId.values());
}

function findTrackablesByUnitRef(
  trackables: TrackableState[],
  building: string,
  level: string,
  unit: string,
): TrackableState[] {
  return trackables.filter(
    (t) =>
      t.row.building === building &&
      t.row.level === level &&
      t.row.unit === unit,
  );
}

interface ParsedEvent {
  createdAt: Date;
  kind: "row" | "instance" | "bulk_updated" | "bulk_undone";
  rowId?: string;
  instanceId?: string;
  fromStage?: Stage;
  fromStatus?: Status;
  toStage?: Stage;
  toStatus?: Status;
  unitRefs?: { building: string; level: string; unit: string }[];
  bulkStage?: Stage;
  bulkStatus?: Status;
}

function parseActivityEvent(log: ActivityLog): ParsedEvent | null {
  const meta = log.metadata as Record<string, unknown>;
  const createdAt = log.createdAt;

  if (log.eventType === "SCOPE_STATUS_UPDATED") {
    return {
      createdAt,
      kind: "row",
      rowId: String(meta.rowId ?? ""),
      fromStage: (meta.fromStage as Stage) ?? null,
      fromStatus: (meta.fromStatus as Status) ?? null,
      toStage: (meta.toStage as Stage) ?? null,
      toStatus: (meta.toStatus as Status) ?? null,
    };
  }

  if (log.eventType === "SUB_SCOPE_INSTANCE_UPDATED") {
    return {
      createdAt,
      kind: "instance",
      instanceId: String(meta.instanceId ?? ""),
      fromStage: (meta.fromStage as Stage) ?? null,
      fromStatus: (meta.fromStatus as Status) ?? null,
      toStage: (meta.toStage as Stage) ?? null,
      toStatus: (meta.toStatus as Status) ?? null,
    };
  }

  if (log.eventType === "SCOPE_STATUS_BULK_UPDATED") {
    const unitRefs = Array.isArray(meta.unitRefs)
      ? (meta.unitRefs as { building: string; level: string; unit: string }[])
      : [];
    return {
      createdAt,
      kind: "bulk_updated",
      unitRefs,
      bulkStage: (meta.scopeStage as Stage) ?? null,
      bulkStatus: (meta.scopeStatus as Status) ?? null,
    };
  }

  if (log.eventType === "SCOPE_STATUS_BULK_UNDONE") {
    const unitRefs = Array.isArray(meta.unitRefs)
      ? (meta.unitRefs as { building: string; level: string; unit: string }[])
      : [];
    return { createdAt, kind: "bulk_undone", unitRefs };
  }

  return null;
}

function applyReverseEvent(trackables: TrackableState[], event: ParsedEvent): void {
  if (event.kind === "row" && event.rowId) {
    for (const t of trackables) {
      if (t.key === `row:${event.rowId}`) {
        t.stage = event.fromStage ?? null;
        t.status = event.fromStatus ?? null;
      }
    }
    return;
  }

  if (event.kind === "instance" && event.instanceId) {
    for (const t of trackables) {
      if (t.key === `inst:${event.instanceId}`) {
        t.stage = event.fromStage ?? null;
        t.status = event.fromStatus ?? null;
      }
    }
    return;
  }

  if (event.kind === "bulk_updated" && event.unitRefs) {
    const bulkStage = event.bulkStage ?? null;
    const bulkStatus = event.bulkStatus ?? null;
    for (const ref of event.unitRefs) {
      for (const t of findTrackablesByUnitRef(trackables, ref.building, ref.level, ref.unit)) {
        if (t.stage !== bulkStage || t.status !== bulkStatus) continue;
        // Bulk activity metadata has no per-unit fromStage/fromStatus — approximate the
        // most common path (in-progress → bulk target). Already-complete units that
        // were re-touched by bulk may still reconstruct incorrectly until metadata
        // captures prior state (see bulk-status route).
        if (bulkStatus === "COMPLETE" || bulkStatus === "PENDING_VERIFICATION") {
          t.stage = bulkStage ?? t.stage;
          t.status = "IN_PROGRESS";
        } else if (bulkStatus === "IN_PROGRESS" || bulkStatus === "BLOCKED") {
          t.stage = bulkStage ?? t.stage;
          t.status = "NOT_STARTED";
        } else {
          t.stage = null;
          t.status = "NOT_STARTED";
        }
      }
    }
  }
}

function applyForwardEvent(trackables: TrackableState[], event: ParsedEvent): void {
  if (event.kind === "row" && event.rowId) {
    for (const t of trackables) {
      if (t.key === `row:${event.rowId}`) {
        t.stage = event.toStage ?? null;
        t.status = event.toStatus ?? null;
      }
    }
    return;
  }

  if (event.kind === "instance" && event.instanceId) {
    for (const t of trackables) {
      if (t.key === `inst:${event.instanceId}`) {
        t.stage = event.toStage ?? null;
        t.status = event.toStatus ?? null;
      }
    }
    return;
  }

  if (event.kind === "bulk_updated" && event.unitRefs) {
    for (const ref of event.unitRefs) {
      for (const t of findTrackablesByUnitRef(trackables, ref.building, ref.level, ref.unit)) {
        t.stage = event.bulkStage ?? null;
        t.status = event.bulkStatus ?? null;
      }
    }
  }
}

function countTransition(
  fromStage: Stage,
  fromStatus: Status,
  toStage: Stage,
  toStatus: Status,
): { verified: number; sub: number; updated: boolean } {
  const wasVerified = isVerifiedComplete(fromStage, fromStatus);
  const nowVerified = isVerifiedComplete(toStage, toStatus);
  const wasSub = isSubComplete(fromStage, fromStatus);
  const nowSub = isSubComplete(toStage, toStatus);

  let verified = 0;
  let sub = 0;
  // Unit deltas count locations (one per trackable), matching level-scope x/y display — not qty.
  if (!wasVerified && nowVerified) verified += 1;
  if (wasVerified && !nowVerified) verified -= 1;
  if (!wasSub && nowSub) sub += 1;
  if (wasSub && !nowSub) sub -= 1;

  return { verified, sub, updated: verified !== 0 || sub !== 0 };
}

function subPctForScope(scopeName: string, report: ReturnType<typeof buildLevelScopeReport>): number {
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

function pctDeltaOrNull(current: number, start: number): number | null {
  const d = current - start;
  return d === 0 ? null : d;
}

function sumScopeUnitDelta(
  scopeName: string,
  deltaMap: Map<string, number>,
  dbRows: LevelScopeReportRow[],
  _multiBuilding: boolean,
): number | null {
  let sum = 0;
  let any = false;
  for (const row of dbRows) {
    if (row.subScopeInstances.length > 0) {
      const name = scopeDisplayName(row.scopeType);
      if (name !== scopeName) continue;
      for (const inst of row.subScopeInstances) {
        const key = inst.id ? `inst:${inst.id}` : null;
        if (key && deltaMap.has(key)) {
          sum += deltaMap.get(key)!;
          any = true;
        }
      }
    } else {
      const name = scopeDisplayName(row.scopeType);
      if (name !== scopeName) continue;
      const key = row.id ? `row:${row.id}` : null;
      if (key && deltaMap.has(key)) {
        sum += deltaMap.get(key)!;
        any = true;
      }
    }
  }
  return any ? sum : null;
}

function sumCellUnitDelta(
  levelKey: string,
  scopeName: string,
  deltaMap: Map<string, number>,
  dbRows: LevelScopeReportRow[],
  multiBuilding: boolean,
): number | null {
  let sum = 0;
  let any = false;
  for (const row of dbRows) {
    const lk = buildLevelKey(row.building, row.level, multiBuilding);
    if (lk !== levelKey) continue;
    if (row.subScopeInstances.length > 0) {
      const name = scopeDisplayName(row.scopeType);
      if (name !== scopeName) continue;
      for (const inst of row.subScopeInstances) {
        const key = inst.id ? `inst:${inst.id}` : null;
        if (key && deltaMap.has(key)) {
          sum += deltaMap.get(key)!;
          any = true;
        }
      }
    } else {
      const name = scopeDisplayName(row.scopeType);
      if (name !== scopeName) continue;
      const key = row.id ? `row:${row.id}` : null;
      if (key && deltaMap.has(key)) {
        sum += deltaMap.get(key)!;
        any = true;
      }
    }
  }
  return any ? sum : null;
}

function aggregateDeltas(
  currentRows: LevelScopeReportRow[],
  startRows: LevelScopeReportRow[],
  unitVerifiedDelta: Map<string, number>,
  unitSubDelta: Map<string, number>,
  multiBuilding: boolean,
): { scopeDeltas: Record<string, ScopeDelta>; cellDeltas: Record<string, CellDelta> } {
  const current = buildLevelScopeReport(currentRows);
  const start = buildLevelScopeReport(startRows);

  const scopeDeltas: Record<string, ScopeDelta> = {};
  const cellDeltas: Record<string, CellDelta> = {};

  const allScopes = new Set([...current.scopes, ...start.scopes]);
  for (const scopeName of allScopes) {
    const verifiedPct = current.overallByScope[scopeName] ?? 0;
    const startVerified = start.overallByScope[scopeName] ?? 0;
    const subPct = subPctForScope(scopeName, current);
    const startSub = subPctForScope(scopeName, start);

    scopeDeltas[scopeName] = {
      verifiedDelta: pctDeltaOrNull(verifiedPct, startVerified),
      verifiedUnitDelta: sumScopeUnitDelta(scopeName, unitVerifiedDelta, currentRows, multiBuilding),
      subDelta: pctDeltaOrNull(subPct, startSub),
      subUnitDelta: sumScopeUnitDelta(scopeName, unitSubDelta, currentRows, multiBuilding),
    };
  }

  for (const lk of current.levels) {
    for (const scopeName of current.scopes) {
      const cell = current.data[lk]?.[scopeName];
      const startCell = start.data[lk]?.[scopeName];
      if (!cell) continue;
      const cellKey = `${lk}|${scopeName}`;
      cellDeltas[cellKey] = {
        verifiedDelta: pctDeltaOrNull(cell.pct, startCell?.pct ?? 0),
        verifiedUnitDelta: sumCellUnitDelta(lk, scopeName, unitVerifiedDelta, currentRows, multiBuilding),
        subDelta: pctDeltaOrNull(cell.subPct, startCell?.subPct ?? 0),
        subUnitDelta: sumCellUnitDelta(lk, scopeName, unitSubDelta, currentRows, multiBuilding),
      };
    }
  }

  return { scopeDeltas, cellDeltas };
}

function buildDateMaps(
  allHistory: ActivityLog[],
  trackables: TrackableState[],
): {
  verifiedOnByUnitKey: Map<string, string>;
  startedOnByCell: Map<string, string>;
  lastUpdatedOnByCell: Map<string, string>;
  completedOnByCell: Map<string, string>;
} {
  const verifiedOnByUnitKey = new Map<string, string>();
  const startedOnByCell = new Map<string, string>();
  const lastUpdatedOnByCell = new Map<string, string>();
  const completedOnByCell = new Map<string, string>();
  const startedKeys = new Set<string>();

  for (const log of allHistory) {
    const event = parseActivityEvent(log);
    if (!event) continue;
    const date = toIsoDate(log.createdAt);

    const applyStartComplete = (
      t: TrackableState,
      fromStage: Stage,
      fromStatus: Status,
      toStage: Stage,
      toStatus: Status,
    ) => {
      const cellKey = `${t.levelKey}|${t.scopeName}`;
      // Track most recent activity for any status change (ascending order → last write wins)
      lastUpdatedOnByCell.set(cellKey, date);
      const wasNotStarted =
        !fromStage ||
        fromStatus === "NOT_STARTED" ||
        (fromStage === "STAGING" && fromStatus === "NOT_STARTED");
      const nowStarted = Boolean(toStage && !(toStage === "STAGING" && toStatus === "NOT_STARTED"));
      if (wasNotStarted && nowStarted && !startedKeys.has(cellKey)) {
        startedOnByCell.set(cellKey, date);
        startedKeys.add(cellKey);
      }
      if (isVerifiedComplete(toStage, toStatus)) {
        verifiedOnByUnitKey.set(t.key, date);
        completedOnByCell.set(cellKey, date);
      }
    };

    if (event.kind === "row" && event.rowId) {
      const t = trackables.find((x) => x.key === `row:${event.rowId}`);
      if (t) {
        applyStartComplete(
          t,
          event.fromStage ?? null,
          event.fromStatus ?? null,
          event.toStage ?? null,
          event.toStatus ?? null,
        );
      }
    } else if (event.kind === "instance" && event.instanceId) {
      const t = trackables.find((x) => x.key === `inst:${event.instanceId}`);
      if (t) {
        applyStartComplete(
          t,
          event.fromStage ?? null,
          event.fromStatus ?? null,
          event.toStage ?? null,
          event.toStatus ?? null,
        );
      }
    } else if (event.kind === "bulk_updated" && event.unitRefs) {
      for (const ref of event.unitRefs) {
        for (const t of findTrackablesByUnitRef(trackables, ref.building, ref.level, ref.unit)) {
          applyStartComplete(
            t,
            null,
            "NOT_STARTED",
            event.bulkStage ?? null,
            event.bulkStatus ?? null,
          );
        }
      }
    }
  }

  return { verifiedOnByUnitKey, startedOnByCell, lastUpdatedOnByCell, completedOnByCell };
}

export function computePortfolioDeltas(
  dbRows: PortfolioProgressDbRow[],
  periodEvents: ActivityLog[],
  allHistoryEvents: ActivityLog[],
): PortfolioProgressDeltaResult {
  const buildingSet = new Set(dbRows.map((r) => r.building.trim()).filter(Boolean));
  const multiBuilding = buildingSet.size > 1;

  const currentTrackables = buildTrackables(dbRows, multiBuilding);
  const startTrackables = currentTrackables.map((t) => ({ ...t, row: t.row }));

  const parsedPeriod = periodEvents
    .map(parseActivityEvent)
    .filter((e): e is ParsedEvent => e !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  for (const event of parsedPeriod) {
    applyReverseEvent(startTrackables, event);
  }

  const forwardTrackables = startTrackables.map((t) => ({ ...t, row: t.row }));
  const forwardEvents = [...parsedPeriod].reverse();
  const unitVerifiedDelta = new Map<string, number>();
  const unitSubDelta = new Map<string, number>();
  const updatedUnitKeys = new Set<string>();

  for (const event of forwardEvents) {
    if (event.kind === "row" && event.rowId) {
      const t = forwardTrackables.find((x) => x.key === `row:${event.rowId}`);
      if (t) {
        const { verified, sub, updated } = countTransition(
          t.stage,
          t.status,
          event.toStage ?? null,
          event.toStatus ?? null,
        );
        if (verified !== 0) unitVerifiedDelta.set(t.key, (unitVerifiedDelta.get(t.key) ?? 0) + verified);
        if (sub !== 0) unitSubDelta.set(t.key, (unitSubDelta.get(t.key) ?? 0) + sub);
        if (updated) updatedUnitKeys.add(t.key);
      }
    } else if (event.kind === "instance" && event.instanceId) {
      const t = forwardTrackables.find((x) => x.key === `inst:${event.instanceId}`);
      if (t) {
        const { verified, sub, updated } = countTransition(
          t.stage,
          t.status,
          event.toStage ?? null,
          event.toStatus ?? null,
        );
        if (verified !== 0) unitVerifiedDelta.set(t.key, (unitVerifiedDelta.get(t.key) ?? 0) + verified);
        if (sub !== 0) unitSubDelta.set(t.key, (unitSubDelta.get(t.key) ?? 0) + sub);
        if (updated) updatedUnitKeys.add(t.key);
      }
    } else if (event.kind === "bulk_updated" && event.unitRefs) {
      for (const ref of event.unitRefs) {
        for (const t of findTrackablesByUnitRef(forwardTrackables, ref.building, ref.level, ref.unit)) {
          const { verified, sub, updated } = countTransition(
            t.stage,
            t.status,
            event.bulkStage ?? null,
            event.bulkStatus ?? null,
          );
          if (verified !== 0) unitVerifiedDelta.set(t.key, (unitVerifiedDelta.get(t.key) ?? 0) + verified);
          if (sub !== 0) unitSubDelta.set(t.key, (unitSubDelta.get(t.key) ?? 0) + sub);
          if (updated) updatedUnitKeys.add(t.key);
        }
      }
    } else if (event.kind === "bulk_undone" && event.unitRefs) {
      // Undo metadata only lists unitRefs — mark affected keys so hasChangesInPeriod /
      // updatedThisPeriod reflect bulk undo activity even without per-unit to/from.
      for (const ref of event.unitRefs) {
        for (const t of findTrackablesByUnitRef(forwardTrackables, ref.building, ref.level, ref.unit)) {
          updatedUnitKeys.add(t.key);
        }
      }
    }

    applyForwardEvent(forwardTrackables, event);
  }

  const currentReportRows = mapDbRowsToReportRows(dbRows);
  const startReportRows = trackablesToReportRows(startTrackables);
  const { scopeDeltas, cellDeltas } = aggregateDeltas(
    currentReportRows,
    startReportRows,
    unitVerifiedDelta,
    unitSubDelta,
    multiBuilding,
  );

  const historySorted = [...allHistoryEvents].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const dateMaps = buildDateMaps(historySorted, currentTrackables);

  return {
    startReportRows,
    scopeDeltas,
    cellDeltas,
    updatedUnitKeys,
    verifiedOnByUnitKey: dateMaps.verifiedOnByUnitKey,
    startedOnByCell: dateMaps.startedOnByCell,
    lastUpdatedOnByCell: dateMaps.lastUpdatedOnByCell,
    completedOnByCell: dateMaps.completedOnByCell,
  };
}
