import { db } from "@/lib/db";
import { computeOverviewStats, type RowForStats } from "@/lib/overview-stats";
import type { FieldDailyReportProgressSnapshot } from "@/lib/field-daily-report/types";

async function loadStatsRows(projectId: string): Promise<RowForStats[]> {
  const dbRows = await db.projectRow.findMany({
    where: { projectId },
    select: {
      qty: true,
      scopeStage: true,
      scopeStatus: true,
      scopeType: { select: { name: true } },
      clearInspections: { where: { deletedAt: null }, select: { status: true } },
      subScopeInstances: {
        select: { qty: true, scopeStage: true, scopeStatus: true },
      },
    },
  });

  return dbRows.map((row) => ({
    qty: row.qty !== null ? Number(row.qty) : null,
    scopeStage: row.scopeStage,
    scopeStatus: row.scopeStatus,
    scopeType: row.scopeType,
    clearInspections: row.clearInspections,
    subScopeInstances: row.subScopeInstances.map((inst) => ({
      qty: inst.qty !== null ? Number(inst.qty) : null,
      scopeStage: inst.scopeStage,
      scopeStatus: inst.scopeStatus,
    })),
  }));
}

/** Attach live project % complete and estimated day delta to a progress snapshot. */
export async function enrichProgressWithProjectMetrics(
  projectId: string,
  progress: FieldDailyReportProgressSnapshot,
): Promise<FieldDailyReportProgressSnapshot> {
  const rows = await loadStatsRows(projectId);
  const stats = computeOverviewStats(rows);
  const totalQty = stats.overall.totalQty;
  const pctComplete = stats.overall.pct;

  let pctCompleteDelta = 0;
  if (totalQty > 0 && progress.installCompleteQtyToday > 0) {
    pctCompleteDelta = Math.round((progress.installCompleteQtyToday / totalQty) * 100);
    if (pctCompleteDelta === 0 && progress.installCompleteQtyToday > 0) {
      pctCompleteDelta = 1;
    }
  }

  const pctCompleteAtStartOfDay = Math.max(0, pctComplete - pctCompleteDelta);

  return {
    ...progress,
    pctComplete,
    pctCompleteDelta,
    pctCompleteAtStartOfDay,
    totalScopeQty: totalQty,
  };
}
