"use client";

/**
 * Thin client module for flushing one queued inspection submission.
 * Kept separate from submissionsApi so useInspectionSync does not pull the
 * full submissions read/write graph into the app-shell bundle.
 */

import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";
import { isProjectRowInstallCompleteForClearInspection } from "@/lib/inspections/clear-inspection-scope-gate";
import {
  answersHavePendingMedia,
  resolvePendingInspectionMedia,
} from "@/lib/inspections/inspection-media-blobs";
import type { ActivityClientLocation } from "@/lib/activity/activity-location-schema";
import type { AnswersMap } from "@/components/forms/FormFillClient";
import {
  getPendingByLocalId,
  getInspectionRecordByLocalId,
  markFailed,
  markSynced,
  updatePendingCalibrationTarget,
  updatePendingPayload,
  type PendingInspection,
} from "@/lib/inspections/inspectionOfflineDb";
import { resolveCalibratedAgainstSubmissionId } from "@/lib/inspections/resolve-calibrated-against-id";
import type { SyncErrorAttemptInput } from "@/lib/inspections/sync-error-history";
import { reportInspectionSyncActivityFailure } from "@/lib/inspections/report-inspection-sync-activity";
import {
  isBrowserOffline,
  isTransientFetchError,
} from "@/lib/inspections/sync-network-errors";

export class InspectionSyncRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InspectionSyncRejectedError";
  }
}

/** Server rejected upload; pending row is kept in IndexedDB for manual recovery. */
export class InspectionSyncPreservedError extends Error {
  readonly serverMessage: string;

  constructor(serverMessage: string) {
    super(serverMessage);
    this.name = "InspectionSyncPreservedError";
    this.serverMessage = serverMessage;
  }
}

/** @deprecated Alias — same class as {@link InspectionSyncPreservedError}. */
export { InspectionSyncPreservedError as InspectionSyncCalibrationPreservedError };

export class InspectionSyncAuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InspectionSyncAuthRequiredError";
  }
}

export class InspectionSyncExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InspectionSyncExhaustedError";
  }
}

export const MAX_INSPECTION_SYNC_ATTEMPTS = 3;

const DEFAULT_AUTH_SYNC_MESSAGE = "Sign in again to sync this inspection.";
const DEFAULT_EXHAUSTED_SYNC_MESSAGE =
  "Could not reach the server after 3 tries. Tap Retry or check your connection.";

function isPermanentInspectionRejection(status: number): boolean {
  return status === 400 || status === 422;
}

function isAuthInspectionRejection(status: number): boolean {
  return status === 401;
}

async function rejectAndPreserve(
  localId: string,
  payload: InspectionSyncOnePayload,
  details: SyncErrorAttemptInput,
  serverMessage: string,
): Promise<never> {
  await recordSyncFailure(localId, payload, details);
  throw new InspectionSyncPreservedError(serverMessage);
}

async function reportSyncFailureAfterMark(
  localId: string,
  payload: InspectionSyncOnePayload,
): Promise<void> {
  const record = await getPendingByLocalId(localId);
  if (record) {
    reportInspectionSyncActivityFailure(record);
    return;
  }
  const template = payload.templateSnapshot;
  const templateRecord =
    template && typeof template === "object"
      ? template as { name?: string; category?: string }
      : {};
  reportInspectionSyncActivityFailure({
    localId,
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
    payload: payload.payload,
    submittedAt: new Date().toISOString(),
    synced: false,
    syncErrorHistory: [],
  } satisfies PendingInspection);
}

async function recordSyncFailure(
  localId: string,
  payload: InspectionSyncOnePayload,
  details: SyncErrorAttemptInput,
): Promise<number> {
  const attempts = await markFailed(localId, details);
  await reportSyncFailureAfterMark(localId, payload);
  return attempts;
}

