"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InspectionDraft } from "@/lib/inspections/inspection-draft";
import { deleteDraft, putDraft } from "@/lib/inspections/inspectionDraftDb";

const AUTOSAVE_MS = 2000;

export interface UseInspectionLeaveGuardOptions {
  enabled: boolean;
  draftKey: string;
  buildDraftRecord: () => InspectionDraft | null;
  isDirty: () => boolean;
  /** When true, close/back is ignored (e.g. submit in progress). */
  isSubmitBlocked?: () => boolean;
  onConfirmedClose: () => void;
}

export interface InspectionLeaveGuardState {
  guardOpen: boolean;
  pendingMediaNotice: boolean;
  requestClose: () => void;
  closeGuardKeepEditing: () => void;
  closeGuardSaveAndClose: () => Promise<void>;
  closeGuardDiscard: () => Promise<void>;
  setResumeResolved: (resolved: boolean) => void;
  setPendingMediaNotice: (show: boolean) => void;
  clearDraft: () => Promise<void>;
  scheduleAutosave: () => void;
  /** Cancel pending autosave and wait for any in-flight draft write before submit. */
  prepareForSubmit: () => Promise<void>;
}

export function useInspectionLeaveGuard(
  options: UseInspectionLeaveGuardOptions,
): InspectionLeaveGuardState {
  const {
    enabled,
    draftKey,
    buildDraftRecord,
    isDirty,
    isSubmitBlocked,
    onConfirmedClose,
  } = options;

  const [guardOpen, setGuardOpen] = useState(false);
  const [resumeResolved, setResumeResolved] = useState(false);
  const [pendingMediaNotice, setPendingMediaNotice] = useState(false);

  const buildDraftRecordRef = useRef(buildDraftRecord);
  const isDirtyRef = useRef(isDirty);
  const isSubmitBlockedRef = useRef(isSubmitBlocked);
  const onConfirmedCloseRef = useRef(onConfirmedClose);

  useEffect(() => {
    buildDraftRecordRef.current = buildDraftRecord;
    isDirtyRef.current = isDirty;
    isSubmitBlockedRef.current = isSubmitBlocked;
    onConfirmedCloseRef.current = onConfirmedClose;
  });

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftGenerationRef = useRef(0);
  const persistInFlightRef = useRef<Promise<void> | null>(null);

  const cancelAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const persistDraft = useCallback(async () => {
    const gen = draftGenerationRef.current;
    const record = buildDraftRecordRef.current();
    if (!record) return;
    const op = (async () => {
      await putDraft(record);
      if (gen !== draftGenerationRef.current) {
        await deleteDraft(draftKey).catch((error: unknown) => {
          console.warn("[useInspectionLeaveGuard] stale autosave cleanup failed", error);
        });
      }
    })();
    persistInFlightRef.current = op;
    try {
      await op;
    } finally {
      if (persistInFlightRef.current === op) {
        persistInFlightRef.current = null;
      }
    }
  }, [draftKey]);

  const prepareForSubmit = useCallback(async () => {
    cancelAutosave();
    const inFlight = persistInFlightRef.current;
    if (inFlight) {
      await inFlight.catch((error: unknown) => {
        console.warn("[useInspectionLeaveGuard] in-flight autosave before submit failed", error);
      });
    }
  }, [cancelAutosave]);

  const clearDraft = useCallback(async () => {
    cancelAutosave();
    draftGenerationRef.current += 1;
    try {
      await deleteDraft(draftKey);
    } catch (error: unknown) {
      console.warn("[useInspectionLeaveGuard] clearDraft failed", error);
    }
  }, [cancelAutosave, draftKey]);

  useEffect(() => {
    if (!enabled) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current()) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled]);

  const requestClose = useCallback(() => {
    if (isSubmitBlockedRef.current?.()) return;
    if (!enabled) {
      onConfirmedCloseRef.current();
      return;
    }
    if (!isDirtyRef.current()) {
      onConfirmedCloseRef.current();
      return;
    }
    setGuardOpen(true);
  }, [enabled]);

  const closeGuardKeepEditing = useCallback(() => {
    setGuardOpen(false);
  }, []);

  const closeGuardSaveAndClose = useCallback(async () => {
    await persistDraft();
    setGuardOpen(false);
    onConfirmedCloseRef.current();
  }, [persistDraft]);

  const closeGuardDiscard = useCallback(async () => {
    await clearDraft();
    setGuardOpen(false);
    onConfirmedCloseRef.current();
  }, [clearDraft]);

  const scheduleAutosave = useCallback(() => {
    if (!enabled || !resumeResolved) return;
    if (!isDirtyRef.current()) return;
    cancelAutosave();
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistDraft().catch((error: unknown) => {
        console.warn("[useInspectionLeaveGuard] autosave failed", error);
      });
    }, AUTOSAVE_MS);
  }, [enabled, resumeResolved, persistDraft, cancelAutosave]);

  useEffect(() => {
    return () => {
      cancelAutosave();
    };
  }, [cancelAutosave]);

  return {
    guardOpen,
    pendingMediaNotice,
    requestClose,
    closeGuardKeepEditing,
    closeGuardSaveAndClose,
    closeGuardDiscard,
    setResumeResolved,
    setPendingMediaNotice,
    clearDraft,
    scheduleAutosave,
    prepareForSubmit,
  };
}
