/**
 * Offline-first inspection submissions client.
 *
 * Write path
 * ──────────
 * 1. Queue in IndexedDB immediately (queueInspection → localId).
 * 2. If online, POST to /api/inspection-submissions; on success mark
 *    the IDB record as synced. On failure keep it pending — the
 *    background sync hook will retry on reconnect.
 * 3. Return an optimistic InspectionSubmission built from local data so
 *    the caller can update the UI without waiting for the network.
 *
 * Read path
 * ─────────
 * 1. Fetch from /api/inspection-submissions (already-synced data).
 * 2. Merge in any unsynced IDB records for the same scope so the
 *    inspector sees their offline submissions immediately, with a
 *    "Pending sync" badge.
 * 3. If the network request fails entirely (offline), serve from IDB
 *    only — the inspector can still see what they captured previously.
 */

import type {
  FormPurpose,
  FormTemplate,
  InspectionCategory,
  FormLevel,
} from "@/components/forms/formTypes";
import { enrichSubmissionTemplateSnapshot } from "@/lib/forms/form-purpose-rules";
import { collectActivityLocation } from "@/lib/activity/collect-activity-location";
import { clientSubmissionCategory } from "@/lib/inspections/client-submission-category";
import {
  queueInspection,
  getPendingByScope,
  getPendingByProject,
  getPendingByUnit,
  getPendingByLocalId,
  updatePendingInspection,
  type PendingInspection,
} from "./inspectionOfflineDb";
import { PROJECT_LEVEL_INSPECTION_UNIT_ID } from "./unit-inspection-ref";
import { syncOne } from "./inspection-sync-one";
import { readSnapshotModule } from "@/lib/offline/snapshot-cache";

export {
  InspectionSyncAuthRequiredError,
  InspectionSyncPreservedError,
  InspectionSyncCalibrationPreservedError,
  InspectionSyncExhaustedError,
  InspectionSyncRejectedError,
  syncOne,
} from "./inspection-sync-one";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InspectionOutcome = "PASS" | "FAIL" | "COMPLETE";
export type SubmissionSource = "FORM" | "BACKFILL";

export interface InspectionSubmission {
  id: string;
  /** Null for BACKFILL submissions (no form was used). */
  formId: string | null;
  formNameSnapshot: string;
  categorySnapshot: InspectionCategory;
  level: FormLevel;
  projectId: string;
  unitId: string;
  scopeRowId?: string;
  scopeTypeCode?: string;
  submittedAt: string;
  submittedBy: string;
  /** User id of the inspector who submitted (from clear_inspections or activity log). */
  submittedById?: string | null;
  outcome: InspectionOutcome;
  deficiencyCount: number;
  payload: Record<string, unknown>;
  /** Full FormTemplate snapshot captured at submission time. Empty for BACKFILL. */
  templateSnapshot?: FormTemplate;
  /** Linked form category from API — resolves legacy PRE_INSTALL snapshots on read. */
  formCategory?: InspectionCategory;
  /** Linked form purpose from API — resolves legacy snapshots missing formPurpose. */
  formPurpose?: FormPurpose;
  /** Whether this was submitted via a real form or manually backfilled. */
  source: SubmissionSource;
  /** True when this submission has not yet synced to the server. */
  _pendingSync?: boolean;
  /** localId in IndexedDB — only present for unsynced records. */
  _localId?: string;
}

/** Server PDF export requires a persisted submission id — exclude pending sync rows. */
export function partitionInspectionSubmissionsForPdfExport(
  submissions: InspectionSubmission[],
): { exportable: InspectionSubmission[]; pendingCount: number } {
  const exportable = submissions.filter((s) => s._pendingSync !== true);
  return { exportable, pendingCount: submissions.length - exportable.length };
}

