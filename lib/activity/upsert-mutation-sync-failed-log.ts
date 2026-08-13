import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SyncErrorAttempt } from "@/lib/inspections/sync-error-history";
import {
  latestSyncError,
  sortSyncErrorsLatestFirst,
  terminalSyncErrorKind,
} from "@/lib/inspections/sync-error-history";
import { logActivity } from "@/lib/activity-logger";
import { MUTATION_SYNC_FAILED_DEFAULT_MESSAGE } from "@/lib/activity/mutation-sync-failure-labels";
import type { MutationType } from "@/lib/offline/mutation-queue";

const MAX_SYNC_ERRORS = 10;

export interface UpsertMutationSyncFailedInput {
  offlineMutationId: string;
  clientQueuedAt: string;
  mutationType: MutationType;
  itemSummary: string;
  syncErrors: SyncErrorAttempt[];
  unit?: string;
  building?: string;
  level?: string;
  rowId?: string;
  unitRef?: string | null;
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

export function buildMutationSyncFailedMetadata(input: UpsertMutationSyncFailedInput): {
  eventType: "MUTATION_SYNC_FAILED";
  offlineMutationId: string;
  clientQueuedAt: string;
  mutationType: MutationType;
  itemSummary: string;
  errorKind: "rejected" | "exhausted";
  syncAttempts: number;
  errorMessage: string;
  httpStatus?: number;
  syncErrors: SyncErrorAttempt[];
  unit: string;
  building: string;
  level: string;
  rowId?: string;
  unitRef?: string | null;
} {
  const syncErrors = capSyncErrors(input.syncErrors).map((entry) => ({
    ...entry,
    message: truncateMessage(entry.message),
  }));
  const latest = latestSyncError(syncErrors);
  return {
    eventType: "MUTATION_SYNC_FAILED",
    offlineMutationId: input.offlineMutationId,
    clientQueuedAt: input.clientQueuedAt,
    mutationType: input.mutationType,
    itemSummary: truncateMessage(input.itemSummary, 500),
    errorKind: terminalSyncErrorKind(syncErrors),
    syncAttempts: syncErrors.length > 0 ? syncErrors[syncErrors.length - 1]!.attempt : 0,
    errorMessage: latest?.message ?? MUTATION_SYNC_FAILED_DEFAULT_MESSAGE,
    httpStatus: latest?.httpStatus,
    syncErrors,
    unit: input.unit ?? "",
    building: input.building ?? "",
    level: input.level ?? "",
    ...(input.rowId ? { rowId: input.rowId } : {}),
    ...(input.unitRef !== undefined ? { unitRef: input.unitRef } : {}),
  };
}

export async function upsertMutationSyncFailedLog(
  projectId: string,
  userId: string | null,
  userName: string | null,
  input: UpsertMutationSyncFailedInput,
): Promise<{ created: boolean; updated: boolean; id: string }> {
  const metadata = buildMutationSyncFailedMetadata(input);

  const existing = await db.activityLog.findFirst({
    where: {
      projectId,
      eventType: "MUTATION_SYNC_FAILED",
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
      eventType: "MUTATION_SYNC_FAILED",
      metadata: { path: ["offlineMutationId"], equals: input.offlineMutationId },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  return { created: true, updated: false, id: created?.id ?? "" };
}
