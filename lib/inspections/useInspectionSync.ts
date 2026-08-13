"use client";

/**
 * useInspectionSync
 *
 * Mounts once at the app shell level. Listens for the browser's
 * `online` event and connectivity quality improvements, then flushes
 * any queued inspection submissions when the connection is good enough.
 *
 * Also exposes pending inspection count + manual flush for OfflineIndicator.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getAllPending,
  getPendingInspectionCount,
  resetSyncAttemptsForManualRetry,
} from "./inspectionOfflineDb";
import { sortPendingInspectionsForFlush } from "./resolve-calibrated-against-id";
import { syncOne } from "./inspection-sync-one";
import {
  type InspectionSyncFailureMessages,
  reportInspectionSyncFailure,
} from "./inspection-sync-failure-report";
import {
  dismissPendingInspectionReminder,
} from "./inspection-sync-status";
import { subscribeConnectivityQuality } from "@/lib/offline/connectivity";
import {
  clearOfflineUploadProgress,
  patchOfflineUploadProgress,
} from "@/lib/offline/offline-upload-progress";

export const INSPECTIONS_PENDING_COUNT_EVENT = "inspections:pending-count-changed";

let flushInFlight: Promise<number> | null = null;

function failureMessagesFromTranslations(
  t: ReturnType<typeof useTranslations<"inspections">>,
): InspectionSyncFailureMessages {
  return {
    authRequiredTitle: t("savedAuthRequiredTitle"),
    authRequiredDescription: t("savedAuthRequiredDescription"),
    exhaustedTitle: t("savedExhaustedSyncTitle"),
    exhaustedDescription: t("savedExhaustedSyncDescription"),
    pendingUploadRejectedPreservedTitle: t("pendingUploadRejectedPreservedTitle"),
    pendingUploadRejectedPreservedDescription: t("pendingUploadRejectedPreservedDescription"),
  };
}

export interface TryFlushPendingOptions {
  /** Clears per-row attempt counters so manual retry bypasses the 3-attempt cap. */
  manual?: boolean;
  /** When true, show the top reminder banner if rows remain after flush. */
  showReminderIfPending?: boolean;
}

function dispatchPendingCount(count: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(INSPECTIONS_PENDING_COUNT_EVENT, { detail: { count } }),
  );
}

function maybeShowPendingReminder(
  remaining: number,
  _messages: InspectionSyncFailureMessages & {
    pendingReminderTitle: (count: number) => string;
    pendingReminderDescription: string;
  },
  _showReminderIfPending: boolean,
): void {
  // Pending uploads are surfaced by OfflineIndicator (bottom strip + Sync now).
  // Do not duplicate with a top banner + Retry on global pages.
  if (remaining <= 0) {
    dismissPendingInspectionReminder();
  }
}

