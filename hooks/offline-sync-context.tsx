"use client";

/**
 * OfflineSyncContext — shared singleton for offline sync state.
 *
 * Prevents multiple components (OfflineIndicator, OfflineProjectButton,
 * ProjectOfflineCacheSection) from each instantiating their own useOfflineSync()
 * hook, which would fire N simultaneous requests to /api/offline/preferences on
 * every page load — one per project row in the list — exhausting DB connections.
 *
 * Usage:
 *   - Wrap layouts with <OfflineSyncProvider> (client component inside the server layout)
 *   - Components call useOfflineSyncContext() instead of useOfflineSync()
 */

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useOfflineSync, type OfflineSyncState } from "@/hooks/use-offline-sync";
import { useInspectionSync, type InspectionSyncState } from "@/lib/inspections/useInspectionSync";
import { PreDownloadProgressOverlay } from "@/components/projects/PreDownloadProgressOverlay";
import { PendingInspectionOpenHost } from "@/components/shared/PendingInspectionOpenHost";
import { PendingMutationOpenHost } from "@/components/shared/PendingMutationOpenHost";
import { StatusPhotoRetakeHost } from "@/components/shared/StatusPhotoRetakeHost";

export type OfflineSyncContextState = OfflineSyncState &
  InspectionSyncState & {
    /** True after the client has hydrated — safe to read localStorage-backed prefs in UI. */
    isHydrated: boolean;
  };

const OfflineSyncContext = createContext<OfflineSyncContextState | null>(null);

type HydrationStore = {
  ready: boolean;
  listeners: Set<() => void>;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => boolean;
  markReady: () => void;
};

function createHydrationStore(): HydrationStore {
  const listeners = new Set<() => void>();
  const store: HydrationStore = {
    ready: false,
    listeners,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return store.ready;
    },
    markReady() {
      if (store.ready) return;
      store.ready = true;
      for (const listener of listeners) {
        listener();
      }
    },
  };
  return store;
}

function getServerHydrationSnapshot(): boolean {
  return false;
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createHydrationStore);

  useEffect(() => {
    store.markReady();
  }, [store]);

  const isHydrated = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerHydrationSnapshot,
  );

  const state = useOfflineSync(isHydrated);
  const inspectionSync = useInspectionSync();
  return (
    <OfflineSyncContext.Provider value={{ ...state, ...inspectionSync, isHydrated }}>
      {children}
      <PreDownloadProgressOverlay />
      <PendingInspectionOpenHost />
      <PendingMutationOpenHost />
      <StatusPhotoRetakeHost />
    </OfflineSyncContext.Provider>
  );
}

/**
 * Returns the shared offline sync state from the nearest OfflineSyncProvider.
 * Throws if called outside a provider so missing wraps surface immediately.
 */
export function useOfflineSyncContext(): OfflineSyncContextState {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error("useOfflineSyncContext must be used inside <OfflineSyncProvider>");
  }
  return ctx;
}
