import { db } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

/** Outcomes that require a backing submission or clear-inspection record. */
const PHANTOM_INSPECTION_STATUSES = new Set(["PASSED", "FAILED"]);

type ReconcileDb = Pick<
  PrismaClient,
  "projectRow" | "inspectionSubmission" | "clearInspection"
>;

/**
 * Clears scope-row inspectionStatus when no inspection submissions or
 * clear-inspection records remain. READY is preserved (user may have
 * started the gate without submitting a form yet).
 */
export async function reconcileScopeRowInspectionStatus(
  rowIds: string[],
  client: ReconcileDb = db
): Promise<number> {
  const uniqueIds = [...new Set(rowIds.filter(Boolean))];
  if (uniqueIds.length === 0) return 0;

  let cleared = 0;
  for (const rowId of uniqueIds) {
    const row = await client.projectRow.findUnique({
      where: { id: rowId },
      select: { inspectionStatus: true },
    });
    if (!row?.inspectionStatus || !PHANTOM_INSPECTION_STATUSES.has(row.inspectionStatus)) {
      continue;
    }

    const [submissionCount, clearCount] = await Promise.all([
      client.inspectionSubmission.count({ where: { scopeRowId: rowId } }),
      client.clearInspection.count({ where: { rowId, deletedAt: null } }),
    ]);

    if (submissionCount === 0 && clearCount === 0) {
      await client.projectRow.update({
        where: { id: rowId },
        data: { inspectionStatus: null },
      });
      cleared++;
    }
  }
  return cleared;
}

/** Repair every scope row on a project that shows PASSED/FAILED without backing data. */
export async function reconcileProjectInspectionStatuses(
  projectId: string,
  client: ReconcileDb = db
): Promise<{
  clearedRows: number;
  deletedOrphanClears: number;
}> {
  // Remove only active legacy orphan clears (no linked submission). Soft-deleted
  // history rows are preserved — BACKFILL delete can null out inspectionSubmissionId
  // on retired clears via onDelete:SetNull.
  const deletedOrphanClears = await client.clearInspection.deleteMany({
    where: {
      row: { projectId },
      inspectionSubmissionId: null,
      deletedAt: null,
    },
  });

  const rows = await client.projectRow.findMany({
    where: {
      projectId,
      inspectionStatus: { in: ["PASSED", "FAILED"] },
    },
    select: { id: true },
  });
  const clearedRows = await reconcileScopeRowInspectionStatus(
    rows.map((r) => r.id),
    client
  );
  return { clearedRows, deletedOrphanClears: deletedOrphanClears.count };
}
