import { describe, expect, it } from "vitest";
import { buildInspectionSyncFailureStatus } from "@/lib/inspections/inspection-sync-failure-report";
import {
  InspectionSyncAuthRequiredError,
  InspectionSyncPreservedError,
  InspectionSyncExhaustedError,
  InspectionSyncRejectedError,
} from "@/lib/inspections/inspection-sync-one";

const messages = {
  authRequiredTitle: "Sign in again",
  authRequiredDescription: "Saved on device",
  exhaustedTitle: "Could not sync",
  exhaustedDescription: "After 3 tries",
  pendingUploadRejectedPreservedTitle: "Not uploaded yet",
  pendingUploadRejectedPreservedDescription: "Still saved on this device",
};

describe("buildInspectionSyncFailureStatus", () => {
  it("maps auth-required errors with retry using translated title", () => {
    const status = buildInspectionSyncFailureStatus(
      new InspectionSyncAuthRequiredError("Session expired"),
      messages,
    );
    expect(status).toEqual({
      variant: "error",
      title: "Sign in again",
      description: "Saved on device",
      showRetry: true,
    });
  });

  it("maps exhausted errors with retry using translated title", () => {
    const status = buildInspectionSyncFailureStatus(
      new InspectionSyncExhaustedError("Server unreachable"),
      messages,
    );
    expect(status).toEqual({
      variant: "error",
      title: "Could not sync",
      description: "After 3 tries",
      showRetry: true,
    });
  });

  it("maps permanent rejection without retry", () => {
    const status = buildInspectionSyncFailureStatus(
      new InspectionSyncRejectedError("Invalid calibration parent"),
      messages,
    );
    expect(status).toEqual({
      variant: "error",
      title: "Invalid calibration parent",
      showRetry: false,
    });
  });

  it("maps preserved rejection with retry for any pending inspection", () => {
    const status = buildInspectionSyncFailureStatus(
      new InspectionSyncPreservedError("calibratedAgainstSubmissionId is required"),
      messages,
    );
    expect(status).toEqual({
      variant: "error",
      title: "Not uploaded yet",
      description: "Still saved on this device",
      showRetry: true,
    });
  });

  it("returns null for unknown errors", () => {
    expect(buildInspectionSyncFailureStatus(new Error("nope"), messages)).toBeNull();
  });
});
