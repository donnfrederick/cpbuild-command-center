/**
 * Surfaces background inspection sync failures in the global status strip.
 */

import {
  InspectionSyncAuthRequiredError,
  InspectionSyncPreservedError,
  InspectionSyncExhaustedError,
  InspectionSyncRejectedError,
} from "@/lib/inspections/inspection-sync-one";
import { showInspectionSyncStatus } from "@/lib/inspections/inspection-sync-status";

export interface InspectionSyncFailureMessages {
  authRequiredTitle: string;
  authRequiredDescription?: string;
  exhaustedTitle: string;
  exhaustedDescription?: string;
  pendingUploadRejectedPreservedTitle: string;
  pendingUploadRejectedPreservedDescription?: string;
}

export interface InspectionSyncFailureStatus {
  variant: "error";
  title: string;
  description?: string;
  showRetry: boolean;
}

export function buildInspectionSyncFailureStatus(
  error: unknown,
  messages: InspectionSyncFailureMessages,
): InspectionSyncFailureStatus | null {
  if (error instanceof InspectionSyncAuthRequiredError) {
    return {
      variant: "error",
      title: messages.authRequiredTitle,
      description: messages.authRequiredDescription,
      showRetry: true,
    };
  }
  if (error instanceof InspectionSyncExhaustedError) {
    return {
      variant: "error",
      title: messages.exhaustedTitle,
      description: messages.exhaustedDescription,
      showRetry: true,
    };
  }
  if (error instanceof InspectionSyncPreservedError) {
    return {
      variant: "error",
      title: messages.pendingUploadRejectedPreservedTitle,
      description: messages.pendingUploadRejectedPreservedDescription,
      showRetry: true,
    };
  }
  if (error instanceof InspectionSyncRejectedError) {
    return {
      variant: "error",
      title: error.message,
      showRetry: false,
    };
  }
  return null;
}

export function reportInspectionSyncFailure(
  error: unknown,
  messages: InspectionSyncFailureMessages,
): void {
  const status = buildInspectionSyncFailureStatus(error, messages);
  if (!status) return;
  showInspectionSyncStatus(status);
}