interface ApiSubmission {
  id: string;
  formId: string | null;
  formVersionId: string | null;
  templateSnapshot: unknown;
  projectId: string;
  unitId: string;
  scopeRowId: string | null;
  scopeTypeCode: string | null;
  submittedAt: string;
  clearInspection?: {
    inspectedById: string | null;
    inspectedBy: { id: string; name: string | null } | null;
  } | null;
  form?: {
    category: string;
    name?: string;
    level?: string;
    purpose?: string;
  } | null;
  outcome: "PASS" | "FAIL" | "COMPLETE";
  deficiencyCount: number;
  payload: Record<string, unknown>;
  source: SubmissionSource;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function submissionCategoryFromApi(
  s: ApiSubmission,
  snapshot: FormTemplate | null,
  formCategory: string | null | undefined,
): InspectionCategory {
  return clientSubmissionCategory({
    templateSnapshot: snapshot,
    formCategory,
  });
}

function apiSubmissionToLocal(s: ApiSubmission): InspectionSubmission {
  const snapshot = s.templateSnapshot as FormTemplate | null;
  const formCategory = s.form?.category as InspectionCategory | undefined;
  const formPurpose = s.form?.purpose as FormPurpose | undefined;
  const categorySnapshot = submissionCategoryFromApi(s, snapshot, formCategory);
  const templateSnapshot = enrichSubmissionTemplateSnapshot(snapshot, formPurpose);
  return {
    id: s.id,
    formId: s.formId,
    formNameSnapshot: snapshot?.name ?? s.form?.name ?? "",
    categorySnapshot,
    formCategory,
    formPurpose,
    level: (templateSnapshot?.level ?? snapshot?.level ?? "scope") as FormLevel,
    projectId: s.projectId,
    unitId: s.unitId,
    scopeRowId: s.scopeRowId ?? undefined,
    scopeTypeCode: s.scopeTypeCode ?? undefined,
    submittedAt: s.submittedAt,
    submittedBy: s.clearInspection?.inspectedBy?.name?.trim() || "—",
    submittedById: s.clearInspection?.inspectedById ?? s.clearInspection?.inspectedBy?.id ?? null,
    outcome: s.outcome,
    deficiencyCount: s.deficiencyCount,
    payload: s.payload,
    templateSnapshot,
    source: s.source ?? "FORM",
  };
}

function pendingToLocal(p: PendingInspection): InspectionSubmission {
  const snapshot = p.templateSnapshot as FormTemplate | null;
  const formCategory = snapshot?.category as InspectionCategory | undefined;
  const categorySnapshot = clientSubmissionCategory({
    templateSnapshot: snapshot,
    formCategory,
    categoryOverride: p.categoryOverride,
  });
  return {
    // Use localId as the id until a server id is assigned
    id: p.localId,
    formId: p.formId,
    formNameSnapshot: snapshot?.name ?? "",
    categorySnapshot,
    formCategory,
    level: (snapshot?.level ?? "scope") as FormLevel,
    projectId: p.projectId,
    unitId: p.unitId,
    scopeRowId: p.scopeRowId,
    scopeTypeCode: p.scopeTypeCode,
    submittedAt: p.submittedAt,
    submittedBy: p.submittedByName,
    outcome: p.outcome,
    deficiencyCount: p.deficiencyCount,
    payload: p.payload,
    templateSnapshot: snapshot ?? undefined,
    source: "FORM",
    _pendingSync: true,
    _localId: p.localId,
  };
}

function pendingUpdateOverlay(
  server: InspectionSubmission,
  pending: PendingInspection,
): InspectionSubmission {
  const fromPending = pendingToLocal(pending);
  return {
    ...fromPending,
    id: server.id,
    submittedAt: server.submittedAt,
    submittedBy: server.submittedBy,
    formNameSnapshot: server.formNameSnapshot,
    templateSnapshot: server.templateSnapshot ?? fromPending.templateSnapshot,
    _pendingSync: true,
    _localId: pending.localId,
  };
}

/** Merge server results with locally-pending records, deduplicating by serverId. */
function mergeWithPending(
  server: InspectionSubmission[],
  pending: PendingInspection[]
): InspectionSubmission[] {
  const unsynced = pending.filter((p) => !p.synced);
  const pendingUpdates = unsynced.filter((p) => p.updateServerId);
  const pendingCreates = unsynced.filter((p) => !p.updateServerId);

  const updateByServerId = new Map(
    pendingUpdates.map((p) => [p.updateServerId!, p] as const),
  );

  const serverIds = new Set(server.map((s) => s.id));
  const pendingCreatesFiltered = pendingCreates.filter(
    (p) => !p.serverId || !serverIds.has(p.serverId),
  );

  const mergedServer = server.map((s) => {
    const upd = updateByServerId.get(s.id);
    if (upd) return pendingUpdateOverlay(s, upd);
    return s;
  });

  const pendingMapped = pendingCreatesFiltered.map(pendingToLocal);
  return [...pendingMapped, ...mergedServer].sort(
    (a, b) => b.submittedAt.localeCompare(a.submittedAt)
  );
}

async function listSubmissionsFromSnapshot(
  filter: (submission: ApiSubmission) => boolean,
  projectId?: string,
): Promise<InspectionSubmission[]> {
  const cached = await readSnapshotModule<ApiSubmission[]>(
    "inspection-submissions",
    projectId,
  );
  if (!cached?.data) return [];
  return cached.data.filter(filter).map(apiSubmissionToLocal);
}

// ─── Cross-component event bus ────────────────────────────────────────────────

/**
 * Dispatch a browser CustomEvent so any component that cares about inspection
 * data can re-fetch without needing shared React state or a context.
 *
 * Only fires on the client (SSR-safe guard included).
 */
function dispatchInspectionUpdate(unitId: string, scopeRowId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("inspections:updated", {
      detail: { unitId, scopeRowId },
    })
  );
}

