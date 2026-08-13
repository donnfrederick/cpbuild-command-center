/**
 * Stable error codes persisted on queued mutations when flush fails.
 * UI maps these to translated strings in offlineCachePanel.
 */

export const MUTATION_SYNC_ERROR = {
  BLOB_MISSING: "mutation:blob_missing",
  UPLOAD_FAILED: "mutation:upload_failed",
  NETWORK: "mutation:network",
  MAX_ATTEMPTS: "mutation:max_attempts",
} as const;

export type MutationSyncErrorCode =
  (typeof MUTATION_SYNC_ERROR)[keyof typeof MUTATION_SYNC_ERROR]
  | `mutation:http:${number}`
  | `mutation:http:${number}:${string}`;

export function formatHttpMutationError(status: number, serverMessage?: string): MutationSyncErrorCode {
  const msg = serverMessage?.trim();
  if (msg) return `mutation:http:${status}:${msg.slice(0, 160)}`;
  return `mutation:http:${status}`;
}

export function isMutationSyncErrorCode(value: string): boolean {
  return value.startsWith("mutation:");
}

/** Map persisted codes to offlineCachePanel translation keys. */
export function mutationSyncErrorMessageKey(
  code: string,
): "queuedItemMutationBlobMissing" | "queuedItemMutationUploadFailed" | "queuedItemMutationNetwork" | "queuedItemMutationMaxAttempts" | "queuedItemMutationHttpStatus" | "queuedItemMutationHttpDetail" | null {
  switch (code) {
    case MUTATION_SYNC_ERROR.BLOB_MISSING:
      return "queuedItemMutationBlobMissing";
    case MUTATION_SYNC_ERROR.UPLOAD_FAILED:
      return "queuedItemMutationUploadFailed";
    case MUTATION_SYNC_ERROR.NETWORK:
      return "queuedItemMutationNetwork";
    case MUTATION_SYNC_ERROR.MAX_ATTEMPTS:
      return "queuedItemMutationMaxAttempts";
    default:
      break;
  }
  if (code.startsWith("mutation:http:")) {
    const rest = code.slice("mutation:http:".length);
    const colon = rest.indexOf(":");
    if (colon === -1) return "queuedItemMutationHttpStatus";
    return "queuedItemMutationHttpDetail";
  }
  return null;
}

export function mutationSyncErrorMessageValues(code: string): Record<string, string | number> {
  if (!code.startsWith("mutation:http:")) return {};
  const rest = code.slice("mutation:http:".length);
  const colon = rest.indexOf(":");
  if (colon === -1) {
    return { status: rest };
  }
  return {
    status: rest.slice(0, colon),
    message: rest.slice(colon + 1),
  };
}
