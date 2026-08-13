/**
 * Tracks when InspectionFillOverlay (or similar full-screen inspection work)
 * is open so layout chrome (OfflineIndicator strip) can step aside on mobile.
 */

let openCount = 0;
const listeners = new Set<() => void>();

export const INSPECTION_OVERLAY_CHROME_EVENT = "inspection-overlay-chrome";

function emit(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INSPECTION_OVERLAY_CHROME_EVENT));
  listeners.forEach((listener) => listener());
}

export function notifyInspectionOverlayOpened(): void {
  openCount += 1;
  emit();
}

export function notifyInspectionOverlayClosed(): void {
  openCount = Math.max(0, openCount - 1);
  emit();
}

export function isInspectionOverlayChromeSuppressed(): boolean {
  return openCount > 0;
}

export function subscribeInspectionOverlayChrome(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper — reset between unit tests. */
export function resetInspectionOverlayChromeForTests(): void {
  openCount = 0;
  listeners.clear();
}
