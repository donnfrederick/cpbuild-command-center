import { db } from "@/lib/db";
import { reconcileScopeRowInspectionStatus } from "@/lib/inspections/reconcile-scope-inspection-status";

/** Hard-delete all entities tagged with a test seed batch. Does not revert auto-promoted UPM fields. */
export async function removeTestSeedBatch(batchId: string): Promise<void> {
  const [submissions, clears] = await Promise.all([
    db.inspectionSubmission.findMany({
      where: { testSeedBatchId: batchId },
      select: { scopeRowId: true },
    }),
    db.clearInspection.findMany({
      where: { testSeedBatchId: batchId },
      select: { rowId: true },
    }),
  ]);

  const affectedRowIds = [
    ...submissions.map((s) => s.scopeRowId).filter((id): id is string => id != null),
    ...clears.map((c) => c.rowId),
  ];

  await db.$transaction([
    db.mediaAttachment.deleteMany({ where: { testSeedBatchId: batchId } }),
    db.issueComment.deleteMany({ where: { testSeedBatchId: batchId } }),
    db.observationComment.deleteMany({ where: { testSeedBatchId: batchId } }),
    db.clearInspection.deleteMany({ where: { testSeedBatchId: batchId } }),
    db.inspectionSubmission.deleteMany({ where: { testSeedBatchId: batchId } }),
    db.projectIssue.deleteMany({ where: { testSeedBatchId: batchId } }),
    db.projectObservation.deleteMany({ where: { testSeedBatchId: batchId } }),
    db.activityLog.deleteMany({ where: { testSeedBatchId: batchId } }),
    db.testSeedBatch.delete({ where: { id: batchId } }),
  ]);

  await reconcileScopeRowInspectionStatus(affectedRowIds);
}
