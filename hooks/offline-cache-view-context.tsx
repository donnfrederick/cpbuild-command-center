"use client";

/**
 * Tracks when a page is rendering stale offline snapshot data so OfflineIndicator
 * can show one consolidated connectivity banner (no duplicate top-of-page strips).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface OfflineCacheViewContextValue {
  cachedViewDate: string | null;
  setCachedViewDate: (iso: string | null) => void;
}

const OfflineCacheViewContext = createContext<OfflineCacheViewContextValue | null>(null);

export function OfflineCacheViewProvider({ children }: { children: ReactNode }) {
  const [cachedViewDate, setCachedViewDateState] = useState<string | null>(null);
  const setCachedViewDate = useCallback((iso: string | null) => {
    setCachedViewDateState(iso);
  }, []);
  const value = useMemo(
    () => ({ cachedViewDate, setCachedViewDate }),
    [cachedViewDate, setCachedViewDate],
  );
  return (
    <OfflineCacheViewContext.Provider value={value}>
      {children}
    </OfflineCacheViewContext.Provider>
  );
}

export function useOfflineCacheView(): OfflineCacheViewContextValue {
  const ctx = useContext(OfflineCacheViewContext);
  if (!ctx) {
    throw new Error("useOfflineCacheView must be used inside <OfflineCacheViewProvider>");
  }
  return ctx;
}

/** Format ISO timestamp for cache banners (matches former page-level banners). */
export function formatOfflineCacheDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const locale =
    typeof document !== "undefined" && document.documentElement.lang
      ? document.documentElement.lang
      : undefined;
  return new Date(iso).toLocaleString(locale ?? [], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
