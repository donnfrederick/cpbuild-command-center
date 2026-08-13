/**
 * Shared browser online flag — single source of truth for all useOfflineStatus consumers.
 *
 * `window` "online"/"offline" events are unreliable on mobile PWAs (Wi‑Fi can return
 * without firing "online"). We reconcile from navigator.onLine on visibility and on an
 * interval, probe `/api/connectivity` when the browser still claims offline (iOS airplane
 * mode lag), and treat successful mutation sync as proof of connectivity.
 */

import {
  CONNECTIVITY_PROBE_TIMEOUT_MS,
  probeConnectivityQuality,
  subscribeConnectivityQuality,
} from "@/lib/offline/connectivity";
import { OFFLINE_SYNC_COMPLETE_EVENT } from "@/lib/offline/events";

type OnlineListener = () => void;

const listeners = new Set<OnlineListener>();
let snapshot = true;
let initialized = false;
let probeInFlight: Promise<void> | null = null;

const RECONCILE_INTERVAL_MS = 2_000;

function readNavigatorOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(next: boolean): void {
  if (snapshot === next) return;
  snapshot = next;
  emit();
}

/** Probe the server when navigator.onLine is stale (common after airplane mode on iOS). */
export async function reconcileBrowserOnlineStatusViaProbe(): Promise<void> {
  if (readNavigatorOnline()) {
    setSnapshot(true);
    return;
  }
  if (probeInFlight) {
    await probeInFlight;
    return;
  }
  probeInFlight = (async () => {
    const quality = await probeConnectivityQuality(CONNECTIVITY_PROBE_TIMEOUT_MS, {
      ignoreNavigatorOffline: true,
    });
    setSnapshot(quality !== "offline");
  })().finally(() => {
    probeInFlight = null;
  });
  await probeInFlight;
}

/**
 * Fast path: trust navigator when true; otherwise verify with a connectivity probe.
 */
export function reconcileBrowserOnlineStatus(): void {
  if (readNavigatorOnline()) {
    setSnapshot(true);
    return;
  }
  void reconcileBrowserOnlineStatusViaProbe();
}

/** SSR / pre-hydration default — optimistic online. */
export function getBrowserOnlineSnapshot(): boolean {
  return snapshot;
}

export function subscribeBrowserOnlineStatus(listener: OnlineListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Idempotent — safe to call from every useOfflineStatus mount. */
export function initBrowserOnlineStatusTracking(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  queueMicrotask(() => reconcileBrowserOnlineStatus());

  window.addEventListener("online", () => {
    setSnapshot(true);
    void reconcileBrowserOnlineStatusViaProbe();
  });
  window.addEventListener("offline", () => setSnapshot(false));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      reconcileBrowserOnlineStatus();
    }
  });

  window.addEventListener("pageshow", () => {
    reconcileBrowserOnlineStatus();
  });

  setInterval(() => {
    if (document.visibilityState === "visible") {
      reconcileBrowserOnlineStatus();
    }
  }, RECONCILE_INTERVAL_MS);

  window.addEventListener(OFFLINE_SYNC_COMPLETE_EVENT, () => {
    setSnapshot(true);
  });

  subscribeConnectivityQuality((_prev, next) => {
    if (next !== "offline") {
      setSnapshot(true);
    } else if (!readNavigatorOnline()) {
      setSnapshot(false);
    }
  });
}

/** Vitest reset — clears singleton state between tests. */
export function resetBrowserOnlineStatusForTests(): void {
  initialized = false;
  snapshot = true;
  probeInFlight = null;
  listeners.clear();
}

/** Test helper — force snapshot without navigator events. */
export function setBrowserOnlineSnapshotForTests(next: boolean): void {
  setSnapshot(next);
}
