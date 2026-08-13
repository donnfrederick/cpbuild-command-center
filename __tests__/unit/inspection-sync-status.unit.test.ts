import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissInspectionSyncStatus,
  dismissPendingInspectionReminder,
  INSPECTION_SYNC_STATUS_EVENT,
  PENDING_INSPECTION_REMINDER_STATUS_ID,
  showInspectionSyncStatus,
  showPendingInspectionReminder,
  subscribeInspectionSyncStatus,
  updateInspectionSyncStatus,
} from "@/lib/inspections/inspection-sync-status";

describe("inspection-sync-status", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("showInspectionSyncStatus dispatches show event with id", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInspectionSyncStatus(listener);
    try {
      const id = showInspectionSyncStatus({
        variant: "loading",
        title: "Saving inspection…",
      });
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(listener).toHaveBeenCalledWith({
        action: "show",
        status: {
          id,
          variant: "loading",
          title: "Saving inspection…",
        },
      });
    } finally {
      unsubscribe();
    }
  });

  it("update and dismiss dispatch expected actions", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInspectionSyncStatus(listener);
    try {
      const id = showInspectionSyncStatus({ variant: "queued", title: "Queued" });
      updateInspectionSyncStatus({ id, variant: "success", title: "Saved" });
      dismissInspectionSyncStatus(id);
      expect(listener).toHaveBeenLastCalledWith({ action: "dismiss", id });
    } finally {
      unsubscribe();
    }
  });

  it("isUnitDetailModalOpen returns true when modal title exists", async () => {
    const title = document.createElement("p");
    title.id = "unit-detail-modal-title";
    document.body.appendChild(title);
    const { isUnitDetailModalOpen } = await import("@/lib/inspections/inspection-sync-status");
    expect(isUnitDetailModalOpen()).toBe(true);
  });

  it("shouldUseInspectionFooterStrip is true on mobile viewport", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    const { shouldUseInspectionFooterStrip } = await import("@/lib/inspections/inspection-sync-status");
    expect(shouldUseInspectionFooterStrip()).toBe(true);

    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const { shouldUseInspectionFooterStrip: desktopCheck } = await import(
      "@/lib/inspections/inspection-sync-status"
    );
    expect(desktopCheck()).toBe(false);
  });

  it("showPendingInspectionReminder is a no-op (pending uploads use OfflineIndicator)", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInspectionSyncStatus(listener);
    try {
      showPendingInspectionReminder({
        title: "2 inspections waiting to upload",
        description: "Tap Sync now",
      });
      expect(listener).not.toHaveBeenCalled();
      dismissPendingInspectionReminder();
      expect(listener).toHaveBeenLastCalledWith({
        action: "dismiss",
        id: PENDING_INSPECTION_REMINDER_STATUS_ID,
      });
    } finally {
      unsubscribe();
    }
  });

  it("uses a stable custom event name", () => {
    expect(INSPECTION_SYNC_STATUS_EVENT).toBe("inspection-sync-status");
  });
});
