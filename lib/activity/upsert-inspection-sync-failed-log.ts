import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SyncErrorAttempt } from "@/lib/inspections/sync-error-history";
import {
  latestSyncError,
  sortSyncErrorsLatestFirst,
  terminalSyncErrorKind,
} from "@/lib/inspections/sync-error-history";
import {
  INSPECTION_SYNC_FAILED_DEFAULT_MESSAGE,
} from "@/lib/activity/inspection-sync-failure-labels";
import { logActivity } from "@/lib/activity-logger";

const MAX_SYNC_ERRORS = 10;

export interface UpsertInspectionSyncFailedInput {
  offlineMutationId: string;
  clientQueuedAt: string;
  formName: string;
  category: string;
  outcome: "PASS" | "FAIL" | "COMPLETE";
  syncErrors: SyncErrorAttempt[];
  unit: string;
  building: string;
  level: string;
  scopeRowId?: string;
  scopeName?: string;
}

function capSyncErrors(syncErrors: SyncErrorAttempt[]): SyncErrorAttempt[] {
  const sorted = sortSyncErrorsLatestFirst(syncErrors).slice(0, MAX_SYNC_ERRORS);
  return sorted.sort((a, b) => a.attempt - b.attempt);
}

function truncateMessage(message: string, max = 2000): string {
  const trimmed = message.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function buildInspectionSyncFailedMetadata(
  input: UpsertInspectionSyncFailedInput,
): {
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
  syncErrors: SyncErrorAttempt[];
  unit: string;
  building: string;
  level: string;
  scopeRowId?: string;
  scopeName?: string;
} {
  const syncErrors = capSyncErrors(input.syncErrors).map((entry) => ({
    ...entry,
    message: truncateMessage(entry.message),
  }));
  const latest = latestSyncError(syncErrors);
  return {
    eventType: "INSPECTION_SYNC_FAILED",
    offlineMutationId: input.offlineMutationId,
    clientQueuedAt: input.clientQueuedAt,
    formName: input.formName,
    category: input.category,
    outcome: input.outcome,
    errorKind: terminalSyncErrorKind(syncErrors),
    syncAttempts: syncErrors.length > 0 ? syncErrors[syncErrors.length - 1]!.attempt : 0,
    errorMessage: latest?.message ?? INSPECTION_SYNC_FAILED_DEFAULT_MESSAGE,
    httpStatus: latest?.httpStatus,
    syncErrors,
    unit: input.unit,
    building: input.building,
    level: input.level,
    ...(input.scopeRowId ? { scopeRowId: input.scopeRowId } : {}),
    ...(input.scopeName ? { scopeName: input.scopeName } : {}),
  };
}

export async function upsertInspectionSyncFailedLog(
  projectId: string,
  userId: string | null,
  userName: string | null,
  input: UpsertInspectionSyncFailedInput,
): Promise<{ created: boolean; updated: boolean; id: string }> {
  const metadata = buildInspectionSyncFailedMetadata(input);

  const existing = await db.activityLog.findFirst({
    where: {
      projectId,
      eventType: "INSPECTION_SYNC_FAILED",
      metadata: { path: ["offlineMutationId"], equals: input.offlineMutationId },
    },
    select: { id: true },
  });

  if (existing) {
    await db.activityLog.update({
      where: { id: existing.id },
      data: {
        metadata: metadata as unknown as Prisma.InputJsonValue,
        createdAt: new Date(),
        userId: userId ?? null,
        userName: userName ?? null,
      },
    });
    return { created: false, updated: true, id: existing.id };
  }

  await logActivity(projectId, userId, userName, metadata);
  const created = await db.activityLog.findFirst({
    where: {
      projectId,
      eventType: "INSPECTION_SYNC_FAILED",
      metadata: { path: ["offlineMutationId"], equals: input.offlineMutationId },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  return { created: true, updated: false, id: created?.id ?? "" };
}
