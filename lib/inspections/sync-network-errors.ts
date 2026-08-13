/** True when the browser reports no network (airplane mode, etc.). */
export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

/** Fetch failures caused by offline / SW NetworkOnly — not a user-facing sync failure. */
export function isTransientFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return isTransientSyncErrorMessage(err.message);
}

export function isTransientSyncErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("service worker is an error") ||
    m.includes("failed to fetch") ||
    m.includes("network error while syncing") ||
    m.includes("network request failed") ||
    m.includes("load failed")
  );
}