async function recordRetriableFailure(
  localId: string,
  payload: InspectionSyncOnePayload,
  details: SyncErrorAttemptInput,
): Promise<false> {
  const attempts = await recordSyncFailure(localId, payload, details);
  if (attempts >= MAX_INSPECTION_SYNC_ATTEMPTS) {
    throw new InspectionSyncExhaustedError(DEFAULT_EXHAUSTED_SYNC_MESSAGE);
  }
  return false;
}

const DEFER_CLEAR_NOT_SYNCED_MESSAGE =
  "Waiting for the clear inspection to upload before this calibration can sync.";

async function resolveCalibrationTargetForPost(
  calibratedAgainstSubmissionId: string | undefined,
): Promise<
  | { ok: true; calibratedAgainstSubmissionId?: string }
  | { ok: false; deferred: true }
> {
  if (!calibratedAgainstSubmissionId) {
    return { ok: true, calibratedAgainstSubmissionId: undefined };
  }

  const record = await getInspectionRecordByLocalId(calibratedAgainstSubmissionId);
  const resolution = resolveCalibratedAgainstSubmissionId(
    calibratedAgainstSubmissionId,
    (id) => {
      if (id !== calibratedAgainstSubmissionId || !record) return undefined;
      return { synced: record.synced, serverId: record.serverId };
    },
  );

  if (resolution.status === "resolved") {
    return { ok: true, calibratedAgainstSubmissionId: resolution.serverId };
  }
  if (resolution.status === "deferred") {
    return { ok: false, deferred: true };
  }

  return { ok: true, calibratedAgainstSubmissionId };
}

function errorMessageFromResponse(status: number, errorBody: string): string {
  let message = `Inspection could not be saved (${status}).`;
  try {
    const parsed = JSON.parse(errorBody) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      message = parsed.error;
    }
  } catch {
    // Keep the generic message when the response is not JSON.
  }
  return message;
}

function canonicalizeJson(value: unknown): unknown {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry) ?? null);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeJson(entry)] as const)
        .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value)) ?? "null";
}

interface ApiSubmissionMatch {
  id: string;
  formId: string | null;
  formVersionId: string | null;
  outcome: "PASS" | "FAIL" | "COMPLETE";
  deficiencyCount: number;
  submittedAt?: string;
  payload: Record<string, unknown>;
  templateSnapshot?: unknown;
}

function categoryFromTemplateSnapshot(templateSnapshot: unknown): string | null {
  if (!templateSnapshot || typeof templateSnapshot !== "object") return null;
  const category = (templateSnapshot as { category?: unknown }).category;
  return typeof category === "string" ? category : null;
}

function isCalibrationInspectionCategory(category: string | null | undefined): boolean {
  return category === "CALIBRATION_INSPECTION";
}

/** Clear and calibration submissions must never dedupe across categories. */
function dedupeCategoriesCompatible(
  pendingCategory: string | null | undefined,
  serverCategory: string | null | undefined,
): boolean {
  const pendingIsCalibration = isCalibrationInspectionCategory(pendingCategory);
  const serverIsCalibration = isCalibrationInspectionCategory(serverCategory);
  return pendingIsCalibration === serverIsCalibration;
}

export type SubmissionMatchMode = "strict" | "relaxed";

function resolveFormVersionId(payload: InspectionSyncOnePayload): string | undefined {
  if (payload.formVersionId?.trim()) {
    return payload.formVersionId.trim();
  }
  const snapshot = payload.templateSnapshot;
  if (snapshot && typeof snapshot === "object") {
    const latestVersionId = (snapshot as { latestVersionId?: unknown }).latestVersionId;
    if (typeof latestVersionId === "string" && latestVersionId.trim()) {
      return latestVersionId.trim();
    }
  }
  return undefined;
}

