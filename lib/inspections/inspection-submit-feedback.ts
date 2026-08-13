/**
 * Post-submit feedback for inspection forms — local-first UX.
 *
 * Shows a slim top banner (click-through except dismiss) that stays visible
 * until sync settles or the user dismisses it — never a blocking corner toast.
 */

import {
  InspectionSyncAuthRequiredError,
  InspectionSyncPreservedError,
  InspectionSyncExhaustedError,
  InspectionSyncRejectedError,
} from "@/lib/inspections/inspection-sync-one";
import {
  dismissInspectionSyncStatus,
  showInspectionSyncStatus,
  updateInspectionSyncStatus,
} from "@/lib/inspections/inspection-sync-status";

export interface InspectionSubmitFeedbackMessages {
  savedTitle: string;
  pendingMediaDescription: string;
  pendingSyncDescription: string;
  authRequiredTitle: string;
  authRequiredDescription?: string;
  exhaustedTitle: string;
  exhaustedDescription?: string;
  pendingUploadRejectedPreservedTitle: string;
  pendingUploadRejectedPreservedDescription?: string;
}

function syncFailureFromError(
  error: unknown,
  messages: InspectionSubmitFeedbackMessages,
): { title: string; description?: string; showRetry: boolean } | null {
  if (error instanceof InspectionSyncAuthRequiredError) {
    return {
      title: error.message || messages.authRequiredTitle,
      description: messages.authRequiredDescription,
      showRetry: true,
    };
  }
  if (error instanceof InspectionSyncExhaustedError) {
    return {
      title: error.message || messages.exhaustedTitle,
      description: messages.exhaustedDescription,
      showRetry: true,
    };
  }
  if (error instanceof InspectionSyncPreservedError) {
    return {
      title: messages.pendingUploadRejectedPreservedTitle,
      description: messages.pendingUploadRejectedPreservedDescription,
      showRetry: true,
    };
  }
  if (error instanceof InspectionSyncRejectedError) {
    return {
      title: error.message,
      showRetry: false,
    };
  }
  return null;
}

/**
 * Acknowledge local save immediately; update the banner when background sync settles.
 */
export function watchInspectionSubmitFeedback(
  syncPromise: Promise<boolean>,
  deferredMedia: boolean,
  messages: InspectionSubmitFeedbackMessages,
): void {
  const statusId = showInspectionSyncStatus({
    variant: deferredMedia ? "loading" : "success",
    title: messages.savedTitle,
    description: deferredMedia ? messages.pendingMediaDescription : undefined,
  });

  void syncPromise
    .then((synced) => {
      if (synced) {
        updateInspectionSyncStatus({
          id: statusId,
          variant: "success",
          title: messages.savedTitle,
          description: undefined,
        });
        return;
      }
      updateInspectionSyncStatus({
        id: statusId,
        variant: "queued",
        title: messages.savedTitle,
        description: messages.pendingSyncDescription,
        showRetry: true,
      });
    })
    .catch((error: unknown) => {
      const failure = syncFailureFromError(error, messages);
      if (!failure) return;
      updateInspectionSyncStatus({
        id: statusId,
        variant: "error",
        title: failure.title,
        description: failure.description,
        showRetry: failure.showRetry,
      });
    });
}

export { dismissInspectionSyncStatus };
