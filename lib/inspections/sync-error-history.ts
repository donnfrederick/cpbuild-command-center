/** One failed sync attempt recorded client-side and mirrored in activity_logs metadata. */
export type SyncErrorKind = "retriable" | "rejected" | "exhausted" | "auth";

export interface SyncErrorAttempt {
  /** 1-based attempt number after markFailed */
  attempt: number;
  message: string;
  httpStatus?: number;
  errorKind: SyncErrorKind;
  recordedAt: string;
}

export interface SyncErrorAttemptInput {
  message: string;
  httpStatus?: number;
  errorKind: SyncErrorKind;
}

export function sortSyncErrorsLatestFirst(
  history: SyncErrorAttempt[] | undefined,
): SyncErrorAttempt[] {
  if (!history?.length) return [];
  return [...history].sort((a, b) => b.attempt - a.attempt);
}

export function latestSyncError(history: SyncErrorAttempt[] | undefined): SyncErrorAttempt | null {
  const sorted = sortSyncErrorsLatestFirst(history);
  return sorted[0] ?? null;
}

export function terminalSyncErrorKind(
  history: SyncErrorAttempt[] | undefined,
): "rejected" | "exhausted" {
  const latest = latestSyncError(history);
  if (latest?.errorKind === "exhausted") return "exhausted";
  if (latest?.errorKind === "rejected" || latest?.errorKind === "auth") return "rejected";
  const attempts = history?.length ?? 0;
  if (attempts >= 3) return "exhausted";
  return "rejected";
}
