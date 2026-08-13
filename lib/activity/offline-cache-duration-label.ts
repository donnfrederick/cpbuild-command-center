import {
  formatOfflineCacheDurationLocalized,
  isReplayedFromOfflineQueue,
  resolveOfflineCacheDurationMs,
  type OfflineCacheDurationI18n,
} from "@/lib/activity/offline-replay-display";

export function buildOfflineCacheDurationI18n(
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): OfflineCacheDurationI18n {
  return {
    underOneMinute: t("offlineCacheDurationUnderOneMinute"),
    minutes: (count) => t("offlineCacheDurationMinutes", { count }),
    hoursOnly: (hours) => t("offlineCacheDurationHours", { hours }),
    hoursMinutes: (hours, minutes) => t("offlineCacheDurationHoursMinutes", { hours, minutes }),
    daysOnly: (days) => t("offlineCacheDurationDays", { days }),
    daysHours: (days, hours) => t("offlineCacheDurationDaysHours", { days, hours }),
  };
}

export function offlineCacheDurationLabel(
  metadata: Record<string, unknown>,
  createdAt: string,
  i18n: OfflineCacheDurationI18n,
): string | null {
  if (!isReplayedFromOfflineQueue(metadata)) return null;
  const ms = resolveOfflineCacheDurationMs(metadata, createdAt);
  if (ms === null) return null;
  return formatOfflineCacheDurationLocalized(ms, i18n);
}

export function syncedFromCacheBadgeLabel(
  metadata: Record<string, unknown>,
  createdAt: string,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  const duration = offlineCacheDurationLabel(metadata, createdAt, buildOfflineCacheDurationI18n(t));
  if (duration) {
    return t("syncedFromCacheBadgeWithDuration", { duration });
  }
  return t("syncedFromCacheBadge");
}

export function syncedFromCacheBadgeTitle(
  metadata: Record<string, unknown>,
  createdAt: string,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  const duration = offlineCacheDurationLabel(metadata, createdAt, buildOfflineCacheDurationI18n(t));
  if (duration) {
    return t("syncedFromCacheHintWithDuration", { duration });
  }
  return t("syncedFromCacheHintShort");
}