function submissionMatches(
  submission: ApiSubmissionMatch,
  payload: {
    formId: string;
    formVersionId?: string;
    outcome: "PASS" | "FAIL" | "COMPLETE";
    deficiencyCount: number;
    payload: Record<string, unknown>;
    categoryOverride?: "CALIBRATION_INSPECTION";
  },
  mode: SubmissionMatchMode,
): boolean {
  const pendingCategory = payload.categoryOverride ?? null;
  const serverCategory = categoryFromTemplateSnapshot(submission.templateSnapshot);
  if (!dedupeCategoriesCompatible(pendingCategory, serverCategory)) {
    return false;
  }
  if (
    submission.formId !== payload.formId
    || submission.formVersionId !== (payload.formVersionId ?? null)
    || submission.outcome !== payload.outcome
    || submission.deficiencyCount !== payload.deficiencyCount
  ) {
    return false;
  }
  if (mode === "relaxed") {
    return true;
  }
  const serverPayload = submission.payload ?? {};
  const serverKeys = Object.keys(serverPayload);
  const localKeys = Object.keys(payload.payload ?? {});
  if (serverKeys.length === 0) {
    return localKeys.length === 0;
  }
  return stableJson(serverPayload) === stableJson(payload.payload);
}

async function fetchScopeSubmissions(payload: {
  projectId: string;
  unitId: string;
  scopeRowId?: string;
}): Promise<ApiSubmissionMatch[]> {
  const params = new URLSearchParams();
  if (payload.scopeRowId) {
    params.set("scopeRowId", payload.scopeRowId);
  } else {
    params.set("unitId", payload.unitId);
    params.set("projectId", payload.projectId);
  }
  const res = await fetch(`/api/inspection-submissions?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { submissions: ApiSubmissionMatch[] };
  return data.submissions ?? [];
}

function pickMatchingSubmission(
  submissions: ApiSubmissionMatch[],
  payload: {
    formId: string;
    formVersionId?: string;
    outcome: "PASS" | "FAIL" | "COMPLETE";
    deficiencyCount: number;
    payload: Record<string, unknown>;
  },
  mode: SubmissionMatchMode,
  options?: { notBeforeSubmittedAt?: string },
): ApiSubmissionMatch | null {
  const matches = submissions.filter((submission) => submissionMatches(submission, payload, mode));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  const notBefore = options?.notBeforeSubmittedAt
    ? Date.parse(options.notBeforeSubmittedAt)
    : Number.NaN;
  const sorted = [...matches].sort((left, right) => {
    const leftTime = Date.parse(left.submittedAt ?? "");
    const rightTime = Date.parse(right.submittedAt ?? "");
    return rightTime - leftTime;
  });
  if (!Number.isNaN(notBefore)) {
    const afterQueue = sorted.find((submission) => {
      const submittedAt = Date.parse(submission.submittedAt ?? "");
      return !Number.isNaN(submittedAt) && submittedAt >= notBefore - 60_000;
    });
    if (afterQueue) return afterQueue;
  }
  return sorted[0] ?? null;
}

async function findMatchingSyncedSubmission(
  payload: {
    projectId: string;
    formId: string;
    formVersionId?: string;
    unitId: string;
    scopeRowId?: string;
    outcome: "PASS" | "FAIL" | "COMPLETE";
    deficiencyCount: number;
    payload: Record<string, unknown>;
  },
  mode: SubmissionMatchMode,
  options?: { notBeforeSubmittedAt?: string },
): Promise<string | null> {
  const submissions = await fetchScopeSubmissions(payload);
  const match = pickMatchingSubmission(
    submissions,
    payload,
    mode,
    options,
  );
  return match?.id ?? null;
}

async function findMatchingSyncedSubmissionFromList(
  submissions: ApiSubmissionMatch[],
  payload: {
    formId: string;
    formVersionId?: string;
    outcome: "PASS" | "FAIL" | "COMPLETE";
    deficiencyCount: number;
    payload: Record<string, unknown>;
    categoryOverride?: "CALIBRATION_INSPECTION";
  },
  options?: { notBeforeSubmittedAt?: string },
): Promise<string | null> {
  const modes: SubmissionMatchMode[] =
    payload.categoryOverride === "CALIBRATION_INSPECTION"
      ? ["strict"]
      : ["strict", "relaxed"];
  for (const mode of modes) {
    const match = pickMatchingSubmission(submissions, payload, mode, options);
    if (match) return match.id;
  }
  return null;
}

/** When the server already saved this inspection, drop the stale IndexedDB row. */
export async function reconcilePendingInspectionIfAlreadyOnServer(
  localId: string,
  payload: InspectionSyncOnePayload,
  submissionPayload: Record<string, unknown>,
  options?: { clientQueuedAt?: string },
): Promise<boolean> {
  if (payload.categoryOverride === "CALIBRATION_INSPECTION") {
    return false;
  }
  const formVersionId = resolveFormVersionId(payload);
  const matchPayload = {
    projectId: payload.projectId,
    formId: payload.formId,
    formVersionId,
    unitId: payload.unitId,
    scopeRowId: payload.scopeRowId,
    outcome: payload.outcome,
    deficiencyCount: payload.deficiencyCount,
    payload: submissionPayload,
    categoryOverride: payload.categoryOverride,
  };
  const submissions = await fetchScopeSubmissions(matchPayload).catch(() => []);
  const serverId = await findMatchingSyncedSubmissionFromList(
    submissions,
    matchPayload,
    { notBeforeSubmittedAt: options?.clientQueuedAt },
  );
  if (serverId) {
    await markSynced(localId, serverId);
    return true;
  }
  return false;
}

function isClearInspectionTemplate(templateSnapshot: unknown): boolean {
  if (!templateSnapshot || typeof templateSnapshot !== "object") return false;
  return (templateSnapshot as { category?: string }).category === "CLEAR_INSPECTION";
}

async function ensureClearInspectionScopeSynced(
  projectId: string,
  scopeRowId: string,
): Promise<void> {
  const { flushMutationQueue } = await import("@/lib/offline/mutation-queue");
  await flushMutationQueue();

  const res = await fetch(`/api/projects/${projectId}/units/${scopeRowId}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new InspectionSyncRejectedError(
      "Could not verify scope status before saving the inspection. Check your connection and try again.",
    );
  }

  const data = (await res.json()) as {
    scopes: Array<{
      id: string;
      scopeStage: string | null;
      scopeStatus: string | null;
      subScopeInstances: Array<{
        scopeStage: string | null;
        scopeStatus: string | null;
      }>;
    }>;
  };
  const scope = data.scopes.find((row) => row.id === scopeRowId);
  if (
    !scope
    || !isProjectRowInstallCompleteForClearInspection({
      scopeStage: scope.scopeStage as ScopeStage | null,
      scopeStatus: scope.scopeStatus as ScopeStatus | null,
      subScopeInstances: scope.subScopeInstances.map((inst) => ({
        scopeStage: inst.scopeStage as ScopeStage | null,
        scopeStatus: inst.scopeStatus as ScopeStatus | null,
      })),
    })
  ) {
    throw new InspectionSyncRejectedError(
      "Clear inspections can only be performed when the scope is Install · Complete. Wait for the scope status to finish saving, then submit again from inspection history.",
    );
  }
}

