import { MUTATION_SYNC_ERROR } from "@/lib/offline/mutation-sync-errors";

/** Human-readable English message for activity log + sync error history. */
export function mutationSyncErrorToDisplayMessage(code: string): string {
  switch (code) {
    case MUTATION_SYNC_ERROR.BLOB_MISSING:
      return "Attached photo is missing from local storage.";
    case MUTATION_SYNC_ERROR.UPLOAD_FAILED:
      return "Photo upload failed before the change could be saved.";
    case MUTATION_SYNC_ERROR.NETWORK:
      return "Network error while uploading.";
    case MUTATION_SYNC_ERROR.MAX_ATTEMPTS:
      return "Automatic retries exhausted.";
    default:
      break;
  }
  if (code.startsWith("mutation:http:")) {
    const rest = code.slice("mutation:http:".length);
    const colon = rest.indexOf(":");
    if (colon === -1) {
      return `Server rejected upload (HTTP ${rest}).`;
    }
    const status = rest.slice(0, colon);
    const message = rest.slice(colon + 1).trim();
    return message ? `${message} (HTTP ${status})` : `Server rejected upload (HTTP ${status}).`;
  }
  return code;
}

export function httpStatusFromMutationSyncError(code: string): number | undefined {
  if (!code.startsWith("mutation:http:")) return undefined;
  const rest = code.slice("mutation:http:".length);
  const colon = rest.indexOf(":");
  const statusText = colon === -1 ? rest : rest.slice(0, colon);
  const status = Number.parseInt(statusText, 10);
  return Number.isFinite(status) ? status : undefined;
}
