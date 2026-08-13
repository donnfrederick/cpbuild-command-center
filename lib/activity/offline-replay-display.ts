/**
 * Helpers for activity rows replayed from the offline queue after a delayed upload.
 */

export interface OfflineReplayMetadata {
  pendingSync?: boolean;
  replayedFromOfflineQueue?: boolean;
  clientQueuedAt?: string;
  /** Milliseconds the item waited in local cache before a successful server sync. */
  offlineCacheDurationMs?: number;
}

export function isReplayedFromOfflineQueue(metadata: Record<string, unknown>): boolean {
  return metadata.replayedFromOfflineQueue === true && metadata.pendingSync !== true;
}

export function offlineQueuedAtIso(metadata: Record<string, unknown>): string | null {
  const raw = metadata.clientQueuedAt;
  return typeof raw === "string" && raw.trim().length > 0 ? raw : null;
}

export function computeOfflineCacheDurationMs(
  clientQueuedAt: string,
  syncedAtMs: number,
): number | null {
  const queuedMs = Date.parse(clientQueuedAt);
  if (Number.isNaN(queuedMs) || Number.isNaN(syncedAtMs) || syncedAtMs < queuedMs) return null;
  return syncedAtMs - queuedMs;
}

/** Prefer persisted duration; fall back to queue timestamp vs activity createdAt. */
export function resolveOfflineCacheDurationMs(
  metadata: Record<string, unknown>,
  activityCreatedAt?: string,
): number | null {
  const stored = metadata.offlineCacheDurationMs;
  if (typeof stored === "number" && Number.isFinite(stored) && stored >= 0) {
    return stored;
  }
  const queuedAt = offlineQueuedAtIso(metadata);
  if (!queuedAt) return null;
  const syncedMs = activityCreatedAt ? Date.parse(activityCreatedAt) : Date.now();
  if (Number.isNaN(syncedMs)) return null;
  return computeOfflineCacheDurationMs(queuedAt, syncedMs);
}

/** Whole minutes the item waited in the local queue before this activity row was created. */
export function offlineQueueWaitMinutes(
  metadata: Record<string, unknown>,
  activityCreatedAt: string,
): number | null {
  const ms = resolveOfflineCacheDurationMs(metadata, activityCreatedAt);
  if (ms === null) return null;
  return Math.max(1, Math.round(ms / 60_000));
}

/** English compact label for exports and activity summaries (not UI i18n). */
export function formatOfflineCacheDurationCompactEn(ms: number): string {
  if (ms < 60_000) return "under 1 min";
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} day${days !== 1 ? "s" : ""} ${remHours} hr` : `${days} day${days !== 1 ? "s" : ""}`;
}

export function appendOfflineCacheReplaySuffix(
  description: string,
  metadata: Record<string, unknown>,
  createdAt?: string,
): string {
  if (!isReplayedFromOfflineQueue(metadata)) return description;
  const ms = resolveOfflineCacheDurationMs(metadata, createdAt);
  if (ms === null) return `${description} · Uploaded from cache`;
  return `${description} · Uploaded from cache after ${formatOfflineCacheDurationCompactEn(ms)}`;
}

export type OfflineCacheDurationI18n = {
  underOneMinute: string;
  minutes: (count: number) => string;
  hoursOnly: (hours: number) => string;
  hoursMinutes: (hours: number, minutes: number) => string;
  daysOnly: (days: number) => string;
  daysHours: (days: number, hours: number) => string;
};

/** Localized duration for badges and inline activity labels. */
export function formatOfflineCacheDurationLocalized(
  ms: number,
  i18n: OfflineCacheDurationI18n,
): string {
  if (ms < 60_000) return i18n.underOneMinute;
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return i18n.minutes(totalMinutes);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes > 0 ? i18n.hoursMinutes(hours, minutes) : i18n.hoursOnly(hours);
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? i18n.daysHours(days, remHours) : i18n.daysOnly(days);
}
