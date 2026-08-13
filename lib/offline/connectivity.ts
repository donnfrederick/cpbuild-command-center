/**
 * Shared connectivity helpers — offline vs slow vs good.
 *
 * `navigator.onLine` alone is unreliable on mobile (LTE edge can report online
 * while fetches hang). We treat slow/unreachable the same as offline for
 * sync/flush paths: retry later instead of blocking the UI.
 */

export const CONNECTIVITY_PROBE_URL = "/api/connectivity";
export const CONNECTIVITY_PROBE_TIMEOUT_MS = 3000;
/** Per-request cap for field API reads (UnitCards, useOfflineData, etc.). */
export const DEFAULT_FETCH_TIMEOUT_MS = 8000;
/** Per-file cap when uploading inspection media during sync. */
export const MEDIA_UPLOAD_TIMEOUT_MS = 8000;

export type ConnectivityQuality = "offline" | "slow" | "good";

let cachedQuality: ConnectivityQuality | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 15_000;

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function clearConnectivityCache(): void {
  cachedQuality = null;
  cachedAt = 0;
}

/**
 * GET /api/connectivity with a short timeout.
 * - offline: browser reports offline or fetch aborted/failed
 * - slow: response received but slower than probe budget, or non-ok
 * - good: ok within budget
 */
export async function probeConnectivityQuality(
  timeoutMs: number = CONNECTIVITY_PROBE_TIMEOUT_MS,
  options?: { ignoreNavigatorOffline?: boolean },
): Promise<ConnectivityQuality> {
  if (!options?.ignoreNavigatorOffline && isBrowserOffline()) return "offline";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(CONNECTIVITY_PROBE_URL, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    const elapsed = Date.now() - start;
    if (!res.ok || elapsed >= timeoutMs) return "slow";
    return "good";
  } catch {
    return isBrowserOffline() ? "offline" : "slow";
  } finally {
    clearTimeout(timer);
  }
}

/** Cached probe — avoids hammering /api/connectivity on every row action. */
export async function getConnectivityQuality(
  options?: { bypassCache?: boolean },
): Promise<ConnectivityQuality> {
  if (!options?.bypassCache && cachedQuality && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedQuality;
  }
  const quality = await probeConnectivityQuality();
  cachedQuality = quality;
  cachedAt = Date.now();
  return quality;
}

/** True when network work should queue locally instead of hitting the server. */
export async function shouldDeferNetworkWork(
  options?: { bypassCache?: boolean },
): Promise<boolean> {
  const quality = await getConnectivityQuality(options);
  return quality !== "good";
}

/** fetch() with AbortController timeout — rejects with DOMException AbortError on timeout. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort);
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/** Alias used by background-sync — good means GET /api/connectivity within 3s. */
export async function isConnectionGood(): Promise<boolean> {
  return (await probeConnectivityQuality()) === "good";
}

type QualityListener = (prev: ConnectivityQuality, next: ConnectivityQuality) => void;
const qualityListeners = new Set<QualityListener>();

/** Subscribe to quality transitions (e.g. slow → good flush). */
export function subscribeConnectivityQuality(listener: QualityListener): () => void {
  qualityListeners.add(listener);
  return () => {
    qualityListeners.delete(listener);
  };
}

export function notifyConnectivityQualityChange(
  prev: ConnectivityQuality,
  next: ConnectivityQuality,
): void {
  if (prev === next) return;
  cachedQuality = next;
  cachedAt = Date.now();
  for (const listener of qualityListeners) {
    try {
      listener(prev, next);
    } catch (err) {
      console.warn("[connectivity] quality listener failed:", err);
    }
  }
}
