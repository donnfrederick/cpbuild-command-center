import type { SyncErrorAttempt } from "@/lib/inspections/sync-error-history";
import { sortSyncErrorsLatestFirst } from "@/lib/inspections/sync-error-history";

export interface ActivitySyncFailureMetadata {
  syncFailed?: boolean;
  syncErrors?: SyncErrorAttempt[];
  errorMessage?: string;
  syncAttempts?: number;
  httpStatus?: number;
  offlineMutationId?: string;
  formName?: string;
  category?: string;
  outcome?: string;
  unit?: string;
  building?: string;
  level?: string;
  scopeName?: string;
}

export function isInspectionSyncFailureEvent(eventType: string, metadata: Record<string, unknown>): boolean {
  if (eventType === "INSPECTION_SYNC_FAILED") return true;
  return eventType === "INSPECTION_SUBMITTED" && metadata.syncFailed === true;
}

export function isMutationSyncFailureEvent(eventType: string): boolean {
  return eventType === "MUTATION_SYNC_FAILED";
}

export function isOfflineSyncFailureEvent(eventType: string, metadata: Record<string, unknown>): boolean {
  return isInspectionSyncFailureEvent(eventType, metadata) || isMutationSyncFailureEvent(eventType);
}

export function syncErrorsFromActivityMetadata(
  metadata: Record<string, unknown>,
): SyncErrorAttempt[] {
  const raw = metadata.syncErrors;
  if (!Array.isArray(raw)) {
    const message = typeof metadata.errorMessage === "string" ? metadata.errorMessage : "";
    if (!message) return [];
    return [{
      attempt: typeof metadata.syncAttempts === "number" ? metadata.syncAttempts : 1,
      message,
      ...(typeof metadata.httpStatus === "number" ? { httpStatus: metadata.httpStatus } : {}),
      errorKind: "retriable",
      recordedAt: new Date().toISOString(),
    }];
  }
  return sortSyncErrorsLatestFirst(
    raw.filter((entry): entry is SyncErrorAttempt => {
      return typeof entry === "object"
        && entry !== null
        && typeof (entry as SyncErrorAttempt).attempt === "number"
        && typeof (entry as SyncErrorAttempt).message === "string";
    }),
  );
}

export function serverSyncFailureMutationIds(events: Array<{ eventType: string; metadata: Record<string, unknown> }>): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.eventType !== "INSPECTION_SYNC_FAILED" && event.eventType !== "MUTATION_SYNC_FAILED") continue;
    const id = event.metadata.offlineMutationId;
    if (typeof id === "string" && id.length > 0) ids.add(id);
  }
  return ids;
}

/** Server-side rows replayed from the offline queue after a successful upload. */
export function serverSyncedOfflineMutationIds(
  events: Array<{ eventType: string; metadata: Record<string, unknown> }>,
): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.metadata.syncFailed === true) continue;
    if (event.metadata.replayedFromOfflineQueue !== true) continue;
    const id = event.metadata.offlineMutationId;
    if (typeof id === "string" && id.length > 0) ids.add(id);
  }
  return ids;
}

/** @deprecated Use {@link serverSyncedOfflineMutationIds} — inspections-only alias. */
export function serverSyncedInspectionMutationIds(
  events: Array<{ eventType: string; metadata: Record<string, unknown> }>,
): Set<string> {
  return serverSyncedOfflineMutationIds(events);
}

export function filterPendingSyncFailuresDeduped<T extends { eventType: string; metadata: Record<string, unknown> }>(
  pending: T[],
  serverEvents: Array<{ eventType: string; metadata: Record<string, unknown> }>,
): T[] {
  const serverIds = serverSyncFailureMutationIds(serverEvents);
  return pending.filter((event) => {
    if (!isOfflineSyncFailureEvent(event.eventType, event.metadata)) return true;
    const mutationId = event.metadata.offlineMutationId;
    if (typeof mutationId !== "string") return true;
    return !serverIds.has(mutationId);
  });
}

