"use client";

import { useEffect } from "react";
import { useOfflineCacheView } from "@/hooks/offline-cache-view-context";

/** Register stale snapshot date with OfflineIndicator while a page shows cached data. */
export function useRegisterOfflineCacheView(isFromCache: boolean, cacheDate: string | null) {
  const { setCachedViewDate } = useOfflineCacheView();

  useEffect(() => {
    // Empty string when generatedAt is missing — OfflineIndicator shows em dash.
    setCachedViewDate(isFromCache ? (cacheDate ?? "") : null);
    return () => setCachedViewDate(null);
  }, [isFromCache, cacheDate, setCachedViewDate]);
}
