/**
 * IndexedDB store for inspection submissions that were captured offline
 * (or that failed to sync due to a network error).
 *
 * Schema
 * ──────
 * DB name : cpb-command-center
 * Store   : pendingInspections
 *   localId       – client-generated UUID (primary key)
 *   formId        – references the Form record
 *   formVersionId – optional; id of the FormVersion used
 *   templateSnapshot – full FormTemplate JSON captured at submit time
 *   categoryOverride – optional category override for special submission flows
 *   projectId, unitId, scopeRowId, scopeTypeCode – routing keys
 *   submittedByName – display name
 *   outcome       – "PASS" | "FAIL" | "COMPLETE"
 *   deficiencyCount – integer
 *   payload       – answer map
 *   submittedAt   – ISO timestamp (set locally at capture time)
 *   synced        – false until the server returns a 201
 *   serverId      – set to the server-assigned id after sync succeeds
 *   failedAt      – ISO timestamp of the last sync attempt that errored;
 *                   null when synced or never attempted
 */

import type { ActivityClientLocation } from "@/lib/activity/activity-location-schema";
import { getCpbInspectionDb, runCpbInspectionDbTask } from "@/lib/inspections/inspectionIndexedDb";
import type { SyncErrorAttempt, SyncErrorAttemptInput } from "@/lib/inspections/sync-error-history";

// Re-export for tests that open the shared DB.
export type { SyncErrorAttempt, SyncErrorAttemptInput } from "@/lib/inspections/sync-error-history";
export type { CpbInspectionSchema } from "@/lib/inspections/inspectionIndexedDb";

export interface PendingInspection {
  localId: string;
  formId: string;
  formVersionId?: string;
  templateSnapshot: unknown;
  categoryOverride?: "CALIBRATION_INSPECTION";
  /** Clear submission id being calibrated — sent with categoryOverride. */
  calibratedAgainstSubmissionId?: string;
  projectId: string;
  unitId: string;
  scopeRowId?: string;
  scopeTypeCode?: string;
  submittedByName: string;
  outcome: "PASS" | "FAIL" | "COMPLETE";
  deficiencyCount: number;
  payload: Record<string, unknown>;
  submittedAt: string;
  /** false until the API returns 201 */
  synced: boolean;
  /** Server-assigned id; populated after sync */
  serverId?: string;
  /** When set, flush uses PUT to update this submission instead of POST create. */
  updateServerId?: string;
  /** ISO timestamp of the most recent failed sync attempt */
  failedAt?: string;
  /** Number of failed sync attempts; used to cap background retries. */
  syncAttempts?: number;
  /** Append-only history of each failed sync attempt. */
  syncErrorHistory?: SyncErrorAttempt[];
  /** Mirror of the latest syncErrorHistory entry message — card summary. */
  lastSyncError?: string;
  /** GPS captured at submit/resubmit time — sent with sync POST/PUT for activity log. */
  activityLocation?: ActivityClientLocation;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Persist a new (unsynced) submission locally. Returns the localId. */
export async function queueInspection(
  data: Omit<PendingInspection, "localId" | "synced" | "serverId" | "failedAt">
): Promise<string> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const localId = crypto.randomUUID();
    await db.put("pendingInspections", {
      ...data,
      localId,
      synced: false,
    });
    return localId;
  });
}

/** All pending (unsynced) submissions for a scope row, newest first. */
export async function getPendingByScope(
  scopeRowId: string
): Promise<PendingInspection[]> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const all = await db.getAllFromIndex("pendingInspections", "by_scope", scopeRowId);
    return all
      .filter((r) => !r.synced)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  });
}

/** All pending (unsynced) unit-level submissions for a location ref, newest first. */
export async function getPendingByUnit(
  unitId: string,
  projectId: string,
): Promise<PendingInspection[]> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const all = await db.getAllFromIndex("pendingInspections", "by_unit", unitId);
    return all
      .filter((r) => !r.synced && !r.scopeRowId && r.projectId === projectId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  });
}

/** All pending (unsynced) submissions for a project — used to hydrate grid tiles on load. */
export async function getPendingByProject(projectId: string): Promise<PendingInspection[]> {
  const all = await getAllPending();
  return all
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

/** All unsynced submissions across all scopes (used by the sync flush). */
export async function getAllPending(): Promise<PendingInspection[]> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    // synced is stored as a boolean; IDB indexes them as 0/1 in some engines
    // so we fetch all and filter in JS to be safe.
    const all = await db.getAll("pendingInspections");
    return all.filter((r) => !r.synced);
  });
}

/** Read a pending or already-synced row by local id (for calibration target resolution). */
export async function getInspectionRecordByLocalId(
  localId: string,
): Promise<PendingInspection | undefined> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    return (await db.get("pendingInspections", localId)) ?? undefined;
  });
}