export interface InspectionSyncOnePayload {
  formId: string;
  formVersionId?: string;
  templateSnapshot: unknown;
  projectId: string;
  unitId: string;
  scopeRowId?: string;
  scopeTypeCode?: string;
  submittedBy: string;
  outcome: "PASS" | "FAIL" | "COMPLETE";
  deficiencyCount: number;
  payload: Record<string, unknown>;
  categoryOverride?: "CALIBRATION_INSPECTION";
  calibratedAgainstSubmissionId?: string;
  /** PUT /api/inspection-submissions/:id instead of POST create. */
  updateServerId?: string;
  activityLocation?: ActivityClientLocation;
}

function activityLocationBodyField(
  activityLocation: ActivityClientLocation | undefined,
): { activityLocation?: ActivityClientLocation } {
  return activityLocation ? { activityLocation } : {};
}

/**
 * Attempt to sync a single queued submission to the server.
 * Called immediately after queueing (if online) and again by the
 * background sync hook when the device reconnects.
 */
export async function syncOne(
  localId: string,
  payload: InspectionSyncOnePayload,
  options?: {
    replayMetadata?: {
      submittedAt: string;
    };
  },
): Promise<boolean> {
  if (isBrowserOffline()) {
    return false;
  }

  const formVersionId = resolveFormVersionId(payload);

  try {
    if (
      !payload.updateServerId
      && payload.scopeRowId
      && payload.categoryOverride !== "CALIBRATION_INSPECTION"
      && isClearInspectionTemplate(payload.templateSnapshot)
    ) {
      await ensureClearInspectionScopeSynced(payload.projectId, payload.scopeRowId);
    }

    let submissionPayload = payload.payload;
    const reconciledEarly = await reconcilePendingInspectionIfAlreadyOnServer(
      localId,
      { ...payload, formVersionId },
      submissionPayload,
      { clientQueuedAt: options?.replayMetadata?.submittedAt },
    );
    if (reconciledEarly) {
      return true;
    }

    const answersPayload = payload.payload as AnswersMap;
    if (answersHavePendingMedia(answersPayload)) {
      try {
        const resolved = await resolvePendingInspectionMedia(answersPayload);
        if (answersHavePendingMedia(resolved)) {
          return await recordRetriableFailure(localId, payload, {
            message: "Photos are still uploading. Sync will retry automatically.",
            errorKind: "retriable",
          });
        }
        submissionPayload = resolved as Record<string, unknown>;
        await updatePendingPayload(localId, submissionPayload);
      } catch (err) {
        console.warn("[inspection-sync] syncOne media upload failed:", err);
        return await recordRetriableFailure(localId, payload, {
          message: err instanceof Error ? err.message : "Media upload failed.",
          errorKind: "retriable",
        });
      }
    }

    let calibratedAgainstSubmissionId = payload.calibratedAgainstSubmissionId;
    const isUpdate = Boolean(payload.updateServerId);
    if (!isUpdate && payload.categoryOverride === "CALIBRATION_INSPECTION") {
      const target = await resolveCalibrationTargetForPost(calibratedAgainstSubmissionId);
      if (!target.ok) {
        return await recordRetriableFailure(localId, payload, {
          message: DEFER_CLEAR_NOT_SYNCED_MESSAGE,
          errorKind: "retriable",
        });
      }
      calibratedAgainstSubmissionId = target.calibratedAgainstSubmissionId;
      if (
        payload.calibratedAgainstSubmissionId
        && calibratedAgainstSubmissionId
        && payload.calibratedAgainstSubmissionId !== calibratedAgainstSubmissionId
      ) {
        await updatePendingCalibrationTarget(localId, calibratedAgainstSubmissionId);
      }
    }

    const res = await fetch(
      isUpdate
        ? `/api/inspection-submissions/${encodeURIComponent(payload.updateServerId!)}`
        : "/api/inspection-submissions",
      {
        method: isUpdate ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options?.replayMetadata && !isUpdate
            ? {
                "X-Offline-Mutation-Id": localId,
                "X-Client-Queued-At": options.replayMetadata.submittedAt,
              }
            : {}),
        },
        body: JSON.stringify(
          isUpdate
            ? {
                outcome: payload.outcome,
                deficiencyCount: payload.deficiencyCount,
                payload: submissionPayload,
                ...activityLocationBodyField(payload.activityLocation),
              }
            : {
                formId: payload.formId,
                formVersionId,
                templateSnapshot: payload.templateSnapshot,
                projectId: payload.projectId,
                unitId: payload.unitId,
                scopeRowId: payload.scopeRowId,
                scopeTypeCode: payload.scopeTypeCode,
                outcome: payload.outcome,
                deficiencyCount: payload.deficiencyCount,
                payload: submissionPayload,
                ...(payload.categoryOverride ? { categoryOverride: payload.categoryOverride } : {}),
                ...(calibratedAgainstSubmissionId
                  ? { calibratedAgainstSubmissionId }
                  : {}),
                ...activityLocationBodyField(payload.activityLocation),
              },
        ),
      },
    );
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "(unreadable)");
      console.warn(
        `[inspection-sync] syncOne failed — HTTP ${res.status}:`,
        errorBody,
      );
      if (isPermanentInspectionRejection(res.status)) {
        const message = errorMessageFromResponse(res.status, errorBody);
        const reconciled = await reconcilePendingInspectionIfAlreadyOnServer(
          localId,
          { ...payload, formVersionId },
          submissionPayload,
          { clientQueuedAt: options?.replayMetadata?.submittedAt },
        );
        if (reconciled) {
          return true;
        }
        await rejectAndPreserve(localId, payload, {
          message,
          httpStatus: res.status,
          errorKind: "rejected",
        }, message);
      }
      if (isAuthInspectionRejection(res.status)) {
        const message = errorMessageFromResponse(res.status, errorBody) || DEFAULT_AUTH_SYNC_MESSAGE;
        await recordSyncFailure(localId, payload, {
          message,
          httpStatus: res.status,
          errorKind: "auth",
        });
        throw new InspectionSyncAuthRequiredError(message);
      }
      if (res.status === 403) {
        const message = errorMessageFromResponse(res.status, errorBody);
        await recordSyncFailure(localId, payload, {
          message,
          httpStatus: res.status,
          errorKind: "rejected",
        });
        throw new InspectionSyncRejectedError(message);
      }
      if (res.status === 409) {
        if (payload.categoryOverride !== "CALIBRATION_INSPECTION") {
          const matchPayload = {
            projectId: payload.projectId,
            formId: payload.formId,
            formVersionId,
            unitId: payload.unitId,
            scopeRowId: payload.scopeRowId,
            outcome: payload.outcome,
            deficiencyCount: payload.deficiencyCount,
            payload: submissionPayload,
            categoryOverride: payload.categoryOverride,
          };
          const submissions = await fetchScopeSubmissions(matchPayload).catch(() => []);
          const serverId = await findMatchingSyncedSubmissionFromList(
            submissions,
            matchPayload,
            { notBeforeSubmittedAt: options?.replayMetadata?.submittedAt },
          );
          if (serverId) {
            await markSynced(localId, serverId);
            return true;
          }
        }
        await rejectAndPreserve(localId, payload, {
          message: errorMessageFromResponse(res.status, errorBody),
          httpStatus: res.status,
          errorKind: "rejected",
        }, errorMessageFromResponse(res.status, errorBody));
      }
      return await recordRetriableFailure(localId, payload, {
        message: errorMessageFromResponse(res.status, errorBody),
        httpStatus: res.status,
        errorKind: "retriable",
      });
    }
    const data = (await res.json()) as { submission: { id: string } };
    const serverId = isUpdate ? payload.updateServerId! : data.submission.id;
    await markSynced(localId, serverId);
    return true;
  } catch (err) {
    if (
      err instanceof InspectionSyncRejectedError
      || err instanceof InspectionSyncPreservedError
      || err instanceof InspectionSyncAuthRequiredError
      || err instanceof InspectionSyncExhaustedError
    ) {
      throw err;
    }
    console.warn("[inspection-sync] syncOne network error:", err);
    if (isBrowserOffline() || isTransientFetchError(err)) {
      return false;
    }
    return await recordRetriableFailure(localId, payload, {
      message: err instanceof Error ? err.message : "Network error while syncing inspection.",
      errorKind: "retriable",
    });
  }
}
