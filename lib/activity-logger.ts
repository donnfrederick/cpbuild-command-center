/**
 * Activity logger — appends a row to `activity_logs` for each key in-app action.
 *
 * Called fire-and-forget (`void logActivity(...)`) from API route handlers so it
 * never delays the HTTP response. Failures are silently swallowed and logged to
 * console so they never break the primary operation.
 */
import { db } from "@/lib/db";
import type { ActivityEventType, Prisma } from "@prisma/client";

// ─── Typed metadata shapes per event ─────────────────────────────────────────

export interface ActivityReplayMetadata {
  /** Client-side timestamp captured when an offline mutation was queued. */
  clientQueuedAt?: string;
  /** ID of the IndexedDB mutation/inspection record that replayed this API call. */
  offlineMutationId?: string;
  /** True when the API call came from offline queue replay rather than live user input. */
  replayedFromOfflineQueue?: boolean;
  /** Milliseconds the item waited in local cache before this activity row was written. */
  offlineCacheDurationMs?: number;
}

type UnitRef = { building: string; level: string; unit: string };

type ActivityMetadataBody =
  | {
      eventType: "SCOPE_STATUS_UPDATED";
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
      fromStage: string | null;
      toStage: string | null;
      fromStatus: string | null;
      toStatus: string | null;
    }
  | {
      eventType: "SCOPE_INSPECTION_UPDATED";
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
      fromInspectionStatus: string | null;
      toInspectionStatus: string | null;
    }
  | {
      eventType: "SCOPE_STATUS_BULK_UPDATED";
      count: number;
      scopeStage: string | null;
      scopeStatus: string;
      /** All units affected — stored as structured objects for rich display in the activity log. */
      unitRefs: UnitRef[];
    }
  | {
      eventType: "SCOPE_STATUS_BULK_UNDONE";
      count: number;
      unitRefs: UnitRef[];
    }
  | {
      eventType: "SCOPE_INSPECTION_BULK_UPDATED";
      count: number;
      inspectionStatus: "READY" | "PASSED" | "FAILED" | null;
      unitRefs: UnitRef[];
    }
  | {
      eventType: "ISSUE_CREATED";
      issueId: string;
      shortDescription: string;
      issueType: string;
      unitRef: string | null;
      isBlockingWork: boolean;
    }
  | {
      eventType: "ISSUE_UPDATED";
      issueId: string;
      shortDescription: string;
      unitRef: string | null;
      changedFields: string[];
    }
  | {
      eventType: "ISSUE_DELETED";
      issueId: string;
      shortDescription: string;
      unitRef: string | null;
    }
  | {
      eventType: "ISSUE_BULK_CREATED";
      bulkGroupId: string;
      count: number;
      shortDescription: string;
      issueType: string;
      isBlockingWork: boolean;
    }
  | {
      eventType: "ISSUE_RESOLVED";
      issueId: string;
      shortDescription: string;
      unitRef: string | null;
    }
  | {
      eventType: "ISSUE_REOPENED";
      issueId: string;
      shortDescription: string;
      unitRef: string | null;
    }
  | {
      eventType: "ISSUE_ANNOTATION_UPDATED";
      issueId: string;
      shortDescription: string;
      unitRef: string | null;
      attachmentId: string;
    }
  | {
      eventType: "CLEAR_INSPECTION_SET";
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
      status: string;
    }
  | {
      eventType: "CLEAR_INSPECTION_DELETED";
      inspectionId: string;
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
      status: string;
    }
  | {
      eventType: "INSPECTION_BACKFILL_SET";
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
      status: "PASSED" | "FAILED";
    }
  | {
      eventType: "INSPECTION_BACKFILL_DELETED";
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
    }
  | {
      /** A form-based inspection was submitted (new attempt) or edited. */
      eventType: "INSPECTION_SUBMITTED";
      submissionId: string;
      formName: string;
      /** Form category, e.g. "CLEAR_INSPECTION" */
      category: string;
      outcome: "PASS" | "FAIL" | "COMPLETE";
      deficiencyCount: number;
      /** Number of inspection questions that failed. */
      failedQuestionCount?: number;
      /** Total deficiency occurrences across all failed questions. */
      totalDeficiencyCount?: number;
      /** 1-based attempt number for this scope+form combination */
      attemptNumber: number;
      /** Whether this was a new submission or an edit to the most-recent attempt */
      isEdit: boolean;
      unit: string;
      building: string;
      level: string;
      scopeRowId?: string;
      /** Human-readable scope type name, e.g. "Cabinets" */
      scopeName?: string;
    }
  | {
      /** Inspection offline sync failed — one upserted row per queued submission. */
      eventType: "INSPECTION_SYNC_FAILED";
      offlineMutationId: string;
      clientQueuedAt: string;
      formName: string;
      category: string;
      outcome: "PASS" | "FAIL" | "COMPLETE";
      errorKind: "rejected" | "exhausted";
      syncAttempts: number;
      errorMessage: string;
      httpStatus?: number;
      syncErrors: Array<{
        attempt: number;
        message: string;
        httpStatus?: number;
        errorKind: "retriable" | "rejected" | "exhausted" | "auth";
        recordedAt: string;
      }>;
      unit: string;
      building: string;
      level: string;
      scopeRowId?: string;
      scopeName?: string;
    }
  | {
      /** Offline mutation queue upload failed (observations, issues, scope status, etc.). */
      eventType: "MUTATION_SYNC_FAILED";
      offlineMutationId: string;
      clientQueuedAt: string;
      mutationType: string;
      itemSummary: string;
      errorKind: "rejected" | "exhausted";
      syncAttempts: number;
      errorMessage: string;
      httpStatus?: number;
      syncErrors: Array<{
        attempt: number;
        message: string;
        httpStatus?: number;
        errorKind: "retriable" | "rejected" | "exhausted" | "auth";
        recordedAt: string;
      }>;
      unit: string;
      building: string;
      level: string;
      rowId?: string;
      unitRef?: string | null;
    }
  | {
      eventType: "OBSERVATION_CREATED";
      observationId: string;
      title: string;
      observationType: string;
      unitRef: string | null;
    }
  | {
      eventType: "OBSERVATION_BULK_CREATED";
      bulkGroupId: string;
      count: number;
      title: string;
      observationType: string;
      unitRefs: UnitRef[];
    }
  | {
      eventType: "OBSERVATION_UPDATED";
      observationId: string;
      title: string;
      unitRef: string | null;
    }
  | {
      eventType: "OBSERVATION_IMAGE_VERSION_ADDED";
      observationId: string;
      title: string;
      unitRef: string | null;
      previousAttachmentId: string;
      newAttachmentId: string;
    }
  | {
      eventType: "OBSERVATION_ANNOTATION_UPDATED";
      observationId: string;
      title: string;
      unitRef: string | null;
      attachmentId: string;
    }
  | {
      eventType: "UNIT_ROW_CREATED";
      count: number;
      mode: "add" | "merge" | "overwrite";
      unitRefs: UnitRef[];
      source?: "upload" | "paste" | "menu";
    }
  | {
      eventType: "UNIT_ROW_DELETED";
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
    }
  | {
      eventType: "UNIT_ROWS_BULK_DELETED";
      count: number;
      unitRefs: UnitRef[];
      mode?: "overwrite";
    }
  | {
      eventType: "UNIT_INSTALLER_BULK_UPDATED";
      count: number;
      unifierSubId: string | null;
      installerName?: string | null;
      unitRefs: UnitRef[];
    }
  | {
      eventType: "SCOPE_SUBCONTRACTOR_UPDATED";
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
      fromUnifierSubId: string | null;
      toUnifierSubId: string | null;
      subcontractorName: string;
    }
  | {
      eventType: "UPM_ROW_UPDATED";
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
      changedFields: string[];
    }
  | {
      eventType: "SUB_SCOPE_INSTANCE_UPDATED";
      instanceId: string;
      rowId: string;
      unit: string;
      building: string;
      level: string;
      scopeName: string;
      changedFields: string[];
      fromStage: string | null;
      toStage: string | null;
      fromStatus: string | null;
      toStatus: string | null;
      fromInspectionStatus: string | null;
      toInspectionStatus: string | null;
    }
  | {
      eventType: "FIELD_MEDIA_UPLOAD_RATE_LIMITED";
      /** FormData `type` folder (issues, observations, album, …). */
      uploadType: string;
      windowKey: "per_minute" | "per_ten_minute";
      count: number;
      limit: number;
    }
  | {
      eventType: "UNIT_PHOTO_UPLOADED";
      attachmentId: string;
      unitRef: string;
      building: string;
      level: string;
      unit: string;
      sourceType: "general" | "status_update";
      sourceLabel: string | null;
    }
  | {
      eventType: "PROJECT_CLONED_AS_TEST";
      sourceProjectId: string;
      labelSuffix: string | null;
      counts: {
        rows: number;
        issues: number;
        observations: number;
        submissions: number;
        activityLogs: number;
      };
    }
  | {
      eventType: "CUSTOM_SITE_LOCATION_CREATED";
      locationId: string;
      name: string;
      placement: string;
      building: string;
      level: string;
    }
  | {
      eventType: "CUSTOM_SITE_LOCATION_DELETED";
      locationId: string;
      name: string;
      placement: string;
      building: string;
      level: string;
    }
  | {
      eventType: "CUSTOM_SITE_LOCATION_UPDATED";
      locationId: string;
      name: string;
      placement: string;
      building: string;
      level: string;
      previousName: string;
      previousPlacement: string;
    }
  | {
      eventType: "PROJECT_TEST_DATA_SEEDED";
      batchId: string;
      counts: {
        issues: number;
        observations: number;
        clearInspections: number;
        calibrations: number;
        comments: number;
        activityLogs: number;
      };
      configSummary: {
        issues: number;
        observations: number;
        clearInspections: number;
        calibrations: number;
        dateRangeDays: number;
        userCount: number;
      };
    }
  | {
      eventType: "PROJECT_TEST_DATA_BATCH_REMOVED";
      batchId: string;
      counts: {
        issues: number;
        observations: number;
        clearInspections: number;
        calibrations: number;
        comments: number;
        activityLogs: number;
      };
    }
  | {
      eventType: "FIELD_DAILY_DAILY_MANPOWER_SET";
      reportDate: string;
      dailyManpower: number | null;
      previousDailyManpower: number | null;
    };