/** After a clear syncs, point queued calibrations at the server submission id. */
export async function remapCalibrationTargetsAfterSync(
  clearLocalId: string,
  clearServerId: string,
): Promise<number> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const all = await db.getAll("pendingInspections");
    let remapped = 0;
    for (const record of all) {
      if (record.synced) continue;
      if (record.calibratedAgainstSubmissionId !== clearLocalId) continue;
      await db.put("pendingInspections", {
        ...record,
        calibratedAgainstSubmissionId: clearServerId,
      });
      remapped += 1;
    }
    return remapped;
  });
}

/** Mark a queued submission as synced and record the server id. */
export async function markSynced(localId: string, serverId: string): Promise<void> {
  await runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const record = await db.get("pendingInspections", localId);
    if (!record) return;
    await db.put("pendingInspections", { ...record, synced: true, serverId });
  });
  await remapCalibrationTargetsAfterSync(localId, serverId);
}

/** Record a failed sync attempt (keeps the record for retry). Returns new attempt count. */
export async function markFailed(
  localId: string,
  details?: SyncErrorAttemptInput,
): Promise<number> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const record = await db.get("pendingInspections", localId);
    if (!record) return 0;
    const syncAttempts = (record.syncAttempts ?? 0) + 1;
    const recordedAt = new Date().toISOString();
    const attemptEntry: SyncErrorAttempt | undefined = details
      ? {
          attempt: syncAttempts,
          message: details.message,
          ...(details.httpStatus !== undefined ? { httpStatus: details.httpStatus } : {}),
          errorKind: details.errorKind,
          recordedAt,
        }
      : undefined;
    const syncErrorHistory = [
      ...(record.syncErrorHistory ?? []),
      ...(attemptEntry ? [attemptEntry] : []),
    ];
    await db.put("pendingInspections", {
      ...record,
      failedAt: recordedAt,
      syncAttempts,
      syncErrorHistory,
      lastSyncError: attemptEntry?.message ?? record.lastSyncError,
    });
    return syncAttempts;
  });
}

/** Read a single pending record by local id (for activity reporting). */
export async function getPendingByLocalId(localId: string): Promise<PendingInspection | undefined> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const record = await db.get("pendingInspections", localId);
    if (!record || record.synced) return undefined;
    return record;
  });
}

/** Count unsynced submissions across all projects (lightweight poll for UI). */
export async function getPendingInspectionCount(): Promise<number> {
  const pending = await getAllPending();
  return pending.length;
}

/**
 * Reset sync attempt counters so manual "Sync now" / "Retry" can run past the
 * automatic 3-attempt cap (e.g. calibrations stuck for days).
 */
export async function resetSyncAttemptsForManualRetry(): Promise<number> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const all = await db.getAll("pendingInspections");
    let reset = 0;
    for (const record of all) {
      if (record.synced) continue;
      if ((record.syncAttempts ?? 0) > 0) {
        await db.put("pendingInspections", {
          ...record,
          syncAttempts: 0,
        });
        reset += 1;
      }
    }
    return reset;
  });
}

/** Read failed sync attempt count for a queued submission (0 when missing). */
export async function getSyncAttempts(localId: string): Promise<number> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const record = await db.get("pendingInspections", localId);
    return record?.syncAttempts ?? 0;
  });
}

/** Persist resolved payload (e.g. after media upload) so retries stay consistent. */
export async function updatePendingPayload(
  localId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const record = await db.get("pendingInspections", localId);
    if (!record) return;
    await db.put("pendingInspections", { ...record, payload });
  });
}

/** Persist resolved server id for a calibration's clear-inspection target. */
export async function updatePendingCalibrationTarget(
  localId: string,
  calibratedAgainstSubmissionId: string,
): Promise<void> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const record = await db.get("pendingInspections", localId);
    if (!record) return;
    await db.put("pendingInspections", {
      ...record,
      calibratedAgainstSubmissionId,
    });
  });
}

/** Patch outcome / deficiencyCount / payload on a queued submission (edit or retry). */
export async function updatePendingInspection(
  localId: string,
  patch: {
    outcome?: PendingInspection["outcome"];
    deficiencyCount?: number;
    payload?: Record<string, unknown>;
    activityLocation?: ActivityClientLocation;
  },
): Promise<void> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    const record = await db.get("pendingInspections", localId);
    if (!record) return;
    await db.put("pendingInspections", {
      ...record,
      ...(patch.outcome !== undefined ? { outcome: patch.outcome } : {}),
      ...(patch.deficiencyCount !== undefined ? { deficiencyCount: patch.deficiencyCount } : {}),
      ...(patch.payload !== undefined ? { payload: patch.payload } : {}),
      ...(patch.activityLocation !== undefined ? { activityLocation: patch.activityLocation } : {}),
    });
  });
}

/** Remove a queued submission that the server permanently rejected. */
export async function discardInspection(localId: string): Promise<void> {
  return runCpbInspectionDbTask(async () => {
    const db = await getCpbInspectionDb();
    await db.delete("pendingInspections", localId);
  });
}