/** Coalesce concurrent flush triggers (mount, online, interval, etc.) into one run. */
export async function tryFlushPending(
  failureMessages?: InspectionSyncFailureMessages & {
    pendingReminderTitle?: (count: number) => string;
    pendingReminderDescription?: string;
  },
  options?: TryFlushPendingOptions,
): Promise<number> {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    return getPendingInspectionCount().catch(() => 0);
  }
  if (flushInFlight) {
    return flushInFlight;
  }
  flushInFlight = (async () => {
    if (options?.manual) {
      await resetSyncAttemptsForManualRetry();
    }
    await flushPending(failureMessages);
    const remaining = await getPendingInspectionCount().catch(() => 0);
    dispatchPendingCount(remaining);
    if (
      failureMessages?.pendingReminderTitle
      && failureMessages.pendingReminderDescription
    ) {
      maybeShowPendingReminder(
        remaining,
        {
          ...failureMessages,
          pendingReminderTitle: failureMessages.pendingReminderTitle,
          pendingReminderDescription: failureMessages.pendingReminderDescription,
        },
        options?.showReminderIfPending === true,
      );
    }
    return remaining;
  })().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function flushPending(failureMessages?: InspectionSyncFailureMessages): Promise<void> {
  let pending;
  try {
    pending = await getAllPending();
  } catch {
    return;
  }

  if (pending.length === 0) return;

  const ordered = sortPendingInspectionsForFlush(pending);
  console.info(`[InspectionSync] Flushing ${ordered.length} pending submission(s)…`);

  const total = ordered.length;
  let done = 0;

  for (const record of ordered) {
    patchOfflineUploadProgress({
      active: true,
      kind: "inspection",
      phase: "request",
      done,
      total,
      currentItemId: record.localId,
      currentType: null,
    });

    try {
      const synced = await syncOne(record.localId, {
        formId: record.formId,
        formVersionId: record.formVersionId,
        templateSnapshot: record.templateSnapshot,
        categoryOverride: record.categoryOverride,
        calibratedAgainstSubmissionId: record.calibratedAgainstSubmissionId,
        projectId: record.projectId,
        unitId: record.unitId,
        scopeRowId: record.scopeRowId,
        scopeTypeCode: record.scopeTypeCode,
        submittedBy: record.submittedByName,
        outcome: record.outcome,
        deficiencyCount: record.deficiencyCount,
        payload: record.payload,
        updateServerId: record.updateServerId,
        activityLocation: record.activityLocation,
      }, {
        replayMetadata: {
          submittedAt: record.submittedAt,
        },
      });
      if (synced) {
        window.dispatchEvent(new CustomEvent("inspections:updated", {
          detail: { unitId: record.unitId, scopeRowId: record.scopeRowId },
        }));
        console.info(`[InspectionSync] Synced ${record.localId}`);
      } else {
        console.warn(`[InspectionSync] Submission ${record.localId} queued for retry`);
      }
    } catch (error) {
      if (failureMessages) {
        reportInspectionSyncFailure(error, failureMessages);
      }
      window.dispatchEvent(new CustomEvent("inspections:updated", {
        detail: { unitId: record.unitId, scopeRowId: record.scopeRowId },
      }));
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[InspectionSync] Failed ${record.localId}: ${message}`);
    }

    done += 1;
  }
}

export interface InspectionSyncState {
  pendingInspectionCount: number;
  isInspectionSyncing: boolean;
  flushPendingInspections: (options?: TryFlushPendingOptions) => Promise<number>;
}

export function useInspectionSync(): InspectionSyncState {
  const t = useTranslations("inspections");
  const failureMessagesRef = useRef(
    failureMessagesFromTranslations(t),
  );
  const [pendingInspectionCount, setPendingInspectionCount] = useState(0);
  const [isInspectionSyncing, setIsInspectionSyncing] = useState(false);

  const buildMessages = useCallback(() => {
    const base = failureMessagesFromTranslations(t);
    return {
      ...base,
      pendingReminderTitle: (count: number) => t("pendingReminderTitle", { count }),
      pendingReminderDescription: t("pendingReminderDescription"),
    };
  }, [t]);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingInspectionCount().catch(() => 0);
    setPendingInspectionCount(count);
    dispatchPendingCount(count);
    return count;
  }, []);

  const flushPendingInspections = useCallback(
    async (options?: TryFlushPendingOptions): Promise<number> => {
      setIsInspectionSyncing(true);
      try {
        failureMessagesRef.current = buildMessages();
        const remaining = await tryFlushPending(failureMessagesRef.current, options);
        setPendingInspectionCount(remaining);
        return remaining;
      } finally {
        setIsInspectionSyncing(false);
        clearOfflineUploadProgress();
      }
    },
    [buildMessages],
  );

  useEffect(() => {
    failureMessagesRef.current = buildMessages();
    const getMessages = () => failureMessagesRef.current;

    void refreshPendingCount().then((count) => {
      if (count > 0) {
        dismissPendingInspectionReminder();
      }
    });
    void flushPendingInspections({ showReminderIfPending: true });

    function handleOnline() {
      void flushPendingInspections({ showReminderIfPending: true });
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void flushPendingInspections({ showReminderIfPending: true });
      }
    }

    function handlePageShow() {
      void flushPendingInspections({ showReminderIfPending: true });
    }

    function handlePendingCountEvent(e: Event) {
      const count = (e as CustomEvent<{ count: number }>).detail?.count;
      if (typeof count === "number") {
        setPendingInspectionCount(count);
      }
    }

    function handleInspectionsUpdated() {
      void refreshPendingCount();
    }

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener(INSPECTIONS_PENDING_COUNT_EVENT, handlePendingCountEvent);
    window.addEventListener("inspections:updated", handleInspectionsUpdated);

    const unsubscribe = subscribeConnectivityQuality((prev, next) => {
      if ((prev === "slow" || prev === "offline") && next === "good") {
        void flushPendingInspections({ showReminderIfPending: true });
      }
    });

    const retryIntervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void flushPendingInspections();
      }
    }, 60_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener(INSPECTIONS_PENDING_COUNT_EVENT, handlePendingCountEvent);
      window.removeEventListener("inspections:updated", handleInspectionsUpdated);
      window.clearInterval(retryIntervalId);
      unsubscribe();
    };
  }, [buildMessages, flushPendingInspections, refreshPendingCount]);

  return {
    pendingInspectionCount,
    isInspectionSyncing,
    flushPendingInspections,
  };
}
