/**
 * Inspection submit sync feedback — consumed by OfflineIndicator bottom strip
 * (no top banner; avoids stacking with offline/pending messages).
 */

export type InspectionSyncStatusVariant = "loading" | "queued" | "success" | "error";

export interface InspectionSyncStatusPayload {
  id: string;
  variant: InspectionSyncStatusVariant;
  title: string;
  description?: string;
  /** When true, show a Retry control that triggers tryFlushPending. */
  showRetry?: boolean;
}

export const INSPECTION_SYNC_STATUS_EVENT = "inspection-sync-status";

/** Stable id for the persistent pending-upload reminder (distinct from per-submit banners). */
export const PENDING_INSPECTION_REMINDER_STATUS_ID = "pending-inspection-reminder";

type InspectionSyncStatusEventDetail =
  | { action: "show"; status: InspectionSyncStatusPayload }
  | { action: "update"; status: InspectionSyncStatusPayload }
  | { action: "dismiss"; id: string };

function dispatch(detail: InspectionSyncStatusEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INSPECTION_SYNC_STATUS_EVENT, { detail }));
}

export function isUnitDetailModalOpen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("unit-detail-modal-title"));
}

/** Narrow mobile viewport — prefer the global sync banner over Sonner. */
export function shouldUseInspectionFooterStrip(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export function showInspectionSyncStatus(
  status: Omit<InspectionSyncStatusPayload, "id">,
): string {
  const id = crypto.randomUUID();
  dispatch({ action: "show", status: { ...status, id } });
  return id;
}

export function updateInspectionSyncStatus(status: InspectionSyncStatusPayload): void {
  dispatch({ action: "update", status });
}

export function dismissInspectionSyncStatus(id: string): void {
  dispatch({ action: "dismiss", id });
}

/** Re-surface queued state when unsynced inspections remain (dismiss-only; UI is OfflineIndicator). */
export function showPendingInspectionReminder(status: {
  title: string;
  description?: string;
}): void {
  void status;
  // Intentionally no-op — pending uploads use OfflineIndicator bottom strip.
}

export function dismissPendingInspectionReminder(): void {
  dismissInspectionSyncStatus(PENDING_INSPECTION_REMINDER_STATUS_ID);
}

export function subscribeInspectionSyncStatus(
  listener: (detail: InspectionSyncStatusEventDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    listener((event as CustomEvent<InspectionSyncStatusEventDetail>).detail);
  };
  window.addEventListener(INSPECTION_SYNC_STATUS_EVENT, handler);
  return () => window.removeEventListener(INSPECTION_SYNC_STATUS_EVENT, handler);
}
