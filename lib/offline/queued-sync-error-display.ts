/**
 * Map persisted queue sync errors to user-facing copy (offlineCachePanel keys).
 */

import { isTransientSyncErrorMessage } from "@/lib/inspections/sync-network-errors";
import {
  isMutationSyncErrorCode,
  mutationSyncErrorMessageKey,
  mutationSyncErrorMessageValues,
} from "@/lib/offline/mutation-sync-errors";

export type OfflineCachePanelTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function isUnrecoverableMediaError(error?: string): boolean {
  return Boolean(error?.includes("Deferred inspection media blob missing"));
}

export function formatQueuedSyncErrorDisplay(
  error: string | undefined,
  t: OfflineCachePanelTranslator,
): string | null {
  if (!error) return null;
  if (isUnrecoverableMediaError(error)) return t("queuedItemMediaLostHint");
  if (isTransientSyncErrorMessage(error)) return t("queuedItemSyncRetryHint");
  if (isMutationSyncErrorCode(error)) {
    const key = mutationSyncErrorMessageKey(error);
    if (key) {
      return t(key, mutationSyncErrorMessageValues(error));
    }
  }
  if (error.includes("after 3 tries") || error.includes("did not respond")) {
    return t("queuedItemSyncRetryHint");
  }
  return error;
}

export async function firstQueuedSyncErrorDetail(
  t: OfflineCachePanelTranslator,
): Promise<string | null> {
  const { getQueuedUploadItems } = await import("@/lib/offline/queued-upload-items");
  const items = await getQueuedUploadItems().catch(() => []);
  for (const item of items) {
    const text = formatQueuedSyncErrorDisplay(item.lastSyncError, t);
    if (text) return text;
  }
  return null;
}