/** Load a queued (unsynced) inspection as a local submission for edit/resubmit UI. */
export async function getPendingInspectionSubmission(
  localId: string,
): Promise<InspectionSubmission | null> {
  const record = await getPendingByLocalId(localId);
  if (!record || record.synced) return null;
  const local = pendingToLocal(record);
  const { rehydratePendingInspectionMediaForDisplay } = await import(
    "@/lib/inspections/inspection-media-blobs"
  );
  const payload = await rehydratePendingInspectionMediaForDisplay(
    local.payload as import("@/components/forms/FormFillClient").AnswersMap,
  );
  return { ...local, payload };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Submissions for a scope row, newest first. Offline-safe. */
export async function listByScope(
  scopeRowId: string
): Promise<InspectionSubmission[]> {
  // Always load offline-pending records first so they show up even if
  // the network request fails.
  const pendingPromise = getPendingByScope(scopeRowId).catch(() => [] as PendingInspection[]);

  try {
    const res = await fetch(
      `/api/inspection-submissions?scopeRowId=${encodeURIComponent(scopeRowId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Failed to list submissions: ${res.status}`);
    const data = (await res.json()) as { submissions: ApiSubmission[] };
    const server = data.submissions.map(apiSubmissionToLocal);
    const pending = await pendingPromise;
    return mergeWithPending(server, pending);
  } catch {
    const server = await listSubmissionsFromSnapshot(
      (s) => s.scopeRowId === scopeRowId,
    );
    const pending = await pendingPromise;
    return mergeWithPending(server, pending);
  }
}

/** All submissions for a project — used to hydrate grid tile shields on initial load. */
export async function listByProject(projectId: string): Promise<InspectionSubmission[]> {
  const pendingPromise = getPendingByProject(projectId).catch(() => [] as PendingInspection[]);

  try {
    const res = await fetch(
      `/api/inspection-submissions?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`Failed to list project submissions: ${res.status}`);
    const data = (await res.json()) as { submissions: ApiSubmission[] };
    const server = data.submissions.map(apiSubmissionToLocal);
    const pending = await pendingPromise;
    return mergeWithPending(server, pending);
  } catch {
    const server = await listSubmissionsFromSnapshot(
      (s) => s.projectId === projectId,
      projectId,
    );
    const pending = await pendingPromise;
    return mergeWithPending(server, pending);
  }
}
export function isProjectLevelSubmission(
  sub: Pick<InspectionSubmission, "unitId" | "scopeRowId" | "level" | "source">,
): boolean {
  if (sub.source === "BACKFILL") return false;
  if (sub.level === "project") return true;
  return sub.unitId === PROJECT_LEVEL_INSPECTION_UNIT_ID && !sub.scopeRowId;
}

/** Submissions for project-level forms on a project, newest first. */
export async function listByProjectLevel(projectId: string): Promise<InspectionSubmission[]> {
  const pendingPromise = getPendingByProject(projectId).catch(() => [] as PendingInspection[]);

  try {
    const params = new URLSearchParams({
      projectId,
      unitId: PROJECT_LEVEL_INSPECTION_UNIT_ID,
    });
    const res = await fetch(
      `/api/inspection-submissions?${params.toString()}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`Failed to list project-level submissions: ${res.status}`);
    const data = (await res.json()) as { submissions: ApiSubmission[] };
    const server = data.submissions
      .map(apiSubmissionToLocal)
      .filter(isProjectLevelSubmission);
    const pending = (await pendingPromise).filter(
      (p) => p.unitId === PROJECT_LEVEL_INSPECTION_UNIT_ID && !p.scopeRowId,
    );
    return mergeWithPending(server, pending).filter(isProjectLevelSubmission);
  } catch {
    const server = (await listSubmissionsFromSnapshot(
      (s) => s.projectId === projectId,
      projectId,
    )).filter(isProjectLevelSubmission);
    const pending = (await pendingPromise)
      .filter((p) => p.unitId === PROJECT_LEVEL_INSPECTION_UNIT_ID && !p.scopeRowId);
    return mergeWithPending(server, pending).filter(isProjectLevelSubmission);
  }
}

/** Submissions for a unit (unit-level inspections only), newest first. */
export async function listByUnit(unitId: string, projectId: string): Promise<InspectionSubmission[]> {
  const pendingPromise = getPendingByUnit(unitId, projectId).catch(() => [] as PendingInspection[]);

  try {
    const params = new URLSearchParams({ unitId, projectId });
    const res = await fetch(
      `/api/inspection-submissions?${params.toString()}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Failed to list unit submissions: ${res.status}`);
    const data = (await res.json()) as { submissions: ApiSubmission[] };
    const server = data.submissions.map(apiSubmissionToLocal);
    const pending = await pendingPromise;
    return mergeWithPending(server, pending);
  } catch {
    const server = await listSubmissionsFromSnapshot(
      (s) => s.unitId === unitId && s.projectId === projectId,
      projectId,
    );
    const pending = await pendingPromise;
    return mergeWithPending(server, pending);
  }
}
export async function update(
  id: string,
  patch: {
    outcome: InspectionOutcome;
    deficiencyCount: number;
    payload: Record<string, unknown>;
  },
): Promise<InspectionSubmission> {
  const res = await fetch(`/api/inspection-submissions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Failed to update submission: ${res.status}`);
  }
  const data = (await res.json()) as { submission: ApiSubmission };
  return apiSubmissionToLocal(data.submission);
}

