"use client";

/**
 * Full-screen overlay that wraps `FormFillClient` for live inspections
 * and read-only reviews of past submissions.
 *
 * Rendered into a portal on `document.body` at z-index 450 — above
 * the mobile unit modal (181), scope inspection sheet (270), and
 * connectivity strip — so the inspector gets an uninterrupted canvas.
 *
 * Two modes:
 *   - `live`: takes a `form` (StoredForm from the forms store) and,
 *     on submit, builds an `InspectionSubmission` and inserts it. The
 *     overlay closes itself on success.
 *   - `readonly`: takes a `submission` and renders the form frozen at
 *     the state captured at submit time (via `initialAnswers`). No
 *     submit button, no mutations.
 */

import { useEffect, useMemo, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertTriangle, FlaskConical, X, ChevronLeft, ChevronRight, FileDown, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { ScopeRow } from "@/components/projects/UnitCards";
import { formatPdfExportErrorToast } from "@/lib/format-pdf-export-error-toast";
import {
  deliverPdfBlob,
  deliverPdfBlobOnUserGesture,
  isMobilePdfDelivery,
} from "@/lib/deliver-pdf-blob";
import { isDocumentationForm, isDocumentationSubmission } from "@/lib/forms/form-purpose-rules";
import type { StoredForm } from "@/lib/forms/formsApi";
import { getForm } from "@/lib/forms/formsApi";
import {
  get,
  insert,
  updateOfflineFirst,
  type InspectionSubmission,
} from "@/lib/inspections/submissionsApi";
import type {
  AnswersMap,
} from "@/components/forms/FormFillClient";
import { FormFillClient } from "@/components/forms/FormFillClient";
import { InspectionRecordClient } from "./InspectionRecordClient";
import { InspectionSheetHeader } from "./InspectionSheetHeader";
import { countDeficiencies, deriveOutcome } from "./inspectionSummary";
import { INSPECTION_CATEGORY_LABELS } from "@/components/forms/formTypes";
import { resolveSubmissionBindingFromTemplate } from "@/lib/inspections/inspection-submission-binding";
import { buildRetryTemplate } from "@/lib/inspections/retryUtils";
import { formatInspectionDateLabel } from "@/lib/inspections/inspectionHeaderUtils";
import { uploadInspectionMediaWithMeta, sanitizeAnswersForStorage } from "@/lib/inspections/uploadInspectionMedia";
import { watchInspectionSubmitFeedback } from "@/lib/inspections/inspection-submit-feedback";
import { RetryFillLayout } from "./RetryFillLayout";
import { useInspectionOverlayDraft } from "./useInspectionOverlayDraft";
import { InspectionLeaveGuardSheet } from "./InspectionLeaveGuardSheet";
import { InspectionPdfExportOverlay } from "./InspectionPdfExportOverlay";
import { ShareOnlyFailedItemsToggle } from "./ShareOnlyFailedItemsToggle";
import { InspectionDraftResumeSheet } from "./InspectionDraftResumeSheet";
import {
  notifyInspectionOverlayClosed,
  notifyInspectionOverlayOpened,
} from "@/lib/inspections/inspection-overlay-chrome";

// ── Panel CSS (readonly panelMode — mirrors IssueDetailModal slide-in) ────────
const PANEL_CSS = `
  .ifo-backdrop { position: fixed; inset: 0; z-index: 400; display: flex; align-items: flex-end; background: rgba(0,0,0,0); transition: background-color 0.26s ease; }
  .ifo-backdrop.ifo-visible { background: rgba(0,0,0,0.5); }
  .ifo-sheet { position: relative; width: 100%; max-height: 94dvh; border-radius: 20px 20px 0 0; background: var(--neutral-0); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: 0 -4px 40px rgba(0,0,0,0.18); overflow: hidden; }
  .ifo-sheet.ifo-visible { transform: translateY(0); }
  .ifo-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 4px; flex-shrink: 0; }
  @media (min-width: 768px) {
    .ifo-backdrop { align-items: stretch; justify-content: flex-end; }
    .ifo-sheet { width: min(560px, 100vw); max-height: none; height: 100%; border-radius: 0; transform: translateX(105%); box-shadow: -4px 0 32px rgba(0,0,0,0.18); }
    .ifo-sheet.ifo-visible { transform: translateX(0); }
    .ifo-handle { display: none; }
  }
`;

// ── Fill-modal CSS (live / edit / retry / readonly without panelMode) ─────────
// Mobile: slides up from bottom as a tall sheet.
// Desktop ≥768px: centered dialog with a dimmed backdrop.
const FILL_CSS = `
  .ifo-fill-backdrop { position: fixed; inset: 0; z-index: 450; display: flex; align-items: flex-end; justify-content: center; background: rgba(0,0,0,0); transition: background-color 0.26s ease; }
  .ifo-fill-backdrop.ifo-fill-open { background: rgba(0,0,0,0.5); }
  .ifo-fill-modal { position: relative; width: 100%; max-height: 94dvh; border-radius: 20px 20px 0 0; background: var(--neutral-0, #fff); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.32,0.72,0,1); display: flex; flex-direction: column; box-shadow: 0 -4px 40px rgba(0,0,0,0.18); overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); scroll-padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
  .ifo-fill-modal.ifo-fill-open { transform: translateY(0); }
  .ifo-fill-handle { width: 36px; height: 4px; background: var(--neutral-300); border-radius: 99px; margin: 10px auto 0; flex-shrink: 0; }
  @media (min-width: 768px) {
    .ifo-fill-backdrop { align-items: center; padding: 24px; }
    .ifo-fill-modal { width: min(700px, 100%); max-height: 92dvh; border-radius: 16px; transform: translateY(20px) scale(0.97); opacity: 0; transition: transform 0.26s cubic-bezier(0.32,0.72,0,1), opacity 0.22s ease; box-shadow: 0 12px 48px rgba(0,0,0,0.24); overflow-y: scroll; scrollbar-width: thin; scrollbar-color: var(--neutral-300, #d1d5db) transparent; padding-bottom: 0; scroll-padding-bottom: 0; }
    .ifo-fill-modal.ifo-fill-open { transform: translateY(0) scale(1); opacity: 1; }
    .ifo-fill-handle { display: none; }
  }
`;

type CommonProps = {
  /** Omitted for unit-level inspections (e.g. Gypcrete). */
  scope?: ScopeRow;
  projectId: string;
  unitId: string;
  onClose: () => void;
  /**
   * Display name stamped onto the submission. Phase 1 is localStorage
   * only so this just ends up in the history row caption — real auth
   * wiring happens when this swaps to a server action.
   */
  submittedBy?: string;
  /** Raw location fields for the card-style header hero. */
  locationParts?: { building?: string | null; level?: string | null; unit?: string | null };
  /** Whole-project form context — shown in the header when unit location is N/A. */
  projectName?: string;
};

type LiveProps = CommonProps & {
  mode: "live";
  form: StoredForm;
  /** 1-based attempt number for the submission being started. */
  attemptNumber?: number;
  /**
   * Called with the optimistic submission immediately after it is queued
   * locally (before the network round-trip completes).
   * `syncPromise` resolves when the background API call settles so the
   * parent can trigger a refresh at exactly the right moment.
   */
  onSubmitted?: (submission: InspectionSubmission, syncPromise: Promise<boolean>) => void;
};

type ReadonlyProps = CommonProps & {
  mode: "readonly";
  submission: InspectionSubmission;
  /**
   * 1-based attempt index for this submission (oldest = 1, newest = total
   * count on the scope). Shown in the outcome pill so the reviewer knows
   * immediately which run they're looking at.
   */
  attemptNumber?: number;
  /** Log-list navigation — when provided, renders a Prev / N of N / Next bar at the bottom. */
  onPrev?: () => void;
  onNext?: () => void;
  recordIndex?: number;
  recordTotal?: number;
  /**
   * When provided, renders an Edit control in the readonly toolbar (e.g. author
   * editing their own inspection).
   */
  onEdit?: () => void;
  /** Pre-formatted location string (e.g. "Bldg 1 · Lvl 3 · Unit 209") shown in the record header. */
  locationLabel?: string;
  /**
   * When true the viewer renders as a side-panel (slides in from the right on
   * desktop, slides up from the bottom on mobile) with a dimmed backdrop —
   * matching the IssueDetailModal pattern used by other log record viewers.
   * Defaults to false (full-screen overlay).
   */
  panelMode?: boolean;
};

type EditProps = CommonProps & {
  mode: "edit";
  /** The submission being edited — must be the most recent attempt. */
  submission: InspectionSubmission;
  /** Called after the edit is successfully saved. */
  onSaved?: (submission: InspectionSubmission) => void;
  /** Convert this clear to calibration — shown as a banner at the top of edit mode. */
  onReclassifyToCalibration?: () => void;
  reclassifyingToCalibration?: boolean;
};

type RetryProps = CommonProps & {
  mode: "retry";
  /** The most recent failed submission to retry from. */
  previousSubmission: InspectionSubmission;
  /** 1-based attempt number for the NEW submission being created. */
  attemptNumber: number;
  /** Called with the new optimistic submission immediately after queuing. */
  onSubmitted?: (submission: InspectionSubmission, syncPromise: Promise<boolean>) => void;
  /** Raw location parts forwarded to RetryFillLayout for icon-labeled rendering. */
  locationParts?: { building?: string | null; level?: string | null; unit?: string | null };
};

type CalibrationProps = CommonProps & {
  mode: "calibration";
  /**
   * The most recent submission for this scope — used to identify the form
   * to reuse (same formId) and to supply template context.
   */
  previousSubmission: InspectionSubmission;
  /** 1-based attempt number for the calibration run being started. */
  attemptNumber?: number;
  /** Called with the optimistic calibration submission after queuing. */
  onSubmitted?: (submission: InspectionSubmission, syncPromise: Promise<boolean>) => void;
};

export function InspectionFillOverlay(props: LiveProps | ReadonlyProps | EditProps | RetryProps | CalibrationProps) {
  const tInspections = useTranslations("inspections");
  const tUnits = useTranslations("units");
  const tCommon = useTranslations("common");
  const { mode, scope, projectId, unitId, onClose } = props;
  const [exportPdfStep, setExportPdfStep] = useState<null | "working" | "done">(null);
  const [shareOnlyFailedItems, setShareOnlyFailedItems] = useState(false);
  const [pendingInspectionPdf, setPendingInspectionPdf] = useState<{
    blob: Blob;
    fileName: string;
  } | null>(null);
  const exportingInspectionPdf = exportPdfStep !== null;
  const onSubmitted =
    mode === "live" || mode === "retry" || mode === "calibration"
      ? props.onSubmitted
      : undefined;

  const calibrationFormId =
    mode === "calibration"
      ? (props as CalibrationProps).previousSubmission.formId
      : undefined;

  const [calibrationForm, setCalibrationForm] = useState<StoredForm | null>(null);
  useEffect(() => {
    if (!calibrationFormId) return;
    getForm(calibrationFormId)
      .then((f) => {
        if (f) setCalibrationForm(f);
      })
      .catch(() => {});
  }, [calibrationFormId]);

  // Readonly-mode list navigation helpers (undefined in other modes)
  const onPrev = mode === "readonly" ? (props as ReadonlyProps).onPrev : undefined;
  const onNext = mode === "readonly" ? (props as ReadonlyProps).onNext : undefined;
  const recordIndex = mode === "readonly" ? (props as ReadonlyProps).recordIndex : undefined;
  const recordTotal = mode === "readonly" ? (props as ReadonlyProps).recordTotal : undefined;
  const hasNav = mode === "readonly" && (onPrev !== undefined || onNext !== undefined);
  const panelMode = mode === "readonly" ? ((props as ReadonlyProps).panelMode ?? false) : false;

  // Relational-authoritative rows store empty JSON stubs; hydrate from the server
  // before rendering readonly / edit / retry views.
  const [hydratedById, setHydratedById] = useState<
    Record<string, InspectionSubmission>
  >({});

  const submissionToHydrate = useMemo((): InspectionSubmission | null => {
    if (mode === "readonly") return (props as ReadonlyProps).submission;
    if (mode === "edit") return (props as EditProps).submission;
    if (mode === "retry") return (props as RetryProps).previousSubmission;
    return null;
  }, [mode, props]);

  const submissionId = submissionToHydrate?.id ?? null;
  const pendingSync = Boolean(submissionToHydrate?._pendingSync);

  useEffect(() => {
    if (!submissionId || pendingSync) return;

    let cancelled = false;
    get(submissionId)
      .then((full) => {
        if (!cancelled && full) {
          setHydratedById((prev) => {
            if (prev[submissionId]) return prev;
            return { ...prev, [submissionId]: full };
          });
        }
      })
      .catch(() => {
        if (!cancelled && submissionToHydrate) {
          setHydratedById((prev) => {
            if (prev[submissionId]) return prev;
            return { ...prev, [submissionId]: submissionToHydrate };
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [submissionId, pendingSync, submissionToHydrate]);

  const activeSubmission = useMemo(() => {
    if (!submissionToHydrate) return null;
    if (pendingSync) return submissionToHydrate;
    return hydratedById[submissionToHydrate.id] ?? submissionToHydrate;
  }, [submissionToHydrate, pendingSync, hydratedById]);

  const hydratingSubmission = Boolean(
    submissionId && !pendingSync && !hydratedById[submissionId],
  );

  // Entrance animation — set visible one frame after mount (used by both
  // panelMode readonly and the fill modal).
  const [overlayVisible, setOverlayVisible] = useState(false);
  useEffect(() => {
    notifyInspectionOverlayOpened();
    return () => notifyInspectionOverlayClosed();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setOverlayVisible(true), 20);
    return () => clearTimeout(id);
  }, []);

  // Keyboard navigation: Escape → close, ArrowLeft → prev, ArrowRight → next
  // (handleKey defined after draft guard hook — see below)

  // Resolve the base template from whichever prop carries it.
  const baseTemplate = useMemo(() => {
    if (mode === "live") return props.form.template;
    if (mode === "calibration") {
      // Prefer the live form fetched from the API; fall back to the snapshot on the previous submission.
      if (calibrationForm) return calibrationForm.template;
      const sub = props.previousSubmission;
      if (sub.templateSnapshot) {
        return { ...sub.templateSnapshot, sections: sub.templateSnapshot.sections ?? [] };
      }
      return {
        id: sub.formId,
        name: sub.formNameSnapshot,
        description: "",
        status: "published" as const,
        level: sub.level,
        scopeTypeCodes: sub.scopeTypeCode ? [sub.scopeTypeCode] : [],
        category: "CALIBRATION_INSPECTION" as const,
        sections: [],
      };
    }
    const sub =
      mode === "retry"
        ? (activeSubmission ?? props.previousSubmission)
        : mode === "readonly" || mode === "edit"
          ? (activeSubmission ?? (props as ReadonlyProps | EditProps).submission)
          : (props as ReadonlyProps | EditProps).submission;
    if (sub.templateSnapshot) {
      // Normalize legacy snapshots that may be missing the sections array.
      return { ...sub.templateSnapshot, sections: sub.templateSnapshot.sections ?? [] };
    }
    return {
      id: sub.formId,
      name: sub.formNameSnapshot,
      description: "",
      status: "published" as const,
      level: sub.level,
      scopeTypeCodes: sub.scopeTypeCode ? [sub.scopeTypeCode] : [],
      category: sub.categorySnapshot,
      sections: [],
    };
  }, [mode, props, calibrationForm, activeSubmission]);

  // For retry mode, promote failed questions to the top.
  const { template, questionSectionMap } = useMemo(() => {
    if (mode !== "retry") return { template: baseTemplate, questionSectionMap: {} };
    const previousAnswers = (activeSubmission ?? props.previousSubmission).payload as AnswersMap;
    return buildRetryTemplate(baseTemplate, previousAnswers);
  }, [mode, baseTemplate, props, activeSubmission]);

  const isDraftGuarded =
    mode === "live" || mode === "retry" || mode === "calibration" || mode === "edit";
  const seedClearInspectionNumberDefaults =
    baseTemplate.category === "CLEAR_INSPECTION" &&
    (mode === "live" || mode === "retry");
  const overlayDraft = useInspectionOverlayDraft({
    enabled: isDraftGuarded,
    mode: isDraftGuarded ? mode : "live",
    template,
    scope,
    projectId,
    unitId,
    onClose,
    liveForm: mode === "live" ? props.form : calibrationForm ?? undefined,
    previousSubmission:
      mode === "retry" || mode === "calibration"
        ? props.previousSubmission
        : undefined,
    editingSubmission:
      mode === "edit"
        ? (activeSubmission ?? (props as EditProps).submission)
        : undefined,
    attemptNumber:
      mode === "live" || mode === "retry" || mode === "calibration"
        ? props.attemptNumber
        : undefined,
  });
  const requestClose = isDraftGuarded ? overlayDraft.requestClose : onClose;
  const backdropClose = isDraftGuarded ? requestClose : onClose;
  const blockingResumePrompt = isDraftGuarded && overlayDraft.resumeSheetOpen;

  const draftLoadingSpinner = (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "48px 24px",
        color: "var(--neutral-400)",
      }}
      aria-busy="true"
      aria-label={tInspections("loadingRecord")}
    >
      <Loader2 size={24} className="animate-spin" aria-hidden />
    </div>
  );

  const pendingMediaBanner = isDraftGuarded && overlayDraft.pendingMediaNotice ? (
    <div
      role="status"
      style={{
        padding: "10px 14px",
        fontSize: 13,
        lineHeight: 1.4,
        color: "var(--warning-600)",
        backgroundColor: "var(--warning-100)",
        borderBottom: "1px solid var(--neutral-200)",
      }}
    >
      {tInspections("draftPendingMediaNotice")}
    </div>
  ) : null;

  const formDraftProps = isDraftGuarded
    ? {
        initialAnswers: overlayDraft.formInitialAnswers,
        initialAnswersRevision: overlayDraft.formInitialAnswersRevision,
        dirtyBaseline: overlayDraft.formDirtyBaseline,
        draftRegistrationRef: overlayDraft.formDraftRef,
        onDraftChange: overlayDraft.scheduleAutosave,
      }
    : {};

  const retryDraftProps = isDraftGuarded
    ? {
        draftRegistrationRef: overlayDraft.retryDraftRef,
        onDraftChange: overlayDraft.scheduleAutosave,
        initialRetryState: overlayDraft.retryInitialState,
      }
    : {};

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (blockingResumePrompt) return;
      requestClose();
      return;
    }
    if (e.key === "ArrowLeft"  && onPrev) { onPrev(); return; }
    if (e.key === "ArrowRight" && onNext) { onNext(); return; }
  }, [requestClose, onPrev, onNext, blockingResumePrompt]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Calibration submit handler.
  async function prepareDraftForSubmit() {
    if (isDraftGuarded) {
      await overlayDraft.prepareForSubmit();
    }
  }

  function watchInspectionSync(
    syncPromise: Promise<boolean>,
    _loadingMessage: string,
    _successMessage: string,
    _queuedMessage: string,
    deferredMedia: boolean,
  ) {
    watchInspectionSubmitFeedback(syncPromise, deferredMedia, {
      savedTitle: tInspections("savedOnlineToast"),
      pendingMediaDescription: tInspections("savedWithPendingMediaDescription"),
      pendingSyncDescription: tInspections("savedPendingSyncDescription"),
      authRequiredTitle: tInspections("savedAuthRequiredTitle"),
      authRequiredDescription: tInspections("savedAuthRequiredDescription"),
      exhaustedTitle: tInspections("savedExhaustedSyncTitle"),
      exhaustedDescription: tInspections("savedExhaustedSyncDescription"),
      pendingUploadRejectedPreservedTitle: tInspections("pendingUploadRejectedPreservedTitle"),
      pendingUploadRejectedPreservedDescription: tInspections("pendingUploadRejectedPreservedDescription"),
    });
  }

  async function handleCalibrationSubmit(answers: AnswersMap) {
    if (mode !== "calibration") return;
    await prepareDraftForSubmit();
    const prev = props.previousSubmission;

    const { answers: uploadedAnswers, deferredMedia } = await uploadInspectionMediaWithMeta(answers);
    const safeAnswers = sanitizeAnswersForStorage(uploadedAnswers);

    const outcome = deriveOutcome(template, safeAnswers);
    const deficiencyCount = countDeficiencies(template, safeAnswers).total;
    const scopeCode =
      scope?.scopeType?.canonicalScopeType?.code ?? scope?.scopeType?.code ?? undefined;

    const { submission: result, syncPromise } = await insert({
      formId: calibrationForm?.id ?? prev.formId ?? "",
      formVersionId: calibrationForm?.template.latestVersionId ?? prev.templateSnapshot?.latestVersionId,
      templateSnapshot: template,
      formNameSnapshot: calibrationForm?.template.name ?? prev.formNameSnapshot,
      // Always store as CALIBRATION_INSPECTION regardless of the original form's category.
      categorySnapshot: "CALIBRATION_INSPECTION",
      level: prev.level,
      projectId,
      unitId,
      scopeRowId: prev.level === "scope" && scope ? scope.id : undefined,
      scopeTypeCode: prev.level === "scope" ? scopeCode : undefined,
      submittedAt: new Date().toISOString(),
      submittedBy: props.submittedBy ?? tInspections("overlayYou"),
      outcome,
      deficiencyCount,
      source: "FORM",
      payload: safeAnswers as Record<string, unknown>,
      // Signal to the API that this is a calibration so it skips status sync.
      categoryOverride: "CALIBRATION_INSPECTION",
      calibratedAgainstSubmissionId: prev.id,
    });

    onSubmitted?.(result, syncPromise);
    if (isDraftGuarded) await overlayDraft.clearDraftOnSubmit();
    onClose();

    watchInspectionSync(
      syncPromise,
      tInspections("savingCalibrationToast"),
      tInspections("calibrationSavedToast"),
      tInspections("calibrationQueuedToast"),
      deferredMedia,
    );
  }

  // Freeze the body behind the overlay so background scroll doesn't
  // bleed through on touch devices. Restore on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleEditSubmit(answers: AnswersMap) {
    if (mode !== "edit") return;
    await prepareDraftForSubmit();
    const sub = activeSubmission ?? props.submission;

    const { answers: uploadedAnswers, deferredMedia } = await uploadInspectionMediaWithMeta(answers);
    const safeAnswers = sanitizeAnswersForStorage(uploadedAnswers);
    const outcome = deriveOutcome(template, safeAnswers);
    const deficiencyCount = countDeficiencies(template, safeAnswers).total;

    const { submission: updated, syncPromise } = await updateOfflineFirst(sub, {
      outcome,
      deficiencyCount,
      payload: safeAnswers as Record<string, unknown>,
    });

    props.onSaved?.(updated);
    if (isDraftGuarded) await overlayDraft.clearDraftOnSubmit();
    onClose();

    watchInspectionSync(
      syncPromise,
      tInspections("savingChangesToast"),
      tInspections("inspectionUpdatedToast"),
      tInspections("savedOfflineToast"),
      deferredMedia,
    );

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("inspections:updated", {
          detail: { unitId: sub.unitId, scopeRowId: sub.scopeRowId },
        }),
      );
    }
  }

  async function handleRetrySubmit(answers: AnswersMap) {
    if (mode !== "retry") return;
    await prepareDraftForSubmit();
    const prev = props.previousSubmission;

    // Defer captured media to blob store (local-first — never block on upload)
    const { answers: uploadedAnswers, deferredMedia } = await uploadInspectionMediaWithMeta(answers);
    const safeAnswers = sanitizeAnswersForStorage(uploadedAnswers);

    const outcome = deriveOutcome(template, safeAnswers);
    const deficiencyCount = countDeficiencies(template, safeAnswers).total;
    const binding = resolveSubmissionBindingFromTemplate(
      { category: prev.categorySnapshot, level: prev.level },
      scope,
    );

    const { submission: result, syncPromise } = await insert({
      formId: prev.formId ?? "",
      formVersionId: prev.templateSnapshot?.latestVersionId,
      templateSnapshot: template,
      formNameSnapshot: prev.formNameSnapshot,
      categorySnapshot: prev.categorySnapshot,
      level: binding.level,
      projectId,
      unitId,
      scopeRowId: binding.scopeRowId,
      scopeTypeCode: binding.scopeTypeCode,
      submittedAt: new Date().toISOString(),
      submittedBy: props.submittedBy ?? tInspections("overlayYou"),
      outcome,
      deficiencyCount,
      source: "FORM",
      payload: safeAnswers as Record<string, unknown>,
    });

    onSubmitted?.(result, syncPromise);
    if (isDraftGuarded) await overlayDraft.clearDraftOnSubmit();
    onClose();

    watchInspectionSync(
      syncPromise,
      tInspections("savingInspectionToast"),
      tInspections("savedOnlineToast"),
      tInspections("savedOfflineToast"),
      deferredMedia,
    );
  }

  async function handleLiveSubmit(answers: AnswersMap) {
    if (mode !== "live") return;
    await prepareDraftForSubmit();
    const formTemplate = props.form.template;

    // Defer captured media to blob store (local-first — never block on upload)
    const { answers: uploadedAnswers, deferredMedia } = await uploadInspectionMediaWithMeta(answers);
    const safeAnswers = sanitizeAnswersForStorage(uploadedAnswers);

    const outcome = deriveOutcome(formTemplate, safeAnswers);
    const deficiencyCount = countDeficiencies(formTemplate, safeAnswers).total;
    const binding = resolveSubmissionBindingFromTemplate(formTemplate, scope);

    // insert() queues to IndexedDB first, then attempts the API call
    // in the background — so this never throws even when offline.
    const { submission: result, syncPromise } = await insert({
      formId: props.form.id,
      formVersionId: formTemplate.latestVersionId,
      templateSnapshot: formTemplate,
      formNameSnapshot: formTemplate.name.trim() || tInspections("untitledForm"),
      categorySnapshot: formTemplate.category,
      level: binding.level,
      projectId,
      unitId,
      scopeRowId: binding.scopeRowId,
      scopeTypeCode: binding.scopeTypeCode,
      submittedAt: new Date().toISOString(),
      submittedBy: props.submittedBy ?? tInspections("overlayYou"),
      outcome,
      deficiencyCount,
      source: "FORM",
      payload: safeAnswers as Record<string, unknown>,
    });

    // Notify parent with the optimistic submission AND the sync promise so
    // it can update its list immediately and re-fetch when sync settles.
    onSubmitted?.(result, syncPromise);

    // Close immediately — submission is safely queued locally.
    if (isDraftGuarded) await overlayDraft.clearDraftOnSubmit();
    onClose();

    watchInspectionSync(
      syncPromise,
      tInspections("savingInspectionToast"),
      tInspections("savedOnlineToast"),
      tInspections("savedOfflineToast"),
      deferredMedia,
    );
  }

  async function handleExportInspectionPdf() {
    if (mode !== "readonly") return;
    const sub = (props as ReadonlyProps).submission;
    if (sub._pendingSync) {
      toast.error(tInspections("exportRecordPdfPendingSync"));
      return;
    }
    if (exportPdfStep) return;
    setExportPdfStep("working");
    setPendingInspectionPdf(null);
    try {
      const res = await fetch(`/api/inspection-submissions/${sub.id}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareOnlyFailedItems:
            !isDocumentationSubmission(sub) && shareOnlyFailedItems,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        toast.error(formatPdfExportErrorToast(errBody, tUnits("exportDetailPdfFailed")));
        setExportPdfStep(null);
        return;
      }
      const blob = await res.blob();
      if (!blob.size) {
        toast.error(tUnits("exportDetailPdfFailed"));
        setExportPdfStep(null);
        return;
      }
      const fileName = `inspection-${sub.id.slice(0, 8)}.pdf`;
      setExportPdfStep("done");

      if (isMobilePdfDelivery()) {
        setPendingInspectionPdf({ blob, fileName });
        return;
      }

      await deliverPdfBlob(blob, fileName);
      setTimeout(() => setExportPdfStep(null), 1200);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(tUnits("exportDetailPdfFailedGeneric"));
      }
      setExportPdfStep(null);
      setPendingInspectionPdf(null);
    }
  }

  async function handleSavePendingInspectionPdf() {
    if (!pendingInspectionPdf) return;
    try {
      await deliverPdfBlobOnUserGesture(
        pendingInspectionPdf.blob,
        pendingInspectionPdf.fileName,
      );
      setPendingInspectionPdf(null);
      setExportPdfStep(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(tInspections("reportExportSaveFailed"));
      }
    }
  }

  if (typeof document === "undefined") return null;

  const pdfExportOverlay =
    exportPdfStep ? (
      <InspectionPdfExportOverlay
        step={exportPdfStep === "done" ? "done" : "working"}
        recordCount={1}
        onSavePdf={
          pendingInspectionPdf ? () => void handleSavePendingInspectionPdf() : undefined
        }
        savePdfLabel={pendingInspectionPdf ? tInspections("reportExportSavePdf") : undefined}
      />
    ) : null;

  const inspectorLabel = props.submittedBy ?? tInspections("overlayYou");
  const liveFillDateLabel = formatInspectionDateLabel(new Date().toISOString());

  function renderFillHeader({
    formTemplate,
    attemptNumber,
    showCalibrationBanner = false,
    dateLabel = liveFillDateLabel,
    submittedByLabel = inspectorLabel,
  }: {
    formTemplate: typeof template;
    attemptNumber?: number;
    showCalibrationBanner?: boolean;
    dateLabel?: string;
    submittedByLabel?: string;
  }) {
    return (
      <InspectionSheetHeader
        sticky
        closeLabel={tCommon("close")}
        onClose={requestClose}
        locationParts={props.locationParts}
        categoryEyebrow={
          formTemplate.category === "CALIBRATION_INSPECTION"
            ? null
            : isDocumentationForm(formTemplate)
              ? tInspections("documentationFormEyebrow")
              : INSPECTION_CATEGORY_LABELS[formTemplate.category]
        }
        showCalibrationBanner={showCalibrationBanner}
        title={formTemplate.name.trim() || tInspections("untitledForm")}
        scopeCode={scope?.scopeType?.code ?? undefined}
        scopeTypeName={scope?.scopeType?.name ?? undefined}
        attemptLabel={
          attemptNumber != null
            ? tInspections("retryAttemptLabel", { n: attemptNumber })
            : undefined
        }
        outcome={{ passed: null }}
        installerName={scope?.installer?.name ?? undefined}
        dateLabel={dateLabel}
        submittedBy={submittedByLabel}
        submittedByMetaLabel={
          isDocumentationForm(formTemplate)
            ? tInspections("headerMetaSubmittedBy")
            : undefined
        }
        projectName={props.projectName}
      />
    );
  }

  // ── Shared readonly content (header + record + nav bar) ──────────────────
  const readonlySubmission =
    mode === "readonly" ? (props as ReadonlyProps).submission : null;
  const showShareOnlyFailedToggle =
    mode === "readonly" &&
    readonlySubmission != null &&
    !isDocumentationSubmission(readonlySubmission);

  const readonlyContent = mode === "readonly" ? (
    <>
      <ReadonlyToolbar
        onClose={onClose}
        onExportPdf={() => void handleExportInspectionPdf()}
        exportingPdf={exportingInspectionPdf}
        exportDisabled={Boolean((props as ReadonlyProps).submission._pendingSync)}
        onEdit={(props as ReadonlyProps).onEdit}
      />
      {showShareOnlyFailedToggle ? (
        <div
          style={{
            padding: "0 10px",
            borderBottom: "1px solid var(--neutral-100)",
            backgroundColor: "var(--neutral-0)",
          }}
        >
          <ShareOnlyFailedItemsToggle
            id="inspection-record-share-failed-only"
            checked={shareOnlyFailedItems}
            onChange={setShareOnlyFailedItems}
          />
        </div>
      ) : null}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <InspectionSheetHeader
          sticky
          showCloseButton={false}
          closeLabel={tCommon("close")}
          onClose={onClose}
          locationParts={props.locationParts}
          locationLabel={(props as ReadonlyProps).locationLabel}
          categoryEyebrow={
            props.submission.categorySnapshot === "CALIBRATION_INSPECTION"
              ? null
              : isDocumentationSubmission((props as ReadonlyProps).submission)
                ? tInspections("documentationFormEyebrow")
                : INSPECTION_CATEGORY_LABELS[props.submission.categorySnapshot]
          }
          showCalibrationBanner={
            props.submission.categorySnapshot === "CALIBRATION_INSPECTION"
          }
          title={props.submission.formNameSnapshot}
          scopeCode={scope?.scopeType?.code ?? undefined}
          scopeTypeName={scope?.scopeType?.name ?? undefined}
          attemptLabel={
            (props as ReadonlyProps).attemptNumber != null
              ? tInspections("retryAttemptLabel", {
                  n: (props as ReadonlyProps).attemptNumber!,
                })
              : undefined
          }
          outcome={
            isDocumentationSubmission((props as ReadonlyProps).submission)
              ? { passed: null }
              : {
                  passed:
                    props.submission.outcome === "FAIL"
                      ? false
                      : props.submission.outcome === "PASS" ||
                          props.submission.outcome === "COMPLETE"
                        ? true
                        : null,
                }
          }
          installerName={scope?.installer?.name ?? undefined}
          dateLabel={formatInspectionDateLabel(props.submission.submittedAt)}
          submittedBy={props.submission.submittedBy}
          submittedByMetaLabel={
            isDocumentationSubmission((props as ReadonlyProps).submission)
              ? tInspections("headerMetaSubmittedBy")
              : undefined
          }
          projectName={props.projectName}
        />
        {hydratingSubmission ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "48px 24px",
              color: "var(--neutral-400)",
            }}
            aria-busy="true"
            aria-label={tInspections("loadingRecord")}
          >
            <Loader2 size={24} className="animate-spin" aria-hidden />
          </div>
        ) : (
          <InspectionRecordClient
            template={template}
            answers={((activeSubmission ?? (props as ReadonlyProps).submission).payload) as AnswersMap}
            onClose={onClose}
            hideToolbar
          />
        )}
      </div>
      {hasNav && recordIndex !== undefined && recordTotal !== undefined && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)",
            borderTop: "1px solid var(--neutral-200)",
            backgroundColor: "var(--neutral-0)",
            flexShrink: 0,
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            aria-label={tInspections("previousInspectionAria")}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "10px 18px", borderRadius: 999,
              border: "1.5px solid var(--neutral-200)",
              backgroundColor: onPrev ? "var(--neutral-0)" : "var(--neutral-50)",
              color: onPrev ? "var(--neutral-700)" : "var(--neutral-300)",
              fontSize: 14, fontWeight: 600,
              cursor: onPrev ? "pointer" : "default",
              minHeight: 44, transition: "background-color 0.12s",
            }}
          >
            <ChevronLeft size={16} aria-hidden />
            Prev
          </button>
          <span
            style={{
              fontSize: 13, fontWeight: 500, color: "var(--neutral-400)",
              fontVariantNumeric: "tabular-nums", flexShrink: 0,
            }}
          >
            {recordIndex}{" "}
            <span style={{ color: "var(--neutral-300)" }}>of</span>{" "}
            {recordTotal}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            aria-label={tInspections("nextInspectionAria")}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "10px 18px", borderRadius: 999,
              border: "1.5px solid var(--neutral-200)",
              backgroundColor: onNext ? "var(--neutral-0)" : "var(--neutral-50)",
              color: onNext ? "var(--neutral-700)" : "var(--neutral-300)",
              fontSize: 14, fontWeight: 600,
              cursor: onNext ? "pointer" : "default",
              minHeight: 44, transition: "background-color 0.12s",
            }}
          >
            Next
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      )}
    </>
  ) : null;

  // ── Panel mode (slide-in from right on desktop, slide-up on mobile) ────────
  if (panelMode && mode === "readonly") {
    return createPortal(
      <>
        <style dangerouslySetInnerHTML={{ __html: PANEL_CSS }} />
        {pdfExportOverlay}
        <div
          className={`ifo-backdrop${overlayVisible ? " ifo-visible" : ""}`}
          onClick={onClose}
        >
          <div
            className={`ifo-sheet${overlayVisible ? " ifo-visible" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ifo-handle" aria-hidden />
            {readonlyContent}
          </div>
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: FILL_CSS }} />
      {pdfExportOverlay}
      {!blockingResumePrompt && (
      <div
        className={`ifo-fill-backdrop${overlayVisible ? " ifo-fill-open" : ""}`}
        data-inspection-fill-overlay
        onClick={backdropClose}
      >
        <div
          className={`ifo-fill-modal${overlayVisible ? " ifo-fill-open" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ifo-fill-handle" aria-hidden />
          {mode === "readonly" ? (
            readonlyContent
          ) : mode === "edit" ? (
            !overlayDraft.draftReady ? (
              draftLoadingSpinner
            ) : hydratingSubmission ? (
              draftLoadingSpinner
            ) : (
            <>
              {(props as EditProps).onReclassifyToCalibration ? (
                <EditReclassifyBanner
                  onConvert={(props as EditProps).onReclassifyToCalibration!}
                  converting={(props as EditProps).reclassifyingToCalibration ?? false}
                />
              ) : null}
            <FormFillClient
              template={template}
              mode="live"
              submitLabel={tUnits("saveChangesBtn")}
              {...formDraftProps}
              onSubmit={handleEditSubmit}
              onClose={requestClose}
            />
            </>
            )
          ) : mode === "retry" ? (
            !overlayDraft.draftReady ? (
              draftLoadingSpinner
            ) : hydratingSubmission ? (
              draftLoadingSpinner
            ) : (
            <>
              {pendingMediaBanner}
            <RetryFillLayout
              template={template}
              previousAnswers={((activeSubmission ?? props.previousSubmission).payload) as AnswersMap}
              attemptNumber={props.attemptNumber}
              onSubmit={handleRetrySubmit}
              onClose={requestClose}
              locationParts={(props as RetryProps).locationParts}
              previousSubmittedBy={props.previousSubmission.submittedBy}
              previousSubmittedAt={props.previousSubmission.submittedAt}
              questionSectionMap={questionSectionMap}
              scope={scope}
              categoryEyebrow={
                INSPECTION_CATEGORY_LABELS[baseTemplate.category] ?? null
              }
              seedClearInspectionNumberDefaults={seedClearInspectionNumberDefaults}
              {...retryDraftProps}
            />
            </>
            )
          ) : mode === "calibration" ? (
            !overlayDraft.draftReady ? (
              draftLoadingSpinner
            ) : (
            <>
              {pendingMediaBanner}
              {renderFillHeader({
                formTemplate: template,
                attemptNumber: props.attemptNumber,
                showCalibrationBanner: true,
              })}
              <FormFillClient
                template={template}
                mode="live"
                hideChrome
                submitLabel="Submit Calibration"
                onSubmit={handleCalibrationSubmit}
                onClose={requestClose}
                {...formDraftProps}
              />
            </>
            )
          ) : (
            !overlayDraft.draftReady ? (
              draftLoadingSpinner
            ) : (
            <>
              {pendingMediaBanner}
              {renderFillHeader({
                formTemplate: template,
                attemptNumber: props.attemptNumber,
              })}
              <FormFillClient
                template={template}
                mode="live"
                hideChrome
                onSubmit={handleLiveSubmit}
                onClose={requestClose}
                seedClearInspectionNumberDefaults={seedClearInspectionNumberDefaults}
                {...formDraftProps}
              />
            </>
            )
          )}
        </div>
      </div>
      )}
      {isDraftGuarded && (
        <>
          <InspectionLeaveGuardSheet
            open={overlayDraft.leaveGuard.guardOpen}
            onKeepEditing={overlayDraft.leaveGuard.closeGuardKeepEditing}
            onSaveAndClose={overlayDraft.leaveGuard.closeGuardSaveAndClose}
            onDiscard={overlayDraft.leaveGuard.closeGuardDiscard}
          />
          <InspectionDraftResumeSheet
            open={overlayDraft.resumeSheetOpen}
            updatedAt={overlayDraft.resumePromptDraft?.updatedAt ?? ""}
            answeredCount={overlayDraft.resumeAnsweredCount}
            totalQuestions={overlayDraft.totalQuestions}
            onResume={() => overlayDraft.handleResumeChoice(true)}
            onStartOver={() => overlayDraft.handleResumeChoice(false)}
          />
        </>
      )}
    </>,
    document.body,
  );
}

// ── Calibration context banner ────────────────────────────────────────────────

function CalibrationBanner() {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "11px 16px",
        backgroundColor: "var(--primary-50, #eff6ff)",
        borderBottom: "1px solid var(--primary-200, #bfdbfe)",
      }}
    >
      <FlaskConical
        size={15}
        aria-hidden
        style={{ color: "var(--primary-600, #2563eb)", flexShrink: 0, marginTop: 1 }}
      />
      <div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--primary-800, #1e40af)",
            display: "block",
            lineHeight: 1.3,
          }}
        >
          Calibration Inspection
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--primary-700, #1d4ed8)",
            lineHeight: 1.4,
          }}
        >
          Your results will be recorded separately and will not change the scope&rsquo;s current status.
        </span>
      </div>
    </div>
  );
}

// ── Retry context banner ──────────────────────────────────────────────────────

function RetryContextBanner({ attemptNumber }: { attemptNumber: number }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "11px 16px",
        backgroundColor: "var(--warning-50, #fffbeb)",
        borderBottom: "1px solid var(--warning-200, #fde68a)",
      }}
    >
      <AlertTriangle
        size={15}
        aria-hidden
        style={{ color: "var(--warning-600, #d97706)", flexShrink: 0, marginTop: 1 }}
      />
      <div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--warning-800, #92400e)",
            display: "block",
            lineHeight: 1.3,
          }}
        >
          Attempt #{attemptNumber}
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--warning-700, #b45309)",
            lineHeight: 1.4,
          }}
        >
          Deficiencies from the previous attempt are listed first. Address each one before submitting.
        </span>
      </div>
    </div>
  );
}

// ── Readonly sticky toolbar ───────────────────────────────────────────────────

function ReadonlyToolbar({
  onClose,
  onExportPdf,
  exportingPdf,
  exportDisabled,
  onEdit,
}: {
  onClose: () => void;
  onExportPdf: () => void;
  exportingPdf: boolean;
  exportDisabled: boolean;
  onEdit?: () => void;
}) {
  const t = useTranslations("inspections");
  const tCommon = useTranslations("common");
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        backgroundColor: "var(--neutral-0)",
        borderBottom: "1px solid var(--neutral-150)",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--neutral-500)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {t("recordTitle")}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("editInspectionToolbar")}
            title={t("editInspectionToolbar")}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "var(--neutral-500)",
              borderRadius: 7,
              cursor: "pointer",
            }}
          >
            <Pencil size={17} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onExportPdf}
          disabled={exportingPdf || exportDisabled}
          aria-label={exportingPdf ? t("exportRecordPdfBusyAria") : t("exportRecordPdfAria")}
          title={
            exportDisabled
              ? t("exportRecordPdfPendingSync")
              : exportingPdf
                ? t("exportRecordPdfBusyAria")
                : t("exportRecordPdfAria")
          }
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: "var(--neutral-500)",
            borderRadius: 7,
            cursor: exportingPdf || exportDisabled ? "not-allowed" : "pointer",
            opacity: exportDisabled ? 0.45 : exportingPdf ? 0.7 : 1,
          }}
        >
          {exportingPdf
            ? <Loader2 size={16} className="animate-spin" aria-hidden style={{ color: "var(--neutral-500)" }} />
            : <FileDown size={18} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon("close")}
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: "var(--neutral-500)",
            borderRadius: 7,
            cursor: "pointer",
          }}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function EditReclassifyBanner({
  onConvert,
  converting,
}: {
  onConvert: () => void;
  converting: boolean;
}) {
  const t = useTranslations("inspections");
  return (
    <div
      style={{
        padding: "10px 12px",
        borderBottom: "1px solid var(--neutral-150)",
        backgroundColor: "var(--neutral-50)",
      }}
    >
      <button
        type="button"
        onClick={onConvert}
        disabled={converting}
        aria-label={t("reclassifyToCalibrationEditBanner")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "10px 12px",
          border: "1px solid var(--neutral-200)",
          borderRadius: 8,
          backgroundColor: "var(--neutral-0)",
          color: "var(--neutral-800)",
          fontSize: 14,
          fontWeight: 600,
          textAlign: "left",
          cursor: converting ? "default" : "pointer",
          opacity: converting ? 0.6 : 1,
          fontFamily: "inherit",
        }}
      >
        {converting ? (
          <Loader2 size={16} className="animate-spin" aria-hidden style={{ flexShrink: 0 }} />
        ) : (
          <FlaskConical size={16} aria-hidden style={{ flexShrink: 0, color: "var(--primary-600)" }} />
        )}
        {t("reclassifyToCalibrationEditBanner")}
      </button>
    </div>
  );
}

