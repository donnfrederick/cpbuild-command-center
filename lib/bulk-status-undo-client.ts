/** Payload for POST /api/projects/[id]/units/bulk-status/undo — matches client snapshot + API. */
export interface BulkStatusUndoPayload {
  revertRows: BulkStatusRevertRow[];
  revertInstances: BulkStatusRevertRow[];
}

export interface BulkStatusRevertRow {
  id: string;
  scopeStage: "STAGING" | "ASSEMBLY" | "INSTALL" | null;
  scopeStatus: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "PENDING_VERIFICATION" | "COMPLETE";
  inspectionStatus: "READY" | "PASSED" | "FAILED" | null;
}

/**
 * Reverts bulk-applied scope statuses via POST .../bulk-status/undo (batched).
 */
export async function performBulkStatusUndo(
  projectId: string,
  payload: BulkStatusUndoPayload
): Promise<void> {
  const { revertRows, revertInstances } = payload;
  if (revertRows.length === 0 && revertInstances.length === 0) return;

  for (let i = 0; i < revertRows.length; i += 500) {
    const batch = revertRows.slice(i, i + 500);
    const res = await fetch(`/api/projects/${projectId}/units/bulk-status/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revertRows: batch, revertInstances: [] }),
    });
    if (!res.ok) throw new Error(`undo rows ${res.status}`);
  }
  for (let i = 0; i < revertInstances.length; i += 500) {
    const batch = revertInstances.slice(i, i + 500);
    const res = await fetch(`/api/projects/${projectId}/units/bulk-status/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revertRows: [], revertInstances: batch }),
    });
    if (!res.ok) throw new Error(`undo instances ${res.status}`);
  }
}