function buildSyncPayloadFromSubmission(
  submission: InspectionSubmission,
  templateSnapshot: FormTemplate,
  patch: {
    outcome: InspectionOutcome;
    deficiencyCount: number;
    payload: Record<string, unknown>;
  },
  activityLocation?: PendingInspection["activityLocation"],
): Parameters<typeof syncOne>[1] {
  return {
    formId: submission.formId ?? "",
    formVersionId: templateSnapshot.latestVersionId,
    templateSnapshot,
    projectId: submission.projectId,
    unitId: submission.unitId,
    scopeRowId: submission.scopeRowId,
    scopeTypeCode: submission.scopeTypeCode,
    submittedBy: submission.submittedBy,
    outcome: patch.outcome,
    deficiencyCount: patch.deficiencyCount,
    payload: patch.payload,
    updateServerId: submission._pendingSync ? undefined : submission.id,
    activityLocation,
  };
}

/**
 * Offline-first edit — defer media upload to background sync; close UI immediately.
 */
export async function updateOfflineFirst(
  submission: InspectionSubmission,
  patch: {
    outcome: InspectionOutcome;
    deficiencyCount: number;
    payload: Record<string, unknown>;
  },
): Promise<{
  submission: InspectionSubmission;
  syncPromise: Promise<boolean>;
}> {
  const templateSnapshot = submission.templateSnapshot;
  if (!templateSnapshot?.sections?.length && !submission.formId) {
    throw new Error("Cannot update submission without form template");
  }
  const snapshot = templateSnapshot ?? ({
    id: submission.formId,
    name: submission.formNameSnapshot,
    description: "",
    status: "published" as const,
    level: submission.level,
    scopeTypeCodes: submission.scopeTypeCode ? [submission.scopeTypeCode] : [],
    category: submission.categorySnapshot,
    sections: [],
  } satisfies FormTemplate);

  const activityLocation = await collectActivityLocation();

  if (submission._pendingSync && submission._localId) {
    await updatePendingInspection(submission._localId, { ...patch, activityLocation });
    const optimistic: InspectionSubmission = {
      ...submission,
      ...patch,
      _pendingSync: true,
      _localId: submission._localId,
    };
    dispatchInspectionUpdate(submission.unitId, submission.scopeRowId);
    const syncPromise = syncOne(
      submission._localId,
      {
        formId: submission.formId ?? "",
        formVersionId: snapshot.latestVersionId,
        templateSnapshot: snapshot,
        projectId: submission.projectId,
        unitId: submission.unitId,
        scopeRowId: submission.scopeRowId,
        scopeTypeCode: submission.scopeTypeCode,
        submittedBy: submission.submittedBy,
        outcome: patch.outcome,
        deficiencyCount: patch.deficiencyCount,
        payload: patch.payload,
        activityLocation,
      },
    ).then((synced) => {
      if (synced) {
        dispatchInspectionUpdate(submission.unitId, submission.scopeRowId);
      }
      return synced;
    });
    return { submission: optimistic, syncPromise };
  }

  if (!submission.formId) {
    throw new Error("Cannot update submission without formId");
  }

  const localId = await queueInspection({
    updateServerId: submission.id,
    formId: submission.formId,
    formVersionId: snapshot.latestVersionId,
    templateSnapshot: snapshot,
    projectId: submission.projectId,
    unitId: submission.unitId,
    scopeRowId: submission.scopeRowId,
    scopeTypeCode: submission.scopeTypeCode,
    submittedByName: submission.submittedBy,
    submittedAt: submission.submittedAt,
    outcome: patch.outcome,
    deficiencyCount: patch.deficiencyCount,
    payload: patch.payload,
    activityLocation,
  });

  const optimistic: InspectionSubmission = {
    ...submission,
    ...patch,
    _pendingSync: true,
    _localId: localId,
  };

  dispatchInspectionUpdate(submission.unitId, submission.scopeRowId);

  const syncPromise = syncOne(
    localId,
    buildSyncPayloadFromSubmission(submission, snapshot, patch, activityLocation),
  ).then((synced) => {
    if (synced) {
      dispatchInspectionUpdate(submission.unitId, submission.scopeRowId);
    }
    return synced;
  });

  return { submission: optimistic, syncPromise };
}