/** Drop optimistic pending inspection rows when the server already saved the same offline id. */
export function filterPendingInspectionEventsDeduped<T extends { eventType: string; metadata: Record<string, unknown> }>(
  pending: T[],
  serverEvents: Array<{ eventType: string; metadata: Record<string, unknown> }>,
): T[] {
  const syncedIds = serverSyncedOfflineMutationIds(serverEvents);
  const withoutSynced = pending.filter((event) => {
    const isPendingOffline =
      event.eventType === "INSPECTION_SUBMITTED"
      || event.eventType === "OBSERVATION_CREATED"
      || event.eventType === "OBSERVATION_UPDATED"
      || event.eventType === "ISSUE_CREATED"
      || event.eventType === "SCOPE_STATUS_UPDATED"
      || isOfflineSyncFailureEvent(event.eventType, event.metadata);
    if (!isPendingOffline) return true;
    const mutationId = event.metadata.offlineMutationId;
    if (typeof mutationId !== "string" || mutationId.length === 0) return true;
    return !syncedIds.has(mutationId);
  });
  return filterPendingSyncFailuresDeduped(withoutSynced, serverEvents);
}

const PENDING_SEMANTIC_MATCH_WINDOW_MS = 10 * 60 * 1000;

function metadataRowId(metadata: Record<string, unknown>): string | null {
  const rowId = metadata.rowId;
  return typeof rowId === "string" && rowId.length > 0 ? rowId : null;
}

function eventTimeMs(createdAt: string): number {
  const parsed = Date.parse(createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isPendingOverlay(metadata: Record<string, unknown>, id?: string): boolean {
  return Boolean(id?.startsWith("pending:"))
    || metadata.pendingSync === true
    || metadata.replayedFromOfflineQueue === true;
}

function pendingMatchesServerSemantic(
  pending: { eventType: string; metadata: Record<string, unknown>; createdAt: string },
  server: { eventType: string; metadata: Record<string, unknown>; createdAt: string },
): boolean {
  if (pending.eventType !== server.eventType) return false;

  const pendingRow = metadataRowId(pending.metadata);
  const serverRow = metadataRowId(server.metadata);
  if (!pendingRow || pendingRow !== serverRow) return false;

  if (Math.abs(eventTimeMs(pending.createdAt) - eventTimeMs(server.createdAt)) > PENDING_SEMANTIC_MATCH_WINDOW_MS) {
    return false;
  }

  if (pending.eventType === "SCOPE_STATUS_UPDATED") {
    return pending.metadata.toStage === server.metadata.toStage
      && pending.metadata.toStatus === server.metadata.toStatus;
  }

  if (pending.eventType === "SCOPE_SUBCONTRACTOR_UPDATED") {
    return pending.metadata.toUnifierSubId === server.metadata.toUnifierSubId;
  }

  return false;
}

/**
 * Drop optimistic pending rows when the server already recorded the same scope change
 * (even when the server row lacks offline replay metadata — e.g. online PATCH).
 */
export function filterPendingSemanticDuplicatesAgainstServer<T extends {
  id?: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}>(
  pending: T[],
  serverEvents: Array<{ eventType: string; metadata: Record<string, unknown>; createdAt: string }>,
): T[] {
  return pending.filter((pendingEvent) => {
    if (!isPendingOverlay(pendingEvent.metadata, pendingEvent.id)) return true;
    if (
      pendingEvent.eventType !== "SCOPE_STATUS_UPDATED"
      && pendingEvent.eventType !== "SCOPE_SUBCONTRACTOR_UPDATED"
    ) {
      return true;
    }
    const hasSemanticServerMatch = serverEvents.some((serverEvent) =>
      pendingMatchesServerSemantic(pendingEvent, serverEvent),
    );
    return !hasSemanticServerMatch;
  });
}
