"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormFillDraftRegistration } from "@/components/forms/FormFillClient";
import type { StoredForm } from "@/lib/forms/formsApi";
import type { ScopeRow } from "@/components/projects/UnitCards";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";
import {
  buildDraftKey,
  countAnsweredQuestions,
  EMPTY_ANSWERS_MAP,
  sanitizeDraftAnswers,
  sanitizeRetryDraftState,
  type InspectionDraft,
  type InspectionDraftKind,
  type RetryDraftRegistration,
  type RetryDraftState,
} from "@/lib/inspections/inspection-draft";
import { getDraft } from "@/lib/inspections/inspectionDraftDb";
import { useInspectionLeaveGuard } from "@/lib/inspections/useInspectionLeaveGuard";
import type { FormTemplate } from "@/components/forms/formTypes";
import type { AnswersMap } from "@/components/forms/FormFillClient";

type OverlayDraftMode = "live" | "retry" | "calibration" | "edit";

interface DraftContext {
  kind: InspectionDraftKind;
  draftKey: string;
  formId: string;
  formVersionId?: string;
  categorySnapshot: string;
  parentSubmissionId?: string;
  attemptNumber?: number;
  templateSnapshot: unknown;
  /** Original answers when edit mode opened — dirty baseline for leave guard. */
  editBaselineAnswers?: AnswersMap;
}

interface UseInspectionOverlayDraftInput {
  enabled: boolean;
  mode: OverlayDraftMode;
  template: FormTemplate;
  /** Omitted for unit-level inspections (e.g. Gypcrete). */
  scope?: ScopeRow;
  projectId: string;
  unitId: string;
  onClose: () => void;
  liveForm?: StoredForm;
  previousSubmission?: InspectionSubmission;
  /** Submission being edited (edit mode). */
  editingSubmission?: InspectionSubmission;
  attemptNumber?: number;
}