/**
 * Backfill a scope's inspection status without filling a form.
 * Used for Procore migration — marks a scope as previously PASS/FAIL.
 * Upserts a BACKFILL InspectionSubmission and updates ProjectRow.inspectionStatus.
 */
export async function backfill(
  projectId: string,
  scopeRowId: string,
  args: {
    outcome: "PASS" | "FAIL";
    note?: string;
    scopeTypeCode?: string;
    unitId?: string;
  }
): Promise<InspectionSubmission> {
  const res = await fetch(
    `/api/projects/${projectId}/units/${scopeRowId}/backfill-inspection`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Failed to backfill inspection: ${res.status}`);
  }
  const data = (await res.json()) as { submission: ApiSubmission };
  dispatchInspectionUpdate(args.unitId ?? scopeRowId, scopeRowId);
  return apiSubmissionToLocal(data.submission);
}

/**
 * Remove the BACKFILL submission for a scope and clear inspectionStatus.
 * Only valid when no FORM-source submission exists for the scope.
 */
export async function clearBackfill(
  projectId: string,
  scopeRowId: string,
  unitId?: string
): Promise<void> {
  const res = await fetch(
    `/api/projects/${projectId}/units/${scopeRowId}/backfill-inspection`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Failed to clear backfill: ${res.status}`);
  }
  dispatchInspectionUpdate(unitId ?? scopeRowId, scopeRowId);
}

/** Fetch a single submission by id. */
export async function get(id: string): Promise<InspectionSubmission | null> {
  const res = await fetch(`/api/inspection-submissions/${id}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get submission: ${res.status}`);
  const data = (await res.json()) as { submission: ApiSubmission };
  return apiSubmissionToLocal(data.submission);
}

