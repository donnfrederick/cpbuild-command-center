import { getPendingMutations, type MutationType, type QueuedMutation } from "@/lib/offline/mutation-queue";
import { getAllPending, type PendingInspection } from "@/lib/inspections/inspectionOfflineDb";
import { UNKNOWN_INSPECTION_FORM_NAME } from "@/lib/activity/inspection-sync-failure-labels";
import { getInspectionDeficiencyMetrics } from "@/lib/inspections/activity-metadata";
import { buildInspectionActivityLocationMetadata } from "@/lib/inspections/unit-inspection-ref";
import { mutationActivityItemSummary } from "@/lib/offline/mutation-activity-label";
import {
  httpStatusFromMutationSyncError,
  mutationSyncErrorToDisplayMessage,
} from "@/lib/offline/mutation-sync-error-display";

export interface PendingActivityEvent {
  id: string;
  projectId: string;
  eventType:
    | "SCOPE_STATUS_UPDATED"
    | "ISSUE_CREATED"
    | "OBSERVATION_CREATED"
    | "OBSERVATION_UPDATED"
    | "CUSTOM_SITE_LOCATION_CREATED"
    | "INSPECTION_SUBMITTED"
    | "INSPECTION_SYNC_FAILED"
    | "MUTATION_SYNC_FAILED";
  userId: string | null;
  userName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Pending inspection rows older than this are omitted from the activity feed preview. */
const PENDING_INSPECTION_ACTIVITY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

interface PendingActivityOptions {
  projectIds?: string[];
  projectId?: string;
  building?: string;
  level?: string;
  unit?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function projectIdFromUrl(url: string): string | null {
  const match = url.match(/\/api\/projects\/([^/?#]+)(?:[/?#]|$)/);
  return match?.[1] ?? null;
}

function rowIdFromUrl(url: string): string | null {
  const match = url.match(/\/api\/projects\/[^/?#]+\/units\/([^/?#]+)(?:[/?#]|$)/);
  return match?.[1] ?? null;
}

function unitRefMatches(unitRef: string | null | undefined, options: PendingActivityOptions): boolean {
  if (!options.unit && !options.building && !options.level) return true;
  if (!unitRef) return false;
  const [building = "", level = "", unit = ""] = unitRef.split("|");
  if (options.building && building !== options.building) return false;
  if (options.level && level !== options.level) return false;
  if (options.unit && unit !== options.unit) return false;
  return true;
}

function directLocationMatches(metadata: Record<string, unknown>, options: PendingActivityOptions): boolean {
  if (!options.unit && !options.building && !options.level) return true;
  if (options.building && metadata.building !== options.building) return false;
  if (options.level && metadata.level !== options.level) return false;
  if (options.unit && metadata.unit !== options.unit) return false;
  return true;
}

function mutationSyncFailureMetadata(mutation: QueuedMutation): Record<string, unknown> | null {
  const history = mutation.syncErrorHistory ?? [];
  if (history.length === 0 && !mutation.lastSyncError) return null;
  const latestFromHistory = history.length > 0 ? history[history.length - 1] : undefined;
  const errorMessage = latestFromHistory?.message
    ?? (mutation.lastSyncError ? mutationSyncErrorToDisplayMessage(mutation.lastSyncError) : "");
  const httpStatus = latestFromHistory?.httpStatus
    ?? (mutation.lastSyncError ? httpStatusFromMutationSyncError(mutation.lastSyncError) : undefined);
  return {
    syncFailed: true,
    syncErrors: history.length > 0
      ? history
      : [{
          attempt: mutation.attempts || 1,
          message: errorMessage,
          ...(httpStatus !== undefined ? { httpStatus } : {}),
          errorKind: "retriable" as const,
          recordedAt: new Date().toISOString(),
        }],
    syncAttempts: mutation.attempts || history.length,
    errorMessage,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    mutationType: mutation.type,
    itemSummary: mutationActivityItemSummary(mutation),
  };
}

function mutationLocationMetadata(mutation: QueuedMutation, body: Record<string, unknown>): Record<string, unknown> {
  if (mutation.type === "unit-status") {
    return {
      rowId: rowIdFromUrl(mutation.url) ?? "",
      unit: typeof body.unit === "string" ? body.unit : "",
      building: typeof body.building === "string" ? body.building : "",
      level: typeof body.level === "string" ? body.level : "",
    };
  }
  const unitRef = typeof body.unitRef === "string" ? body.unitRef : null;
  if (unitRef) {
    const [building = "", level = "", unit = ""] = unitRef.split("|");
    return { unitRef, unit: unit.trim(), building: building.trim(), level: level.trim() };
  }
  return {};
}

function mutationToPendingActivity(mutation: QueuedMutation): PendingActivityEvent | null {
  const projectId = projectIdFromUrl(mutation.url);
  if (!projectId) return null;

  const body = asRecord(mutation.body);
  const syncFailure = mutationSyncFailureMetadata(mutation);
  const replayMeta = {
    pendingSync: true,
    replayedFromOfflineQueue: true,
    offlineMutationId: mutation.id,
    clientQueuedAt: new Date(mutation.queuedAt).toISOString(),
  };
  const locationMeta = mutationLocationMetadata(mutation, body);

  if (syncFailure) {
    return {
      id: `pending:${mutation.id}`,
      projectId,
      eventType: "MUTATION_SYNC_FAILED",
      userId: null,
      userName: null,
      createdAt: new Date().toISOString(),
      metadata: {
        ...replayMeta,
        ...locationMeta,
        ...syncFailure,
      },
    };
  }

  const base = {
    id: `pending:${mutation.id}`,
    projectId,
    userId: null,
    userName: null,
    createdAt: new Date(mutation.queuedAt).toISOString(),
    metadata: {
      ...replayMeta,
      ...locationMeta,
    },
  };

  if (mutation.type === "unit-status") {
    return {
      ...base,
      eventType: "SCOPE_STATUS_UPDATED",
      metadata: {
        ...base.metadata,
        scopeName: "scope",
        fromStage: null,
        toStage: body.scopeStage ?? null,
        fromStatus: null,
        toStatus: body.scopeStatus ?? null,
      },
    };
  }

  if (mutation.type === "create-issue") {
    return {
      ...base,
      eventType: "ISSUE_CREATED",
      metadata: {
        ...base.metadata,
        issueId: mutation.id,
        shortDescription: String(body.shortDescription ?? "Pending issue"),
        issueType: String(body.issueType ?? ""),
        unitRef: typeof body.unitRef === "string" ? body.unitRef : null,
        isBlockingWork: Boolean(body.isBlockingWork),
      },
    };
  }

  if (mutation.type === "create-observation") {
    return {
      ...base,
      eventType: "OBSERVATION_CREATED",
      metadata: {
        ...base.metadata,
        observationId: mutation.id,
        title: String(body.title ?? ""),
        observationType: String(body.observationType ?? "OTHER"),
      },
    };
  }

  if (mutation.type === "update-observation") {
    return {
      ...base,
      eventType: "OBSERVATION_UPDATED",
      metadata: {
        ...base.metadata,
        observationId: mutation.url.match(/\/observations\/([^/?#]+)/)?.[1] ?? mutation.id,
        title: String(body.title ?? body.description ?? ""),
      },
    };
  }

  if (mutation.type === "create-custom-site-location") {
    return {
      ...base,
      eventType: "CUSTOM_SITE_LOCATION_CREATED",
      metadata: {
        ...base.metadata,
        locationId: mutation.id,
        name: String(body.name ?? ""),
        placement: String(body.placement ?? "standalone"),
        building: String(body.building ?? ""),
        level: String(body.level ?? ""),
      },
    };
  }

  return null;
}

function inspectionToPendingActivity(record: PendingInspection): PendingActivityEvent {
  const template = asRecord(record.templateSnapshot);
  const deficiencyMetrics = getInspectionDeficiencyMetrics(record.payload);
  const locationMeta = buildInspectionActivityLocationMetadata({
    scopeRowId: record.scopeRowId ?? null,
    unitId: record.unitId,
    scopeTypeCode: record.scopeTypeCode ?? null,
  });
  const hasSyncErrors = (record.syncErrorHistory?.length ?? 0) > 0;
  const latestError = hasSyncErrors
    ? record.syncErrorHistory![record.syncErrorHistory!.length - 1]
    : undefined;
  return {
    id: `pending:${record.localId}`,
    projectId: record.projectId,
    eventType: hasSyncErrors ? "INSPECTION_SYNC_FAILED" : "INSPECTION_SUBMITTED",
    userId: null,
    userName: record.submittedByName || null,
    createdAt: record.failedAt ?? record.submittedAt,
    metadata: {
      pendingSync: true,
      replayedFromOfflineQueue: true,
      offlineMutationId: record.localId,
      clientQueuedAt: record.submittedAt,
      submissionId: record.localId,
      formName: String(template.name ?? UNKNOWN_INSPECTION_FORM_NAME),
      category: record.categoryOverride ?? String(template.category ?? "OTHER"),
      outcome: record.outcome,
      deficiencyCount: record.deficiencyCount,
      failedQuestionCount: deficiencyMetrics.failedQuestionCount,
      totalDeficiencyCount: deficiencyMetrics.totalDeficiencyCount,
      attemptNumber: 1,
      isEdit: false,
      ...(hasSyncErrors
        ? {
            syncFailed: true,
            syncErrors: record.syncErrorHistory,
            syncAttempts: record.syncAttempts ?? record.syncErrorHistory!.length,
            errorMessage: latestError?.message ?? record.lastSyncError ?? "",
            httpStatus: latestError?.httpStatus,
          }
        : {}),
      ...locationMeta,
    },
  };
}

function matchesOptions(event: PendingActivityEvent, options: PendingActivityOptions): boolean {
  if (options.projectId && event.projectId !== options.projectId) return false;
  if (options.projectIds && options.projectIds.length > 0 && !options.projectIds.includes(event.projectId)) return false;
  if (event.eventType === "ISSUE_CREATED" || event.eventType === "OBSERVATION_CREATED" || event.eventType === "OBSERVATION_UPDATED") {
    return unitRefMatches(event.metadata.unitRef as string | null | undefined, options);
  }
  if (event.eventType === "MUTATION_SYNC_FAILED") {
    return directLocationMatches(event.metadata, options);
  }
  return directLocationMatches(event.metadata, options);
}

export async function getPendingActivityEvents(options: PendingActivityOptions = {}): Promise<PendingActivityEvent[]> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return [];
  const [mutations, inspections] = await Promise.all([
    getPendingMutations().catch(() => [] as QueuedMutation[]),
    getAllPending().catch(() => [] as PendingInspection[]),
  ]);

  return [
    ...mutations.map(mutationToPendingActivity).filter((event): event is PendingActivityEvent => event !== null),
    ...inspections
      .filter((record) => Date.now() - new Date(record.submittedAt).getTime() <= PENDING_INSPECTION_ACTIVITY_MAX_AGE_MS)
      .map(inspectionToPendingActivity),
  ]
    .filter((event) => matchesOptions(event, options))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type { MutationType };