export function useInspectionOverlayDraft(input: UseInspectionOverlayDraftInput) {
  const {
    enabled,
    mode,
    template,
    scope,
    projectId,
    unitId,
    onClose,
    liveForm,
    previousSubmission,
    editingSubmission,
    attemptNumber,
  } = input;

  const scopeRowId = scope?.id;

  const formDraftRef = useRef<FormFillDraftRegistration | null>(null);
  const retryDraftRef = useRef<RetryDraftRegistration | null>(null);

  const draftContext = useMemo((): DraftContext | null => {
    if (!enabled) return null;
    if (mode === "live" && liveForm) {
      const formVersionId = liveForm.template.latestVersionId;
      return {
        kind: "live",
        formId: liveForm.id,
        formVersionId,
        categorySnapshot: liveForm.template.category,
        attemptNumber,
        templateSnapshot: liveForm.template,
        draftKey: buildDraftKey({
          kind: "live",
          projectId,
          unitId,
          scopeRowId,
          formId: liveForm.id,
          formVersionId,
        }),
      };
    }
    if (mode === "retry" && previousSubmission) {
      const formId = previousSubmission.formId;
      if (!formId) return null;
      const formVersionId = previousSubmission.templateSnapshot?.latestVersionId;
      return {
        kind: "retry",
        formId,
        formVersionId,
        categorySnapshot: previousSubmission.categorySnapshot,
        parentSubmissionId: previousSubmission.id,
        attemptNumber,
        templateSnapshot: previousSubmission.templateSnapshot ?? template,
        draftKey: buildDraftKey({
          kind: "retry",
          projectId,
          unitId,
          scopeRowId,
          formId,
          parentSubmissionId: previousSubmission.id,
        }),
      };
    }
    if (mode === "calibration" && previousSubmission) {
      const formId = previousSubmission.formId ?? liveForm?.id;
      if (!formId) return null;
      const formVersionId =
        previousSubmission.templateSnapshot?.latestVersionId ?? template.latestVersionId;
      return {
        kind: "calibration",
        formId,
        formVersionId,
        categorySnapshot: "CALIBRATION_INSPECTION",
        parentSubmissionId: previousSubmission.id,
        attemptNumber,
        templateSnapshot: template,
        draftKey: buildDraftKey({
          kind: "calibration",
          projectId,
          unitId,
          scopeRowId,
          formId,
          parentSubmissionId: previousSubmission.id,
        }),
      };
    }
    if (mode === "edit" && editingSubmission) {
      const formId = editingSubmission.formId;
      if (!formId) return null;
      const formVersionId = editingSubmission.templateSnapshot?.latestVersionId;
      const editBaselineAnswers = (editingSubmission.payload ?? {}) as AnswersMap;
      return {
        kind: "edit",
        formId,
        formVersionId,
        categorySnapshot: editingSubmission.categorySnapshot,
        parentSubmissionId: editingSubmission.id,
        templateSnapshot: editingSubmission.templateSnapshot ?? template,
        editBaselineAnswers,
        draftKey: buildDraftKey({
          kind: "edit",
          projectId,
          unitId,
          scopeRowId,
          formId,
          parentSubmissionId: editingSubmission.id,
        }),
      };
    }
    return null;
  }, [enabled, mode, liveForm, previousSubmission, editingSubmission, projectId, unitId, scopeRowId, template, attemptNumber]);

  const [resumePromptDraft, setResumePromptDraft] = useState<InspectionDraft | null>(null);
  const [hydratedDraft, setHydratedDraft] = useState<InspectionDraft | null>(null);
  const [idbLoaded, setIdbLoaded] = useState(false);
  const [resumeResolved, setResumeResolved] = useState(false);

  useEffect(() => {
    if (!enabled || !draftContext) return;
    let cancelled = false;
    void getDraft(draftContext.draftKey)
      .then((draft) => {
        if (cancelled) return;
        if (draft) {
          setResumePromptDraft(draft);
        } else {
          setResumeResolved(true);
        }
        setIdbLoaded(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.warn("[useInspectionOverlayDraft] draft load failed", error);
        setResumeResolved(true);
        setIdbLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, draftContext]);

  const draftReady = !enabled || !draftContext || (idbLoaded && resumeResolved);

  const buildDraftRecord = useCallback((): InspectionDraft | null => {
    if (!draftContext) return null;
    const updatedAt = new Date().toISOString();
    const base = {
      draftKey: draftContext.draftKey,
      kind: draftContext.kind,
      projectId,
      unitId,
      scopeRowId,
      formId: draftContext.formId,
      formVersionId: draftContext.formVersionId,
      parentSubmissionId: draftContext.parentSubmissionId,
      categorySnapshot: draftContext.categorySnapshot,
      templateSnapshot: draftContext.templateSnapshot,
      attemptNumber: draftContext.attemptNumber,
      updatedAt,
    };

    if (draftContext.kind === "retry") {
      const reg = retryDraftRef.current;
      if (!reg) return null;
      const { retryState, hasPendingMedia } = sanitizeRetryDraftState(reg.getRetryState());
      return { ...base, retryState, hasPendingMedia };
    }

    const reg = formDraftRef.current;
    if (!reg) return null;
    const { answers, hasPendingMedia } = sanitizeDraftAnswers(reg.getAnswers());
    return { ...base, answers, hasPendingMedia };
  }, [draftContext, projectId, unitId, scopeRowId]);

  const isDirty = useCallback(() => {
    if (draftContext?.kind === "retry") {
      return retryDraftRef.current?.isDirty() ?? false;
    }
    return formDraftRef.current?.isDirty() ?? false;
  }, [draftContext?.kind]);

  const isSubmitBlocked = useCallback(() => {
    if (draftContext?.kind === "retry") {
      return retryDraftRef.current?.isSubmitting?.() ?? false;
    }
    return formDraftRef.current?.isSubmitting?.() ?? false;
  }, [draftContext?.kind]);

  const leaveGuard = useInspectionLeaveGuard({
    enabled: enabled && draftReady,
    draftKey: draftContext?.draftKey ?? "",
    buildDraftRecord,
    isDirty,
    isSubmitBlocked,
    onConfirmedClose: onClose,
  });

  const {
    setResumeResolved: setGuardResumeResolved,
    setPendingMediaNotice,
    clearDraft,
    requestClose,
    scheduleAutosave,
    prepareForSubmit,
    pendingMediaNotice,
    guardOpen,
    closeGuardKeepEditing,
    closeGuardSaveAndClose,
    closeGuardDiscard,
  } = leaveGuard;

  useEffect(() => {
    setGuardResumeResolved(draftReady);
  }, [draftReady, setGuardResumeResolved]);

  const resumeSheetOpen = Boolean(idbLoaded && resumePromptDraft && !resumeResolved);
  const draftLookupInFlight = enabled && Boolean(draftContext) && !idbLoaded;

  const safeRequestClose = useCallback(() => {
    if (resumeSheetOpen || draftLookupInFlight) return;
    requestClose();
  }, [resumeSheetOpen, draftLookupInFlight, requestClose]);

  const handleResumeChoice = useCallback(async (resume: boolean) => {
    if (resume && resumePromptDraft) {
      setHydratedDraft(resumePromptDraft);
      if (resumePromptDraft.hasPendingMedia) {
        setPendingMediaNotice(true);
      }
    } else if (draftContext) {
      await clearDraft();
      setHydratedDraft(null);
      setPendingMediaNotice(false);
    }
    setResumePromptDraft(null);
    setResumeResolved(true);
  }, [draftContext, clearDraft, resumePromptDraft, setPendingMediaNotice]);

  const formInitialAnswers = useMemo((): AnswersMap | undefined => {
    if (!draftReady) return undefined;
    if (hydratedDraft?.answers) return hydratedDraft.answers;
    if (draftContext?.kind === "edit" && draftContext.editBaselineAnswers) {
      return draftContext.editBaselineAnswers;
    }
    return EMPTY_ANSWERS_MAP;
  }, [draftReady, hydratedDraft, draftContext]);

  const formInitialAnswersRevision = useMemo((): string | undefined => {
    if (!draftReady || !draftContext) return undefined;
    const seed = hydratedDraft?.updatedAt ?? "new";
    return `${draftContext.draftKey}:${seed}`;
  }, [draftReady, draftContext, hydratedDraft?.updatedAt]);

  const formDirtyBaseline = useMemo((): AnswersMap => {
    if (draftContext?.kind === "edit" && draftContext.editBaselineAnswers) {
      return draftContext.editBaselineAnswers;
    }
    return EMPTY_ANSWERS_MAP;
  }, [draftContext]);

  const retryInitialState = useMemo((): RetryDraftState | undefined => {
    if (!draftReady) return undefined;
    return hydratedDraft?.retryState;
  }, [draftReady, hydratedDraft]);

  const resumeAnsweredCount = useMemo(() => {
    if (!resumePromptDraft) return 0;
    if (resumePromptDraft.retryState) {
      return countAnsweredQuestions(template, resumePromptDraft.retryState.answers);
    }
    return countAnsweredQuestions(template, resumePromptDraft.answers ?? {});
  }, [resumePromptDraft, template]);

  const totalQuestions = useMemo(
    () => template.sections.reduce((sum, sec) => sum + sec.questions.length, 0),
    [template],
  );

  const clearDraftOnSubmit = useCallback(async () => {
    await clearDraft();
  }, [clearDraft]);

  return {
    draftReady,
    formDraftRef,
    retryDraftRef,
    requestClose: safeRequestClose,
    leaveGuard: {
      guardOpen,
      closeGuardKeepEditing,
      closeGuardSaveAndClose,
      closeGuardDiscard,
    },
    resumeSheetOpen,
    resumePromptDraft,
    resumeAnsweredCount,
    totalQuestions,
    handleResumeChoice,
    formInitialAnswers,
    formInitialAnswersRevision,
    formDirtyBaseline,
    retryInitialState,
    scheduleAutosave,
    clearDraftOnSubmit,
    prepareForSubmit,
    pendingMediaNotice,
  };
}