export type ActivityMetadata = ActivityMetadataBody & ActivityReplayMetadata;

export function getActivityReplayMetadata(headers: Headers): ActivityReplayMetadata {
  const offlineMutationId = headers.get("x-offline-mutation-id")?.trim();
  const clientQueuedAt = headers.get("x-client-queued-at")?.trim();
  if (!offlineMutationId && !clientQueuedAt) return {};

  return enrichActivityReplayMetadata({
    ...(offlineMutationId ? { offlineMutationId } : {}),
    ...(clientQueuedAt ? { clientQueuedAt } : {}),
    replayedFromOfflineQueue: true,
  });
}

/** Stamp cache wait duration when an offline replay succeeds (server write time). */
export function enrichActivityReplayMetadata(
  meta: ActivityReplayMetadata,
  syncedAtMs: number = Date.now(),
): ActivityReplayMetadata {
  if (meta.replayedFromOfflineQueue !== true || !meta.clientQueuedAt) return meta;
  if (typeof meta.offlineCacheDurationMs === "number" && meta.offlineCacheDurationMs >= 0) {
    return meta;
  }
  const queuedMs = Date.parse(meta.clientQueuedAt);
  if (Number.isNaN(queuedMs) || syncedAtMs < queuedMs) return meta;
  return { ...meta, offlineCacheDurationMs: syncedAtMs - queuedMs };
}