/**
 * Submit a completed inspection — offline-first.
 *
 * Returns an object containing:
 *   - `submission` — an optimistic InspectionSubmission (with `_pendingSync: true`)
 *     that can be shown in the UI immediately.
 *   - `syncPromise` — a Promise<boolean> that resolves when the background
 *     API call settles (true = synced, false = failed/offline). Callers can
 *     await this to trigger a refresh at the right time, rather than using
 *     an arbitrary fixed timeout.
 */
export async function insert(
  payload: Omit<InspectionSubmission, "id" | "formId"> & {
    /** formId is required for real form-based submissions. */
    formId: string;
    templateSnapshot: FormTemplate;
    formVersionId?: string;
    /** When set, the API stores this as a calibration and skips status side-effects. */
    categoryOverride?: "CALIBRATION_INSPECTION";
    /** Clear submission id being calibrated — required with categoryOverride. */
    calibratedAgainstSubmissionId?: string;
  }
): Promise<{
  submission: InspectionSubmission & { _localId: string };
  syncPromise: Promise<boolean>;
}> {
  const activityLocation = await collectActivityLocation();

  // Step 1 — queue in IndexedDB immediately
  const localId = await queueInspection({
    formId: payload.formId,
    formVersionId: payload.formVersionId,
    templateSnapshot: payload.templateSnapshot,
    categoryOverride: payload.categoryOverride,
    calibratedAgainstSubmissionId: payload.calibratedAgainstSubmissionId,
    projectId: payload.projectId,
    unitId: payload.unitId,
    scopeRowId: payload.scopeRowId,
    scopeTypeCode: payload.scopeTypeCode,
    submittedByName: payload.submittedBy,
    outcome: payload.outcome,
    deficiencyCount: payload.deficiencyCount,
    payload: payload.payload as Record<string, unknown>,
    submittedAt: payload.submittedAt,
    activityLocation,
  });

  // Build the optimistic response
  const submission: InspectionSubmission & { _localId: string } = {
    id: localId,
    source: "FORM",
    formId: payload.formId,
    formNameSnapshot: payload.formNameSnapshot,
    categorySnapshot: payload.categorySnapshot,
    formCategory: payload.categorySnapshot,
    level: payload.level,
    projectId: payload.projectId,
    unitId: payload.unitId,
    scopeRowId: payload.scopeRowId,
    scopeTypeCode: payload.scopeTypeCode,
    submittedAt: payload.submittedAt,
    submittedBy: payload.submittedBy,
    outcome: payload.outcome,
    deficiencyCount: payload.deficiencyCount,
    payload: payload.payload as Record<string, unknown>,
    templateSnapshot: payload.templateSnapshot,
    _pendingSync: true,
    _localId: localId,
  };

  // Notify other components (e.g. UnitInspectionsSummary) that a new
  // submission exists so they can re-fetch without needing shared state.
  dispatchInspectionUpdate(payload.unitId, payload.scopeRowId);

  // Step 2 — attempt API call (fire-and-forget from the caller's perspective,
  // but exposed as a promise so the UI can refresh at the right moment).
  const syncPromise = syncOne(localId, {
    ...payload,
    categoryOverride: payload.categoryOverride,
    calibratedAgainstSubmissionId: payload.calibratedAgainstSubmissionId,
    activityLocation,
  }).then((synced) => {
    if (synced) {
      // Fire again after the server confirms so components can swap the
      // pending record for the real server-assigned id.
      dispatchInspectionUpdate(payload.unitId, payload.scopeRowId);
    }
    return synced;
  });

  return { submission, syncPromise };
}

/** Admin-only: delete latest submission for a category and recompute scope status. */
export async function resetInspectionCategory(
  projectId: string,
  scopeRowId: string,
  category: InspectionCategory,
): Promise<void> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/units/${encodeURIComponent(scopeRowId)}/inspections/reset`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to reset inspection: ${res.status}`);
  }
}

export async function reclassifySubmissionToCalibration(
  submissionId: string,
  calibratedAgainstSubmissionId: string,
): Promise<void> {
  const res = await fetch(
    `/api/inspection-submissions/${encodeURIComponent(submissionId)}/reclassify-calibration`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calibratedAgainstSubmissionId }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to reclassify submission: ${res.status}`);
  }
}
