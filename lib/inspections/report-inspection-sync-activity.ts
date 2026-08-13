"use client";

/**
 * Fire-and-forget client reporter for inspection sync failures → activity_logs upsert.
 */

import { UNKNOWN_INSPECTION_FORM_NAME } from "@/lib/activity/inspection-sync-failure-labels";
import { buildInspectionActivityLocationMetadata } from "@/lib/inspections/unit-inspection-ref";
import type { PendingInspection } from "@/lib/inspections/inspectionOfflineDb";
import type { SyncErrorAttempt } from "@/lib/inspections/sync-error-history";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export function buildInspectionSyncFailedActivityBody(record: PendingInspection): Record<string, unknown> | null {
  const history = record.syncErrorHistory ?? [];
  if (history.length === 0) return null;

  const template = asRecord(record.templateSnapshot);
  const locationMeta = buildInspectionActivityLocationMetadata({
    scopeRowId: record.scopeRowId ?? null,
    unitId: record.unitId,
    scopeTypeCode: record.scopeTypeCode ?? null,
  });

  return {
    offlineMutationId: record.localId,
    clientQueuedAt: record.submittedAt,
    formName: String(template.name ?? UNKNOWN_INSPECTION_FORM_NAME),
    category: record.categoryOverride ?? String(template.category ?? "OTHER"),
    outcome: record.outcome,
    syncErrors: history,
    ...locationMeta,
  };
}

export function reportInspectionSyncActivityFailure(
  record: PendingInspection,
  syncErrors?: SyncErrorAttempt[],
): void {
  if (typeof window === "undefined" || !navigator.onLine) return;

  const body = buildInspectionSyncFailedActivityBody({
    ...record,
    syncErrorHistory: syncErrors ?? record.syncErrorHistory ?? [],
  });
  if (!body) return;

  void fetch(`/api/projects/${encodeURIComponent(record.projectId)}/activity/inspection-sync-failed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.warn("[inspection-sync-activity] Failed to report sync error:", err);
  });
}
