"use client";

/**
 * Single app-wide offline sync + cache view context.
 * Lives in locale layout so pre-download overlay persists across route groups.
 */

import type { ReactNode } from "react";
import { OfflineSyncProvider } from "@/hooks/offline-sync-context";
import { OfflineCacheViewProvider } from "@/hooks/offline-cache-view-context";

export function OfflineSyncRoot({ children }: { children: ReactNode }) {
  return (
    <OfflineSyncProvider>
      <OfflineCacheViewProvider>{children}</OfflineCacheViewProvider>
    </OfflineSyncProvider>
  );
}
