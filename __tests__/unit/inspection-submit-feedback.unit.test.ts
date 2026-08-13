import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchInspectionSubmitFeedback } from "@/lib/inspections/inspection-submit-feedback";
import {
  InspectionSyncAuthRequiredError,
  InspectionSyncExhaustedError,
  InspectionSyncRejectedError,
} from "@/lib/inspections/inspection-sync-one";

const syncStatus = vi.hoisted(() => ({
  show: vi.fn(() => "status-1"),
  update: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("@/lib/inspections/inspection-sync-status", () => ({
  showInspectionSyncStatus: syncStatus.show,
  updateInspectionSyncStatus: syncStatus.update,
  dismissInspectionSyncStatus: syncStatus.dismiss,
}));

const messages = {
  savedTitle: "Inspection saved",
  pendingMediaDescription: "Photos uploading…",
  pendingSyncDescription: "Syncing in the background. Tap Retry if this doesn't clear.",
  authRequiredTitle: "Sign in again to sync this inspection.",
  authRequiredDescription: "Saved on device.",
  exhaustedTitle: "Could not sync this inspection",
  exhaustedDescription: "After 3 tries.",
  calibrationRejectedPreservedTitle: "Calibration not uploaded yet",
  calibrationRejectedPreservedDescription: "Still saved on this device.",
  pendingUploadRejectedPreservedTitle: "Not uploaded yet",
  pendingUploadRejectedPreservedDescription: "Still saved on this device.",
};

describe("watchInspectionSubmitFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows success immediately when no deferred media", () => {
    watchInspectionSubmitFeedback(Promise.resolve(true), false, messages);

    expect(syncStatus.show).toHaveBeenCalledWith({
      variant: "success",
      title: "Inspection saved",
      description: undefined,
    });
    expect(syncStatus.dismiss).not.toHaveBeenCalled();
  });

  it("shows loading variant while photos upload in background", () => {
    watchInspectionSubmitFeedback(new Promise(() => {}), true, messages);

    expect(syncStatus.show).toHaveBeenCalledWith({
      variant: "loading",
      title: "Inspection saved",
      description: "Photos uploading…",
    });
  });

  it("does not auto-dismiss — stays until user dismisses or sync updates", () => {
    vi.useFakeTimers();
    watchInspectionSubmitFeedback(new Promise(() => {}), true, messages);
    vi.advanceTimersByTime(10_000);
    expect(syncStatus.dismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("updates to success when sync completes", async () => {
    watchInspectionSubmitFeedback(Promise.resolve(true), true, messages);

    await vi.waitFor(() => {
      expect(syncStatus.update).toHaveBeenCalledWith({
        id: "status-1",
        variant: "success",
        title: "Inspection saved",
        description: undefined,
      });
    });
  });

  it("updates to queued with retry when sync will retry", async () => {
    watchInspectionSubmitFeedback(Promise.resolve(false), false, messages);

    await vi.waitFor(() => {
      expect(syncStatus.update).toHaveBeenCalledWith({
        id: "status-1",
        variant: "queued",
        title: "Inspection saved",
        description: "Syncing in the background. Tap Retry if this doesn't clear.",
        showRetry: true,
      });
    });
  });

  it("surfaces permanent rejection as error without retry", async () => {
    watchInspectionSubmitFeedback(
      Promise.reject(new InspectionSyncRejectedError("Scope is not ready.")),
      false,
      messages,
    );

    await vi.waitFor(() => {
      expect(syncStatus.update).toHaveBeenCalledWith({
        id: "status-1",
        variant: "error",
        title: "Scope is not ready.",
        description: undefined,
        showRetry: false,
      });
    });
    expect(syncStatus.dismiss).not.toHaveBeenCalled();
  });

  it("surfaces auth-required as error with retry", async () => {
    watchInspectionSubmitFeedback(
      Promise.reject(new InspectionSyncAuthRequiredError("Unauthorized")),
      false,
      messages,
    );

    await vi.waitFor(() => {
      expect(syncStatus.update).toHaveBeenCalledWith({
        id: "status-1",
        variant: "error",
        title: "Unauthorized",
        description: "Saved on device.",
        showRetry: true,
      });
    });
  });

  it("surfaces preserved rejection with retry and translated copy", async () => {
    const { InspectionSyncPreservedError } = await import("@/lib/inspections/inspection-sync-one");
    watchInspectionSubmitFeedback(
      Promise.reject(new InspectionSyncPreservedError("Server validation failed")),
      false,
      messages,
    );

    await vi.waitFor(() => {
      expect(syncStatus.update).toHaveBeenCalledWith({
        id: "status-1",
        variant: "error",
        title: "Not uploaded yet",
        description: "Still saved on this device.",
        showRetry: true,
      });
    });
  });
});