// ─── Actor name resolver ──────────────────────────────────────────────────────

/**
 * Resolves a display name for the given userId from the database.
 * Returns null when the id is unknown — never guess from another user row.
 */
export async function resolveActorName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) return null;
    return user.name?.trim() || user.email?.trim() || null;
  } catch {
    return null;
  }
}

/** Prefer the signed-in session identity for activity attribution. */
export async function resolveActivityActorName(session: {
  user: { id?: string | null; name?: string | null; email?: string | null };
}): Promise<{ actorId: string | null; userName: string | null }> {
  const actorId = session.user.id ?? null;
  const fromSession = session.user.name?.trim() || session.user.email?.trim() || null;
  if (fromSession) {
    return { actorId, userName: fromSession };
  }
  const resolved = await resolveActorName(actorId);
  return { actorId, userName: resolved };
}

// ─── Logger function ──────────────────────────────────────────────────────────

export async function logActivity(
  projectId: string,
  userId: string | null,
  userName: string | null,
  meta: ActivityMetadata
): Promise<string | null> {
  try {
    const metadata = enrichActivityReplayMetadata(meta) as ActivityMetadata;
    const created = await db.activityLog.create({
      data: {
        projectId,
        userId: userId ?? null,
        userName: userName ?? null,
        eventType: metadata.eventType as ActivityEventType,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
    return created.id;
  } catch (err) {
    // Never let logging failures surface to the caller
    console.warn("[activity-logger] Failed to write activity log:", err);
    return null;
  }
}
