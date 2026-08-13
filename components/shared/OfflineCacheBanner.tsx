"use client";

/**
 * OfflineCacheBanner — shown when a page is displaying data from the offline
 * snapshot cache rather than a live API response.
 *
 * Usage:
 *   const { isFromCache, cacheDate } = useOfflineData(...);
 *   {isFromCache && <OfflineCacheBanner cacheDate={cacheDate} />}
 */

import { WifiOff } from "lucide-react";

interface OfflineCacheBannerProps {
  cacheDate: string | null;
}

export function OfflineCacheBanner({ cacheDate }: OfflineCacheBannerProps) {
  const formattedDate = cacheDate
    ? new Date(cacheDate).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        backgroundColor: "oklch(0.987 0.022 80)",
        border: "1px solid oklch(0.935 0.100 79)",
        borderRadius: 8,
        fontSize: 13,
        color: "oklch(0.526 0.127 57)",
        fontWeight: 500,
      }}
    >
      <WifiOff size={14} style={{ flexShrink: 0 }} aria-hidden />
      <span>
        Offline — showing cached data
        {formattedDate && (
          <span style={{ fontWeight: 400 }}> synced {formattedDate}</span>
        )}
      </span>
    </div>
  );
}
