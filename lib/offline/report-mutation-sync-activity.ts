"use client";

import type { QueuedMutation } from "@/lib/offline/mutation-queue";
import { mutationActivityItemSummary } from "@/lib/offline/mutation-activity-label";

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

function locationFromMutation(mutation: QueuedMutation): {
  unit: string;
  building: string;
  level: string;
  rowId?: string;
  unitRef?: string | null;
} {
  const body = asRecord(mutation.body);
  if (mutation.type === "unit-status") {
    return {
      unit: typeof body.unit === "string" ? body.unit : "",
      building: typeof body.building === "string" ? body.building : "",
      level: typeof body.level === "string" ? body.level : "",
      rowId: rowIdFromUrl(mutation.url) ?? undefined,
    };
  }
  const unitRef = typeof body.unitRef === "string" ? body.unitRef : null;
  if (unitRef) {
    const [building = "", level = "", unit = ""] = unitRef.split("|");
    return { unit: unit.trim(), building: building.trim(), level: level.trim(), unitRef };
  }
  return { unit: "", building: "", level: "", unitRef: unitRef ?? null };
}

export function buildMutationSyncFailedActivityBody(
  mutation: QueuedMutation,
): Record<string, unknown> | null {
  const history = mutation.syncErrorHistory ?? [];
  if (history.length === 0) return null;

  const projectId = projectIdFromUrl(mutation.url);
  if (!projectId) return null;

  return {
    offlineMutationId: mutation.id,
    clientQueuedAt: new Date(mutation.queuedAt).toISOString(),
    mutationType: mutation.type,
    itemSummary: mutationActivityItemSummary(mutation),
    syncErrors: history,
    ...locationFromMutation(mutation),
  };
}

export function reportMutationSyncActivityFailure(mutation: QueuedMutation): void {
  if (typeof window === "undefined" || !navigator.onLine) return;

  const body = buildMutationSyncFailedActivityBody(mutation);
  if (!body) return;

  const projectId = projectIdFromUrl(mutation.url);
  if (!projectId) return;

  void fetch(`/api/projects/${encodeURIComponent(projectId)}/activity/mutation-sync-failed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.warn("[mutation-sync-activity] Failed to report sync error:", err);
  });
}
