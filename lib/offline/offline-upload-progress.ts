/**
 * Shared upload-queue progress — mutation flush + inspection flush.
 * Subscribers: OfflineIndicator strip, OfflineCachePanel row highlights.
 */

import type { MutationType } from "@/lib/offline/mutation-queue";

export type OfflineUploadKind = "mutation" | "inspection";

export type OfflineUploadPhase = "idle" | "media" | "request";

export interface OfflineUploadProgress {
  active: boolean;
  kind: OfflineUploadKind | null;
  phase: OfflineUploadPhase;
  done: number;
  total: number;
  currentItemId: string | null;
  currentType: MutationType | null;
}

const IDLE: OfflineUploadProgress = {
  active: false,
  kind: null,
  phase: "idle",
  done: 0,
  total: 0,
  currentItemId: null,
  currentType: null,
};

let snapshot: OfflineUploadProgress = { ...IDLE };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getOfflineUploadProgressSnapshot(): OfflineUploadProgress {
  return snapshot;
}

export function subscribeOfflineUploadProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function patchOfflineUploadProgress(
  patch: Partial<OfflineUploadProgress> & Pick<OfflineUploadProgress, "active">,
): void {
  snapshot = { ...snapshot, ...patch };
  emit();
}

export function clearOfflineUploadProgress(): void {
  snapshot = { ...IDLE };
  emit();
}

/** Vitest reset */
export function resetOfflineUploadProgressForTests(): void {
  snapshot = { ...IDLE };
  listeners.clear();
}

export type QueuedUploadRowStatus = "uploading" | "pending" | "idle";

export function queuedUploadRowStatus(
  itemId: string,
  progress: OfflineUploadProgress,
): QueuedUploadRowStatus {
  if (!progress.active || !progress.currentItemId) return "idle";
  if (progress.currentItemId === itemId) return "uploading";
  return "pending";
}
