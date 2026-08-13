"use client";

import { useSyncExternalStore } from "react";

/**
 * Returns true only in the browser (after hydration), false on the server.
 *
 * Uses useSyncExternalStore — the React-recommended approach for safe
 * client/server divergence without triggering "Can't perform a React state
 * update on a component that hasn't mounted yet" warnings in React 19+.
 */
export function useIsBrowser(): boolean {
  return useSyncExternalStore(
    () => () => {},   // subscribe — nothing to subscribe to
    () => true,       // client snapshot
    () => false       // server snapshot
  );
}
