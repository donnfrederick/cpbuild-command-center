"use client";

/**
 * Inspector-facing preview of a form.
 *
 * This component renders a FormTemplate the way an inspector would see it
 * in the field — no editing affordances, live interactive answer controls,
 * and the deficiency-capture flow expanded when a `PASS_FAIL_DEFICIENCIES`
 * question is marked "Fail". It's wired up to run either:
 *
 *   - Standalone at `/forms/[id]/preview` (loading from the store), or
 *   - Inline from the builder (via future `<FormFillClient template={...} />`).
 *
 * State is local-only and deliberately ephemeral: nothing submits anywhere.
 * The footer Submit button surfaces a "Preview — not submitted" banner so
 * designers can feel the complete tap flow without worrying about data.
 */

import { Fragment, startTransition, useCallback, useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Camera,
  Eye,
  Loader2,
  Mic,
  Pencil,
  Play,
  Plus,
  Star,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type {
  CapturedMediaItem,
  Deficiency,
  DeficiencySeverity,
  FormQuestion,
  FormTemplate,
  ResponseType,
} from "./formTypes";
import {
  allowsAdditionalDeficiencies,
  DEFICIENCY_SEVERITIES,
  deficiencySeverityModifier,
  RESPONSE_META,
  AUTO_NOTES_KEY,
  AUTO_MEDIA_KEY,
} from "./formTypes";
import { CameraCapture, type CapturedFile } from "@/components/projects/CameraCapture";
import {
  ImageAnnotationEditor,
  isFlattenAnnotationSave,
} from "@/components/projects/ImageAnnotationEditor";
import { getForm } from "@/lib/forms/formsApi";
import { findIncompleteRequiredFollowUps } from "@/lib/inspections/answer-completeness";
import { answersDirty } from "@/lib/inspections/inspection-draft";
import { activeFollowUpEntries } from "@/lib/forms/choice-follow-ups";
import { applyClearInspectionNumberDefaults } from "@/lib/forms/clear-inspection-number-defaults";
import { MAX_PHOTOS_PER_CAPTURE_SESSION } from "@/lib/media-attachment-limits";

// ── Answer state ─────────────────────────────────────────────────────────────

export interface AnswerState {
  /** Single-choice value (PASS_FAIL, PASS_FAIL_DEFICIENCIES, YES_NO, MULTIPLE_CHOICE) */
  choice?: string;
  /** Multi-choice values (CHECKBOXES) */
  choices?: string[];
  /** Text answer (SHORT_ANSWER, PARAGRAPH) */
  text?: string;
  /** Numeric answer (NUMBER) — stored as string to allow partial input */
  number?: string;
  /** 1-5 rating */
  rating?: number;
  /** Deficiencies list when PASS_FAIL_DEFICIENCIES value is "Fail" */
  deficiencies?: Deficiency[];
  /** Deficiencies marked resolved on a retry attempt (with resolution note / photo). */
  resolvedDeficiencies?: Deficiency[];
  /** Media captured for `photoRequired` questions (photo / video / audio). */
  capturedFiles?: CapturedMediaItem[];
  /** Optional inspector comment when `commentsEnabled` on the question. */
  comment?: string;
}

export type AnswersMap = Record<string, AnswerState>;

/**
 * Which "flavor" of fill client this is — decides the top-bar badge,
 * the footer copy, whether Submit is wired up or a no-op, and whether
 * answer controls are interactive at all.
 *
 * - `preview`: builder-preview flow. Submit surfaces a "not submitted"
 *   toast. This is the historical behavior and the default.
 * - `live`: real inspection. Submit calls `onSubmit` with the answers;
 *   the caller persists them and closes the overlay.
 * - `readonly`: reviewing a past submission. All controls disabled,
 *   Submit hidden, no validation banners. Used to re-open an old
 *   inspection from the scope history list.
 */
export type FormFillMode = "preview" | "live" | "readonly";

function defId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newDeficiency(): Deficiency {
  // Intentionally no default severity — the inspector must pick one.
  // Auto-selecting a tier lets people rubber-stamp; making it empty
  // forces a deliberate choice. See the `Deficiency` type for rationale.
  // count defaults to 1 — the most common case is a single occurrence.
  return {
    id: defId(),
    description: "",
    count: 1,
  };
}

// ── Loader wrapper (used by the /preview route) ──────────────────────────────

export function FormFillLoader({
  id,
  onClose,
}: {
  id: string;
  onClose?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("forms.fill");
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; form: FormTemplate }
    | { status: "missing" }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getForm(id)
      .then((stored) => {
        if (cancelled) return;
        startTransition(() => {
          setState(stored ? { status: "ready", form: stored.template } : { status: "missing" });
        });
      })
      .catch(() => {
        if (!cancelled) startTransition(() => setState({ status: "missing" }));
      });
    return () => { cancelled = true; };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--neutral-400)",
          gap: 8,
          fontSize: 13,
        }}
      >
        <Loader2
          size={16}
          aria-hidden
          style={{ animation: "spin 0.8s linear infinite" }}
        />
        {t("loadingForm")}
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "40px 24px",
          gap: 14,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: "var(--neutral-900)",
          }}
        >
          {t("formNotFound")}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "var(--neutral-500)",
            maxWidth: 340,
            lineHeight: 1.5,
          }}
        >
          {t("formNotFoundDescription")}
        </p>
        <button
          type="button"
          onClick={() => router.push("/forms")}
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            border: "none",
            backgroundColor: "var(--primary-600)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {t("backToForms")}
        </button>
      </div>
    );
  }

  return (
    <FormFillClient
      template={state.form}
      mode="preview"
      onClose={onClose}
    />
  );
}

// ── Main fill client ─────────────────────────────────────────────────────────

export interface FormFillDraftRegistration {
  isDirty: () => boolean;
  getAnswers: () => AnswersMap;
  isSubmitting?: () => boolean;
}

export interface FormFillClientProps {
  template: FormTemplate;
  /**
   * Optional controls:
   *
   * - `mode`: switches between preview (default), live inspection, and
   *   readonly review of a past submission.
   * - `initialAnswers`: seed state, used by readonly review.
   * - `onSubmit`: in live mode, called with the validated answers. The
   *   caller is responsible for persisting the submission and closing
   *   the overlay.
   * - `onClose`: overrides the default back-button behavior (which is
   *   to close the tab if `window.opener` exists, otherwise push to
   *   `/forms`). Used by the overlay to dismiss itself.
   */
  mode?: FormFillMode;
  initialAnswers?: AnswersMap;
  onSubmit?: (answers: AnswersMap) => void | Promise<void>;
  onClose?: () => void;
  /** Override the submit button label (default: translation of "Submit"). */
  submitLabel?: string;
  /**
   * When true, hides the built-in back toolbar and form title band so a
   * parent shell (e.g. InspectionSheetHeader) owns the chrome.
   */
  hideChrome?: boolean;
  /** Baseline answer map for leave-guard dirty detection in live mode. */
  dirtyBaseline?: AnswersMap;
  /** Parent reads current answers / dirty state for local draft persistence. */
  draftRegistrationRef?: MutableRefObject<FormFillDraftRegistration | null>;
  /** Called when answers change in live mode (debounced autosave in overlay). */
  onDraftChange?: () => void;
  /**
   * When set with `initialAnswers`, re-hydrates local state only when this
   * revision changes (draft resume / start over). Prevents wiping in-progress
   * answers when the parent re-renders with a fresh `{}` reference.
   */
  initialAnswersRevision?: string;
  /**
   * When true in live mode, pre-fills required NUMBER questions with "0"
   * for Clear Inspection forms (see applyClearInspectionNumberDefaults).
   */
  seedClearInspectionNumberDefaults?: boolean;
}

export function FormFillClient({
  template,
  mode = "preview",
  initialAnswers,
  onSubmit,
  onClose,
  submitLabel,
  hideChrome = false,
  dirtyBaseline,
  draftRegistrationRef,
  onDraftChange,
  initialAnswersRevision,
  seedClearInspectionNumberDefaults = false,
}: FormFillClientProps) {
  const router = useRouter();
  const t = useTranslations("forms.fill");
  const isReadonly = mode === "readonly";
  const isLive = mode === "live";

  const seedAnswersIfEnabled = useCallback(
    (source: AnswersMap): AnswersMap => {
      if (seedClearInspectionNumberDefaults && isLive) {
        return applyClearInspectionNumberDefaults(template, source);
      }
      return source;
    },
    [seedClearInspectionNumberDefaults, isLive, template],
  );

  const [answers, setAnswers] = useState<AnswersMap>(() =>
    seedAnswersIfEnabled(initialAnswers ?? {}),
  );
  const dirtyBaselineRef = useRef<AnswersMap>(
    seedAnswersIfEnabled(dirtyBaseline ?? initialAnswers ?? {}),
  );
  const appliedInitialAnswersRevisionRef = useRef<string | undefined>(undefined);
  const [submittedNotice, setSubmittedNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /**
   * True once the inspector has tapped Submit at least once. Flipping this
   * on causes any deficiency that's still missing a severity to surface
   * a visible error state (not just the neutral "pick one" hint).
   */
  const [showValidation, setShowValidation] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const blockedMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  function scheduleBlockedMessageClear() {
    if (blockedMessageTimeoutRef.current) {
      clearTimeout(blockedMessageTimeoutRef.current);
    }
    blockedMessageTimeoutRef.current = setTimeout(() => {
      blockedMessageTimeoutRef.current = null;
      setBlockedMessage(null);
    }, 4500);
  }

  useEffect(() => {
    return () => {
      if (blockedMessageTimeoutRef.current) {
        clearTimeout(blockedMessageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (dirtyBaseline !== undefined) {
      dirtyBaselineRef.current = seedAnswersIfEnabled(dirtyBaseline);
    }
  }, [dirtyBaseline, seedAnswersIfEnabled]);

  useEffect(() => {
    if (initialAnswers === undefined) return;
    if (initialAnswersRevision !== undefined) {
      if (appliedInitialAnswersRevisionRef.current === initialAnswersRevision) {
        return;
      }
      appliedInitialAnswersRevisionRef.current = initialAnswersRevision;
    }
    const seeded = seedAnswersIfEnabled(initialAnswers);
    setAnswers(seeded);
    dirtyBaselineRef.current =
      dirtyBaseline !== undefined
        ? seedAnswersIfEnabled(dirtyBaseline)
        : seeded;
  }, [initialAnswers, initialAnswersRevision, dirtyBaseline, seedAnswersIfEnabled]);

  useEffect(() => {
    if (!draftRegistrationRef || !isLive) return;
    draftRegistrationRef.current = {
      isDirty: () => answersDirty(dirtyBaselineRef.current, answers),
      getAnswers: () => answers,
      isSubmitting: () => submitting,
    };
    return () => {
      draftRegistrationRef.current = null;
    };
  }, [draftRegistrationRef, isLive, answers, submitting]);

  useEffect(() => {
    if (isLive && onDraftChange) {
      onDraftChange();
    }
  }, [answers, isLive, onDraftChange]);

  /**
   * Only sections with at least one question are shown to the inspector.
   * Empty sections are a builder-time scaffold — exposing them in the
   * fill view (or a published form) makes the form look half-finished
   * and forces the inspector to scroll through visual dead-ends. Hiding
   * them at render time also means the builder doesn't have to pre-prune
   * on publish: the section-count labels and navigation all key off this
   * filtered list, so a "Section 1 of 2" only renders when there really
   * are two non-empty sections.
   */
  const visibleSections = template.sections.filter(
    (s) => s.questions.length > 0,
  );

  const isBare =
    visibleSections.length === 1 &&
    visibleSections[0].title.trim() === "";

  const totalQuestions = visibleSections.reduce(
    (sum, sec) => sum + sec.questions.length,
    0,
  );

  function updateAnswer(id: string, patch: Partial<AnswerState>) {
    // Readonly review is just looking at a past inspection — any stray
    // tap on a control shouldn't mutate the snapshot we're showing.
    // Silently dropping the update (rather than hiding controls
    // entirely) keeps the layout identical between live and readonly
    // so a reviewer can eyeball the exact same visual the inspector
    // saw at submit time.
    if (isReadonly) return;
    setAnswers((prev) => {
      const merged: AnswersMap = {
        ...prev,
        [id]: { ...(prev[id] ?? {}), ...patch },
      };
      return seedAnswersIfEnabled(merged);
    });
  }

  /**
   * Does the question have a meaningful answer yet?
   *
   * Each response type has its own definition of "answered":
   *   - choice-based: a choice was picked
   *   - checkboxes: at least one box is ticked
   *   - text / paragraph: some non-whitespace characters
   *   - number: anything non-empty (allows partial input like "-")
   *   - rating: a star tier was selected
   *
   * Keep this narrow — we use the same helper to gate both the
   * Submit button and any future "jump to next unanswered" navigation,
   * so it has to match the inspector's intuition of whether a row is
   * "done." Note: for PASS_FAIL_DEFICIENCIES, picking "Fail" counts as
   * answered at this layer; the deficiencies-completeness check lives
   * separately in `findIncompleteDeficiencies` so the two gates compose.
   */
  function isQuestionAnswered(
    q: FormQuestion,
    a: AnswerState | undefined,
  ): boolean {
    if (!a) return false;
    switch (q.responseType) {
      case "PASS_FAIL":
      case "PASS_FAIL_DEFICIENCIES":
      case "YES_NO":
      case "MULTIPLE_CHOICE":
        return Boolean(a.choice);
      case "CHECKBOXES":
        return (a.choices?.length ?? 0) > 0;
      case "SHORT_ANSWER":
      case "PARAGRAPH":
        return Boolean(a.text && a.text.trim().length > 0);
      case "NUMBER":
        return Boolean(a.number && a.number.trim().length > 0);
      case "RATING":
        return Boolean(a.rating);
      default:
        return false;
    }
  }

  /**
   * Required questions that haven't been answered yet. Only questions
   * with `required: true` block submission — if the builder marked a
   * question optional, the inspector is allowed to skip it.
   */
  function findUnansweredRequiredQuestions(): {
    questionId: string;
    title: string;
  }[] {
    const unanswered: { questionId: string; title: string }[] = [];
    for (const section of visibleSections) {
      for (const q of section.questions) {
        if (!q.required) continue;
        if (!isQuestionAnswered(q, answers[q.id])) {
          unanswered.push({ questionId: q.id, title: q.title });
        }
      }
    }
    return unanswered;
  }

  /**
   * Walk every PASS_FAIL_DEFICIENCIES question that's been marked "Fail"
   * and tally deficiency entries that aren't fully characterized.
   *
   * A deficiency on fail requires severity; description and photo are optional
   * unless the question enables `deficiencyPhotoRequired`.
   *
   * The return value is granular enough that the banner copy can call
   * out what's missing and future iterations can scroll-to / focus the
   * first offending entry.
   */
  function findIncompleteDeficiencies(): {
    questionId: string;
    deficiencyId: string;
    missingDescription: boolean;
    missingSeverity: boolean;
    missingPhoto: boolean;
  }[] {
    const incomplete: {
      questionId: string;
      deficiencyId: string;
      missingDescription: boolean;
      missingSeverity: boolean;
      missingPhoto: boolean;
    }[] = [];
    for (const section of visibleSections) {
      for (const q of section.questions) {
        if (q.responseType !== "PASS_FAIL_DEFICIENCIES") continue;
        const a = answers[q.id];
        if (a?.choice !== "fail") continue;
        for (const d of a.deficiencies ?? []) {
          const missingDescription = false;
          const missingSeverity = !d.severity;
          const missingPhoto = (q.deficiencyPhotoRequired ?? false) && !(d.capturedFiles?.length);
          if (missingDescription || missingSeverity || missingPhoto) {
            incomplete.push({
              questionId: q.id,
              deficiencyId: d.id,
              missingDescription,
              missingSeverity,
              missingPhoto,
            });
          }
        }
      }
    }
    return incomplete;
  }

  // Live-derived so the Submit button can reflect blocked state visually
  // (greyed out) instead of only surfacing it on click. Inspectors
  // shouldn't have to tap a button to discover the form isn't ready —
  // they should see at a glance whether they have loose ends.
  //
  // Submission is blocked when EITHER:
  //   1. A required question hasn't been answered yet, OR
  //   2. A Fail answer has incompletely-documented deficiencies
  //      (missing description, severity, or photo).
  //
  // The per-field inline hints tell them WHERE the loose ends are; the
  // disabled button + tooltip / banner tells them WHY.
  const unansweredRequired = findUnansweredRequiredQuestions();
  const incompleteDeficiencies = findIncompleteDeficiencies();

  const incompleteFollowUps = findIncompleteRequiredFollowUps(visibleSections, answers);

  const submitBlocked =
    unansweredRequired.length > 0 ||
    incompleteDeficiencies.length > 0 ||
    incompleteFollowUps.length > 0;

  /**
   * Assemble a human-readable reason for the blocked state, used both
   * as the disabled button's tooltip (hover/long-press) and the
   * post-tap banner.
   *
   * Unanswered-required is listed first because it's the more
   * "fundamental" gap — if a question doesn't have an answer yet, the
   * deficiency state under it isn't meaningful.
   */
  const submitBlockedReason = (() => {
    if (!submitBlocked) return undefined;

    const pieces: string[] = [];

    if (unansweredRequired.length > 0) {
      pieces.push(
        unansweredRequired.length === 1
          ? t("submitBlockedUnansweredOne")
          : t("submitBlockedUnansweredMany", { count: unansweredRequired.length }),
      );
    }

    if (incompleteDeficiencies.length > 0) {
      const anyDesc = incompleteDeficiencies.some((x) => x.missingDescription);
      const anySev = incompleteDeficiencies.some((x) => x.missingSeverity);
      const anyPhoto = incompleteDeficiencies.some((x) => x.missingPhoto);
      const parts: string[] = [];
      if (anyDesc) parts.push(t("submitBlockedDefDesc"));
      if (anySev) parts.push(t("submitBlockedDefSeverity"));
      if (anyPhoto) parts.push(t("submitBlockedDefPhoto"));
      const what =
        parts.length === 1
          ? parts[0]
          : parts.length === 2
            ? `${parts[0]}${t("submitBlockedConnector")}${parts[1]}`
            : `${parts.slice(0, -1).join(", ")}, ${t("submitBlockedConnector").trim()}${parts[parts.length - 1]}`;
      const countLabel =
        incompleteDeficiencies.length === 1
          ? t("submitBlockedDefCountOne")
          : t("submitBlockedDefCountMany", { count: incompleteDeficiencies.length });
      pieces.push(t("submitBlockedAdd", { what, countLabel }));
    }

    if (incompleteFollowUps.length > 0) {
      pieces.push(t("submitBlockedFollowUp"));
    }

    return `${pieces.join(` ${t("submitBlockedConnector").trim()} `)} ${t("submitBlockedSuffix")}`;
  })();

  async function handleSubmit() {
    if (submitBlocked) {
      setShowValidation(true);
      setSubmittedNotice(false);
      if (!isLive) {
        const reason = submitBlockedReason ?? t("submitBlockedGeneric");
        setBlockedMessage(reason.charAt(0).toUpperCase() + reason.slice(1));
        setTimeout(() => setBlockedMessage(null), 4500);
      }
      return;
    }

    // Live mode routes through the caller. If it throws we flash a
    // banner and leave the form in place so the inspector can retry.
    if (isLive && onSubmit) {
      try {
        setSubmitting(true);
        await onSubmit(answers);
        // Caller is expected to unmount us (close the overlay) on
        // success. If they don't, we still clear `submitting` so the
        // button becomes tappable again.
      } catch (err) {
        console.error("[FormFillClient] onSubmit failed", err);
        setBlockedMessage(
          err instanceof Error && err.message
            ? err.message
            : t("couldNotSave"),
        );
        setTimeout(() => setBlockedMessage(null), 4500);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Preview mode — show the "not submitted" toast.
    setSubmittedNotice(true);
    setTimeout(() => setSubmittedNotice(false), 3500);
  }

  return (
    <div
      style={{
        minHeight: hideChrome ? 0 : "100vh",
        backgroundColor: "var(--neutral-50, #fafafa)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Top bar ── */}
      {!hideChrome && (
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backgroundColor: "#fff",
          borderBottom: "1px solid var(--neutral-200)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 20px",
          height: 52,
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (onClose) {
              onClose();
              return;
            }
            // If this tab was opened from the builder, just close it
            if (window.opener) {
              window.close();
              return;
            }
            router.push("/forms");
          }}
          aria-label={
            isReadonly ? t("closeReview") : isLive ? t("cancelInspection") : t("closePreview")
          }
          style={{
            width: 32,
            height: 32,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "none",
            borderRadius: 6,
            cursor: "pointer",
            color: "var(--neutral-600)",
          }}
        >
          <ArrowLeft size={18} aria-hidden />
        </button>

        {mode === "preview" && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 9px",
              backgroundColor: "var(--primary-50, #eff6ff)",
              color: "var(--primary-700, #1d4ed8)",
              border: "1px solid var(--primary-200, #bfdbfe)",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            <Eye size={11} aria-hidden />
            {t("previewBadge")}
          </span>
        )}
        {isReadonly && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 9px",
              backgroundColor: "var(--neutral-100)",
              color: "var(--neutral-600)",
              border: "1px solid var(--neutral-200)",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            {t("reviewingBadge")}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <span
          style={{
            fontSize: 12,
            color: "var(--neutral-500)",
            whiteSpace: "nowrap",
          }}
        >
          {t("questionCount", { count: totalQuestions })}
        </span>
      </div>
      )}

      {/* ── Preview-mode banner ──
          Only rendered in preview mode — in live and readonly we drop
          this banner since "nothing is saved" is either wrong (live)
          or uninteresting (readonly). */}
      {mode === "preview" && (
        <div
          style={{
            backgroundColor: "#fef3c7",
            color: "#92400e",
            fontSize: 12,
            padding: "7px 16px",
            textAlign: "center",
            borderBottom: "1px solid #fcd34d",
            lineHeight: 1.4,
          }}
        >
          {t("previewBanner")}
        </div>
      )}

      {/* ── Body ──
          Edge-to-edge band layout. No horizontal page gutter — each
          band (title, section header, question, submit footer) spans
          the full viewport width on mobile and stacks directly against
          the next with a 1 px hairline between. This trades the old
          "rounded white cards on a grey page" look for a denser, more
          app-like form feed: questions read as a continuous list
          instead of a stack of individually-framed panels.
          `maxWidth: 720` keeps the bands from becoming unreadable
          wide-text rivers on desktop. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          padding: 0,
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          backgroundColor: "#fff",
          // Hairline at the bottom of the whole feed for desktop,
          // where the body doesn't fill the viewport.
          borderBottom: "1px solid var(--neutral-150)",
        }}
      >
        {/* Form title + description — hidden when a parent inspection header
            already shows location, scope, and inspector context. */}
        {!hideChrome && (
        <div
          style={{
            padding: "16px 20px 18px",
            borderTop: "3px solid var(--primary-600)",
            borderBottom: "1px solid var(--neutral-150)",
          }}
        >
          <h1
            style={{
              margin: "0 0 4px",
              fontSize: 19,
              fontWeight: 700,
              color: "var(--neutral-900)",
              lineHeight: 1.3,
            }}
          >
            {template.name.trim() || t("untitledForm")}
          </h1>
          {template.description.trim() && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--neutral-600)",
                lineHeight: 1.5,
              }}
            >
              {template.description}
            </p>
          )}
        </div>
        )}

        {/* Empty-form state — shown when every section is empty (or there
            are no sections at all). Most common when the author hits Preview
            on a fresh draft; we intentionally suppress the Submit button in
            this case (see below) so it doesn't look like a valid form. */}
        {visibleSections.length === 0 && <EmptyFormHint />}

        {/* Sections — iterates over the filtered `visibleSections` list so
            empty sections never render. Index + length labels ("Section 1
            of 2") are derived from the filtered list too, so numbering
            always matches what the inspector actually sees. */}
        {visibleSections.map((section, sectionIndex) => {
          const showHeader = !isBare;
          return (
            <div
              key={section.id}
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              {showHeader && (
                <div className="form-fill-section-header">
                  <div className="form-fill-section-header__counter">
                    {t("sectionCounter", { n: sectionIndex + 1, total: visibleSections.length })}
                  </div>
                  <h2 className="form-fill-section-header__title">
                    {section.title.trim() ||
                      t("sectionFallback", { n: sectionIndex + 1 })}
                  </h2>
                  {section.description?.trim() && (
                    <p className="form-fill-section-header__description">
                      {section.description}
                    </p>
                  )}
                </div>
              )}

              {section.questions.map((q, qIndex) => {
                // Highlight required questions that are still empty
                // AFTER the inspector has tried to submit. Before they
                // hit submit we stay quiet — the red "*" on the title
                // is already telling them which questions need an
                // answer.
                const unansweredRequiredError =
                  showValidation &&
                  q.required &&
                  !isQuestionAnswered(q, answers[q.id]);

                const followUpEntries = activeFollowUpEntries(q, answers[q.id]?.choice);

                return (
                  <Fragment key={q.id}>
                    <QuestionCard
                      question={q}
                      questionNumber={qIndex + 1}
                      answer={answers[q.id] ?? {}}
                      onChange={(patch) => updateAnswer(q.id, patch)}
                      showValidation={showValidation}
                      unansweredRequiredError={unansweredRequiredError}
                    />
                    {followUpEntries.map(({ trigger, followUp, payloadKey }) => {
                      const labelKey =
                        trigger === "yes"
                          ? "followUpOnYes"
                          : trigger === "no"
                            ? "followUpOnNo"
                            : trigger === "na"
                              ? "followUpOnNa"
                              : trigger === "pass"
                                ? "followUpOnPass"
                                : "followUpOnFail";
                      return (
                        <div
                          key={payloadKey}
                          style={{
                            paddingLeft: 16,
                            borderLeft: "3px solid var(--form-deficiency-border)",
                            marginLeft: 20,
                          }}
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "3px 10px",
                              marginBottom: 4,
                              marginLeft: 20,
                              backgroundColor: "var(--form-deficiency-bg)",
                              border: "none",
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 700,
                              color: "var(--form-deficiency-fg)",
                              letterSpacing: "var(--tracking-label)",
                              textTransform: "uppercase",
                            }}
                          >
                            {t(labelKey)}
                          </div>
                          <QuestionCard
                            question={followUp}
                            questionNumber={0}
                            answer={answers[payloadKey] ?? {}}
                            onChange={(patch) => updateAnswer(payloadKey, patch)}
                            showValidation={showValidation}
                            unansweredRequiredError={
                              showValidation &&
                              followUp.required &&
                              !isQuestionAnswered(followUp, answers[payloadKey])
                            }
                          />
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          );
        })}

        {/* ── Auto-appended Inspector Notes & Media section ──
            Always rendered in live/preview mode so inspectors can leave
            general notes or attach media for any submission regardless of
            what the form template contains. Never validated — fully optional. */}
        {!isReadonly && (
          <AutoNotesSection
            notes={answers[AUTO_NOTES_KEY]?.text ?? ""}
            capturedFiles={answers[AUTO_MEDIA_KEY]?.capturedFiles}
            onNotesChange={(text) => updateAnswer(AUTO_NOTES_KEY, { text })}
            onMediaChange={(capturedFiles) =>
              updateAnswer(AUTO_MEDIA_KEY, { capturedFiles })
            }
          />
        )}

        {/* ── Submit ──
            Band-style footer: full-width, flat, tight padding. Only
            rendered when the form actually has something to submit —
            suppressed on an empty-form preview so the UI doesn't look
            like a complete, submittable form when it isn't. Also fully
            suppressed in readonly mode: past submissions aren't
            editable and the button would be misleading. */}
        {visibleSections.length > 0 && !isReadonly && (
        <div
          style={{
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            backgroundColor: "#fff",
          }}
        >
          {/* Blocking-validation banner — live mode keeps this visible while
              submit is blocked; preview shows it briefly after a blocked tap. */}
          {isLive && submitBlocked && submitBlockedReason && !submitting && (
            <div
              role="alert"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                backgroundColor: "var(--error-50)",
                border: "1px solid var(--error-300)",
                color: "var(--error-700)",
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.45,
              }}
            >
              <span style={{ fontWeight: 700 }}>{t("submitBlockedBannerTitle")}:</span>{" "}
              {submitBlockedReason.charAt(0).toUpperCase() + submitBlockedReason.slice(1)}
            </div>
          )}
          {blockedMessage && (
            <div
              role="alert"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.45,
              }}
            >
              {blockedMessage}
            </div>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (isLive && submitBlocked)}
            aria-disabled={submitting || (isLive && submitBlocked) || undefined}
            title={submitBlockedReason}
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              border: "none",
              backgroundColor:
                submitBlocked || submitting
                  ? "var(--neutral-300)"
                  : "var(--primary-600)",
              color:
                submitBlocked || submitting ? "var(--neutral-500)" : "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor:
                submitBlocked || submitting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              boxShadow:
                submitBlocked || submitting
                  ? "none"
                  : "0 2px 6px rgba(37,99,235,0.25)",
              transition:
                "background-color 0.15s, color 0.15s, box-shadow 0.15s",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {submitting && (
              <Loader2
                size={15}
                aria-hidden
                style={{ animation: "spin 0.8s linear infinite" }}
              />
            )}
            {submitting ? t("saving") : (submitLabel ?? t("submit"))}
          </button>
          {mode === "preview" && (
            <p
              style={{
                margin: 0,
                textAlign: "center",
                fontSize: 11,
                color: "var(--neutral-400)",
              }}
            >
              {t("previewSubmitHint")}
            </p>
          )}
        </div>
        )}
      </div>

      {/* ── Submitted-in-preview toast ── */}
      {submittedNotice && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--neutral-900)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
            zIndex: 20,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Eye size={14} aria-hidden />
          {t("previewModeToast")}
        </div>
      )}
    </div>
  );
}

// ── Question card ────────────────────────────────────────────────────────────

/**
 * Small pill beneath a question title that tells the inspector what type of
 * answer is expected — e.g. "◉ Multiple choice · Select one option".
 * Purely informational; no interactivity.
 */
function QuestionTypeHint({ responseType }: { responseType: ResponseType }) {
  const t = useTranslations("forms.fill.typeHints");
  const meta = RESPONSE_META[responseType];

  // Keys align with ResponseType values
  const hintKey = responseType as Parameters<typeof t>[0];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        marginTop: 4,
        padding: "2px 8px 2px 6px",
        borderRadius: 99,
        backgroundColor: "var(--neutral-100)",
        border: "1px solid var(--neutral-200)",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--neutral-500)",
        lineHeight: 1.4,
        userSelect: "none",
      }}
    >
      <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>{meta.icon}</span>
      <span style={{ color: "var(--neutral-600)", fontWeight: 600 }}>{meta.label}</span>
      <span style={{ color: "var(--neutral-300)", fontWeight: 400, margin: "0 1px" }}>·</span>
      <span>{t(hintKey)}</span>
    </span>
  );
}

function QuestionCard({
  question,
  questionNumber,
  answer,
  onChange,
  showValidation,
  unansweredRequiredError,
}: {
  question: FormQuestion;
  questionNumber: number;
  answer: AnswerState;
  onChange: (patch: Partial<AnswerState>) => void;
  showValidation: boolean;
  /**
   * The question is marked required, is still unanswered, AND the
   * inspector has attempted to submit at least once. Paints a red
   * left border and an inline hint so the card becomes scannable
   * among otherwise-identical siblings.
   */
  unansweredRequiredError: boolean;
}) {
  const t = useTranslations("forms.fill");
  const title = question.title.trim() || t("questionPlaceholder", { n: questionNumber });

  return (
    <div
      style={{
        backgroundColor: "#fff",
        padding: "14px 20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        // Hairline below each question — bands stack seamlessly with
        // one thin line between so the feed reads as a continuous
        // list, not a stack of framed panels. The last question's
        // hairline still works because the Submit footer sits directly
        // below it with its own top border.
        borderBottom: "1px solid var(--neutral-150)",
        // Red bar on the left edge marks the band as "needs attention"
        // at a glance when the inspector scrolls back up after trying
        // to submit with empty required fields. Full-height 3 px strip
        // that tints the edge without shifting layout.
        borderLeft: unansweredRequiredError
          ? "3px solid #dc2626"
          : "3px solid transparent",
        transition: "border-color 0.15s",
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            color: "var(--neutral-900)",
            lineHeight: 1.4,
          }}
        >
          {title}
          {question.required && (
            <span
              aria-label="required"
              style={{
                color: "#dc2626",
                marginLeft: 4,
                fontWeight: 700,
              }}
            >
              *
            </span>
          )}
        </h3>
        {question.description?.trim() && (
          <p
            style={{
              margin: "5px 0 0",
              fontSize: 13,
              color: "var(--neutral-500)",
              lineHeight: 1.5,
            }}
          >
            {question.description}
          </p>
        )}
        {question.responseType !== "PASS_FAIL_DEFICIENCIES" && question.responseType !== "NUMBER" && (
          <div style={{ marginTop: question.description.trim() ? 6 : 4 }}>
            <QuestionTypeHint responseType={question.responseType} />
          </div>
        )}
        {unansweredRequiredError && (
          <p
            role="alert"
            style={{
              margin: "6px 0 0",
              fontSize: 12,
              fontWeight: 600,
              color: "#dc2626",
              lineHeight: 1.4,
            }}
          >
            {t("answerThisQuestion")}
          </p>
        )}
      </div>

      <AnswerControl
        question={question}
        answer={answer}
        onChange={onChange}
        showValidation={showValidation}
      />

      {question.photoRequired && (
        <QuestionPhotoRow
          capturedFiles={answer.capturedFiles}
          onChange={(capturedFiles) => onChange({ capturedFiles })}
        />
      )}

      {(question.commentsEnabled ?? false) && (
        <QuestionCommentRow
          value={answer.comment ?? ""}
          onChange={(comment) => onChange({ comment: comment.trim() ? comment : undefined })}
        />
      )}
    </div>
  );
}

// ── Answer controls per type ─────────────────────────────────────────────────

function AnswerControl({
  question,
  answer,
  onChange,
  showValidation,
}: {
  question: FormQuestion;
  answer: AnswerState;
  onChange: (patch: Partial<AnswerState>) => void;
  showValidation: boolean;
}) {
  const t = useTranslations("forms.fill");
  switch (question.responseType) {
    case "PASS_FAIL":
      return (
        <ChoiceButtons
          options={[
            { value: "pass", label: t("passLabel"), tone: "pass" },
            { value: "fail", label: t("failLabel"), tone: "fail" },
            { value: "na", label: t("naLabel"), tone: "na" },
          ]}
          value={answer.choice}
          onChange={(v) => onChange({ choice: v })}
        />
      );

    case "PASS_FAIL_DEFICIENCIES": {
      const isFail = answer.choice === "fail";
      return (
        <div className="form-pass-fail-branch">
          <ChoiceButtons
            options={[
              { value: "pass", label: t("passLabel"), tone: "pass" },
              { value: "fail", label: t("failLabel"), tone: "fail" },
              { value: "na", label: t("naLabel"), tone: "na" },
            ]}
            value={answer.choice}
            onChange={(v) => {
              // When the inspector marks "Fail" for the first time, scaffold a
              // blank deficiency so the capture UI has something tangible to
              // show — saves a tap and mirrors how most mobile inspection
              // apps handle this flow.
              if (v === "fail") {
                onChange({
                  choice: v,
                  deficiencies:
                    answer.deficiencies && answer.deficiencies.length > 0
                      ? answer.deficiencies
                      : [newDeficiency()],
                });
              } else {
                onChange({ choice: v });
              }
            }}
          />
          {isFail && (
            <DeficiencyCapture
              deficiencies={answer.deficiencies ?? []}
              onChange={(deficiencies) => onChange({ deficiencies })}
              showValidation={showValidation}
              descriptionEnabled={question.deficiencyDescriptionEnabled ?? true}
              photoRequired={question.deficiencyPhotoRequired ?? false}
              allowAdditionalEntries={allowsAdditionalDeficiencies(question)}
            />
          )}
        </div>
      );
    }

    case "YES_NO": {
      const yesNoOptions: Array<{ value: string; label: string; tone: "primary" | "no" | "na" }> = [
        { value: "yes", label: t("yesLabel"), tone: "primary" },
        { value: "no", label: t("noLabel"), tone: "no" },
      ];
      if (question.showNotApplicable) {
        yesNoOptions.push({ value: "na", label: t("naLabel"), tone: "na" });
      }
      return (
        <ChoiceButtons
          options={yesNoOptions}
          value={answer.choice}
          onChange={(v) => onChange({ choice: v })}
        />
      );
    }

    case "MULTIPLE_CHOICE":
      return (
        <RadioList
          options={question.options}
          value={answer.choice}
          onChange={(v) => onChange({ choice: v })}
        />
      );

    case "CHECKBOXES":
      return (
        <CheckboxList
          options={question.options}
          values={answer.choices ?? []}
          onChange={(choices) => onChange({ choices })}
        />
      );

    case "SHORT_ANSWER":
      return (
        <input
          type="text"
          placeholder={t("yourAnswer")}
          value={answer.text ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--neutral-250)",
            fontSize: 14,
            fontFamily: "inherit",
            color: "var(--neutral-900)",
            backgroundColor: "#fff",
          }}
        />
      );

    case "PARAGRAPH":
      return (
        <textarea
          placeholder={t("yourAnswer")}
          rows={4}
          value={answer.text ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--neutral-250)",
            fontSize: 14,
            fontFamily: "inherit",
            color: "var(--neutral-900)",
            backgroundColor: "#fff",
            resize: "vertical",
            minHeight: 88,
            lineHeight: 1.5,
          }}
        />
      );

    case "NUMBER":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--neutral-500)", fontWeight: 500 }}>
            Enter a number
          </span>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={answer.number ?? ""}
          onChange={(e) => onChange({ number: e.target.value })}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--neutral-250)",
            fontSize: 14,
            fontFamily: "inherit",
            color: "var(--neutral-900)",
            backgroundColor: "#fff",
          }}
        />
        </div>
      );

    case "RATING":
      return (
        <RatingStars
          value={answer.rating ?? 0}
          onChange={(rating) => onChange({ rating })}
        />
      );

    default:
      return null;
  }
}

// ── Reusable inputs ──────────────────────────────────────────────────────────

export function ChoiceButtons({
  options,
  value,
  onChange,
}: {
  options: {
    value: string;
    label: string;
    tone: "pass" | "fail" | "na" | "primary" | "no";
  }[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const colClass =
    options.length === 2
      ? "form-choice-buttons--cols-2"
      : options.length === 3
        ? "form-choice-buttons--cols-3"
        : "";
  return (
    <div className={`form-choice-buttons ${colClass}`.trim()}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`form-choice-btn form-choice-btn--${opt.tone}${active ? " is-active" : ""}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function RadioList({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  if (options.length === 0) {
    return <EmptyOptionsHint />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((opt, i) => {
        const selected = value === opt;
        return (
          <button
            key={`${opt}-${i}`}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 10,
              border: selected
                ? "1.5px solid var(--primary-600)"
                : "1px solid var(--neutral-200)",
              backgroundColor: selected
                ? "var(--primary-50, #eff6ff)"
                : "#fff",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              fontSize: 14,
              color: "var(--neutral-800)",
              minHeight: 44,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: selected
                  ? "5px solid var(--primary-600)"
                  : "1.5px solid var(--neutral-350, #cbd5e1)",
                backgroundColor: "#fff",
                flexShrink: 0,
                transition: "border 0.12s",
              }}
            />
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function CheckboxList({
  options,
  values,
  onChange,
}: {
  options: string[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  if (options.length === 0) {
    return <EmptyOptionsHint />;
  }
  function toggle(opt: string) {
    if (values.includes(opt)) {
      onChange(values.filter((v) => v !== opt));
    } else {
      onChange([...values, opt]);
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {options.map((opt, i) => {
        const checked = values.includes(opt);
        return (
          <button
            key={`${opt}-${i}`}
            type="button"
            onClick={() => toggle(opt)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 10,
              border: checked
                ? "1.5px solid var(--primary-600)"
                : "1px solid var(--neutral-200)",
              backgroundColor: checked
                ? "var(--primary-50, #eff6ff)"
                : "#fff",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              fontSize: 14,
              color: "var(--neutral-800)",
              minHeight: 44,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: checked
                  ? "1.5px solid var(--primary-600)"
                  : "1.5px solid var(--neutral-350, #cbd5e1)",
                backgroundColor: checked ? "var(--primary-600)" : "#fff",
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {checked ? "✓" : ""}
            </span>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function RatingStars({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const t = useTranslations("forms.fill");
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        return (
          <button
            key={n}
            type="button"
            aria-label={t("starRating", { count: n })}
            onClick={() => onChange(n === value ? 0 : n)}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: 4,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Star
              size={30}
              fill={active ? "#f59e0b" : "transparent"}
              color={active ? "#f59e0b" : "var(--neutral-350, #cbd5e1)"}
              strokeWidth={1.5}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

// ── Deficiency capture ───────────────────────────────────────────────────────
//
// Fully flat layout — NO wrapping container, NO tinted callout, NO frame.
// The previous design tinted an amber "box" that sat inside the question
// card, which read as a frame-inside-a-frame on mobile and ate horizontal
// width for its own padding. This version lets deficiency content flow
// directly inside the question card the way Pass/Fail/N/A does above it.
//
// Visual grouping is now handled entirely by:
//   - a single thin amber hairline that links the Fail button to the
//     deficiency content below (one transition cue, no box)
//   - amber accent color on the "Deficiency N" labels, pill borders,
//     and the "Pick a severity" required-state hint
//   - 1 px amber hairlines between multiple entries, instead of tinted
//     cards around each one
//
// Net result: zero nested padded containers, same semantic grouping,
// measurably more content width on narrow screens. See
// `docs/design/MOBILE_DENSITY.md` rule 7 for the underlying principle.

export function DeficiencyCapture({
  deficiencies,
  onChange,
  showValidation,
  descriptionEnabled,
  photoRequired = false,
  allowAdditionalEntries = false,
}: {
  deficiencies: Deficiency[];
  onChange: (next: Deficiency[]) => void;
  showValidation: boolean;
  descriptionEnabled: boolean;
  photoRequired?: boolean;
  /** When false, hides "Add another deficiency" and prevents removing rows. Defaults off (opt-in). */
  allowAdditionalEntries?: boolean;
}) {
  const t = useTranslations("forms.fill");
  function updateOne(id: string, patch: Partial<Deficiency>) {
    onChange(deficiencies.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function removeOne(id: string) {
    onChange(deficiencies.filter((d) => d.id !== id));
  }
  function addOne() {
    onChange([...deficiencies, newDeficiency()]);
  }

  const missingDesc = false;
  const missingSev = deficiencies.some((d) => !d.severity);
  const missingPhoto = photoRequired && deficiencies.some((d) => !(d.capturedFiles?.length));
  const hasIncomplete = missingSev || missingPhoto;
  const incompleteReason = (() => {
    const parts: string[] = [];
    if (missingSev) parts.push(t("submitBlockedDefSeverity"));
    if (missingPhoto) parts.push(t("submitBlockedDefPhoto"));
    if (parts.length === 0) return undefined;
    const list =
      parts.length === 1
        ? parts[0]
        : parts.length === 2
          ? `${parts[0]}${t("submitBlockedConnector")}${parts[1]}`
          : `${parts.slice(0, -1).join(", ")}, ${t("submitBlockedConnector").trim()}${parts[parts.length - 1]}`;
    return t("addDeficiencyIncompleteHint", { what: list });
  })();
  const multiple = deficiencies.length > 1;

  return (
    <div className="form-deficiency-capture">
      <div aria-hidden className="form-deficiency-capture__hairline" />

      <p className="form-deficiency-capture__intro">
        {t("documentDeficienciesIntro")}
      </p>

      {deficiencies.map((d, idx) => (
        <DeficiencyEntry
          key={d.id}
          index={idx + 1}
          deficiency={d}
          showLabel={multiple}
          canRemove={allowAdditionalEntries && multiple}
          isFirst={idx === 0}
          onChange={(patch) => updateOne(d.id, patch)}
          onRemove={() => removeOne(d.id)}
          showValidation={showValidation}
          descriptionEnabled={descriptionEnabled}
          photoRequired={photoRequired}
        />
      ))}

      {allowAdditionalEntries && (
        <button
          type="button"
          onClick={addOne}
          disabled={hasIncomplete}
          aria-disabled={hasIncomplete}
          title={hasIncomplete ? incompleteReason : undefined}
          className="form-deficiency-add-btn"
        >
          <Plus size={13} aria-hidden />
          {t("addAnotherDeficiency")}
        </button>
      )}
    </div>
  );
}

/**
 * One deficiency — renders flush inside the question card with no
 * wrapping padded container of its own. Entries after the first get
 * a 1 px amber top border as a separator; the first entry has none,
 * because the DeficiencyCapture's amber hairline above already serves
 * that role. The "Deficiency N" label + remove button only appear when
 * there are multiple entries — a single-deficiency case doesn't need
 * positional context and the textarea placeholder provides the framing.
 */
function DeficiencyEntry({
  index,
  deficiency,
  showLabel,
  canRemove,
  isFirst,
  onChange,
  onRemove,
  showValidation,
  descriptionEnabled,
  photoRequired = false,
}: {
  index: number;
  deficiency: Deficiency;
  /** Whether to render the "DEFICIENCY N" label — true only when 2+ exist. */
  showLabel: boolean;
  canRemove: boolean;
  /** First entry skips the top separator — the section hairline already handles it. */
  isFirst: boolean;
  onChange: (patch: Partial<Deficiency>) => void;
  onRemove: () => void;
  showValidation: boolean;
  /** When false, hides the free-text description field (for pre-defined categories). */
  descriptionEnabled: boolean;
  /** When false, a photo is optional and missing one won't block submission. */
  photoRequired?: boolean;
}) {
  const t = useTranslations("forms.fill");
  const descriptionId = useId();
  const descriptionHintId = `${descriptionId}-hint`;
  const [showCamera, setShowCamera] = useState(false);
  const [countText, setCountText] = useState(String(deficiency.count ?? 1));
  const hasContent = descriptionEnabled ? deficiency.description.trim().length > 0 : true;
  const hasSeverity = Boolean(deficiency.severity);
  const hasPhoto = Boolean(deficiency.capturedFiles?.length);
  const severityMissing = !hasSeverity;
  const descriptionMissing = false;
  const photoMissing = photoRequired && !hasPhoto;
  const descriptionHighlighted = false;
  const severityError = severityMissing && (hasContent || showValidation);
  const descriptionError = false;
  const photoError =
    photoMissing && (hasContent || hasSeverity || showValidation);

  function setCount(next: number) {
    const wholeNumber = Math.max(1, Math.trunc(next));
    setCountText(String(wholeNumber));
    onChange({ count: wholeNumber });
  }

  function handleCountChange(rawValue: string) {
    const digitsOnly = rawValue.replace(/\D/g, "");
    setCountText(digitsOnly);
    if (digitsOnly.length === 0) return;
    setCount(Number(digitsOnly));
  }

  function commitCount() {
    if (countText.length === 0) {
      setCount(1);
      return;
    }
    setCount(Number(countText));
  }

  return (
    <div
      className={`form-deficiency-entry${isFirst ? "" : " form-deficiency-entry--separated"}`}
    >
      {showLabel && (
        <div className="form-deficiency-entry__head">
          <span className="form-deficiency-entry__label">
            {t("deficiencyLabel", { n: index })}
          </span>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={t("removeDeficiency")}
              className="form-deficiency-entry__remove"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      )}

      {descriptionEnabled && (
        <div className="form-deficiency-field">
          <label htmlFor={descriptionId} className="form-deficiency-field-label">
            {t("deficiencyDescOptionalLabel")}
            <span style={{ fontWeight: 500, color: "var(--neutral-400)", marginLeft: 4 }}>
              ({t("autoSectionOptional")})
            </span>
          </label>
          <textarea
            id={descriptionId}
            placeholder={t("deficiencyDescPlaceholder")}
            rows={2}
            value={deficiency.description}
            onChange={(e) => onChange({ description: e.target.value })}
            className="form-deficiency-textarea"
          />
        </div>
      )}

      <div className="form-deficiency-field">
        <span className="form-deficiency-field-label">
          {t("deficiencyCountLabel")}
        </span>
        <div className="form-deficiency-count-stepper">
          <button
            type="button"
            aria-label="Decrease count"
            onClick={() => setCount((deficiency.count ?? 1) - 1)}
            disabled={(deficiency.count ?? 1) <= 1}
            className="form-deficiency-count-stepper__btn"
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={t("deficiencyCountLabel")}
            value={countText}
            onChange={(e) => handleCountChange(e.target.value)}
            onBlur={commitCount}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: 48,
              height: 34,
              border: "1px solid #fed7aa",
              backgroundColor: "#fff",
              fontSize: 15,
              fontWeight: 700,
              color: "#9a3412",
              fontVariantNumeric: "tabular-nums",
              textAlign: "center",
              fontFamily: "inherit",
              outline: "none",
              appearance: "textfield",
              padding: 0,
            }}
          />
          <button
            type="button"
            aria-label="Increase count"
            onClick={() => setCount((deficiency.count ?? 1) + 1)}
            style={{
              width: 34,
              height: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #fed7aa",
              borderLeft: "none",
              borderRadius: "0 6px 6px 0",
              background: "#fff",
              color: "#9a3412",
              fontSize: 18,
              fontWeight: 400,
              cursor: "pointer",
              fontFamily: "inherit",
              lineHeight: 1,
            }}
          >
            +
          </button>
        </div>
      </div>

      <div className="form-deficiency-field">
        {severityMissing && (
          <span
            className={`form-deficiency-hint${severityError ? " form-deficiency-hint--error" : " form-deficiency-hint--accent"}`}
          >
            {severityError
              ? t("pickSeverityToContinue")
              : t("pickSeverity")}
          </span>
        )}
        <div className="form-deficiency-severity-row">
          {DEFICIENCY_SEVERITIES.map((s) => {
            const active = deficiency.severity === s;
            const mod = deficiencySeverityModifier(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() =>
                  onChange({ severity: s as DeficiencySeverity })
                }
                className={`form-deficiency-severity-btn form-deficiency-severity-btn--${mod}${active ? ` is-selected--${mod}` : ""}${severityError && !active ? " is-error" : ""}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="form-deficiency-media">
        {photoMissing && (
          <span
            className={`form-deficiency-hint${photoError ? " form-deficiency-hint--error" : " form-deficiency-hint--accent"}`}
          >
            {photoError ? t("addPhotoToContinue") : t("addPhoto")}
          </span>
        )}

        {(deficiency.capturedFiles?.length ?? 0) > 0 && (
          <AnnotatableThumbStrip
            files={deficiency.capturedFiles!}
            onRemove={(i) => {
              const next = deficiency.capturedFiles!.filter((_, idx) => idx !== i);
              onChange({ capturedFiles: next.length ? next : undefined });
            }}
            onReplace={(i, updated) => {
              const next = deficiency.capturedFiles!.map((f, idx) =>
                idx === i ? updated : f,
              );
              onChange({ capturedFiles: next });
            }}
          />
        )}

        <PhotoRow
          captured={hasPhoto}
          onOpen={() => setShowCamera(true)}
          error={photoError}
          inline
        />
      </div>

      {showCamera && (
        <CameraCapture
          maxItems={MAX_PHOTOS_PER_CAPTURE_SESSION}
          onCapture={(captured: CapturedFile[]) => {
            const items: CapturedMediaItem[] = captured.map((c) => ({
              localUrl: c.localUrl,
              mimeType: c.mimeType,
              file: c.file,
            }));
            onChange({
              capturedFiles: [...(deficiency.capturedFiles ?? []), ...items],
            });
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

// ── Photo / media controls ────────────────────────────────────────────────────

/** "Add media" button — opens CameraCapture overlay when clicked. */
function PhotoRow({
  captured,
  onOpen,
  compact,
  inline,
  error,
}: {
  captured: boolean;
  onOpen: () => void;
  compact?: boolean;
  inline?: boolean;
  error?: boolean;
}) {
  const t = useTranslations("forms.fill");
  const button = (
    <button
      type="button"
      onClick={onOpen}
      aria-invalid={error || undefined}
      className={`form-deficiency-photo-btn${captured ? " is-captured" : ""}${error ? " is-error" : ""}`}
    >
      <Camera size={12} aria-hidden />
      {captured ? t("addMoreMedia") : t("addPhotoButton")}
    </button>
  );

  if (inline) return button;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: compact ? "6px 0 0" : "8px 0 0",
      }}
    >
      {button}
    </div>
  );
}

/** Thumbnail for a single captured media item with remove and (for images) annotate buttons. */
function MediaThumb({
  item,
  onRemove,
  onAnnotate,
}: {
  item: CapturedMediaItem;
  onRemove: () => void;
  /** If provided, an annotate button is shown on image thumbnails. */
  onAnnotate?: () => void;
}) {
  const isVideo = item.mimeType.startsWith("video/");
  const isAudio = item.mimeType.startsWith("audio/");
  const isImage = !isVideo && !isAudio;
  return (
    <div
      style={{
        position: "relative",
        width: 64,
        height: 64,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--neutral-200)",
        flexShrink: 0,
        backgroundColor: "#f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isAudio ? (
        <Mic size={22} color="var(--neutral-500)" aria-hidden />
      ) : isVideo ? (
        <>
          <video
            src={item.localUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            muted
            playsInline
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.25)",
            }}
          >
            <Play size={18} color="#fff" aria-hidden />
          </div>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.localUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}

      {/* Annotate button — images only, bottom-left */}
      {isImage && onAnnotate && (
        <button
          type="button"
          onClick={onAnnotate}
          aria-label="Annotate image"
          style={{
            position: "absolute",
            bottom: 3,
            left: 3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: "none",
            backgroundColor: "rgba(0,0,0,0.55)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          <Pencil size={9} aria-hidden />
        </button>
      )}

      {/* Remove button — top-right */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove media"
        style={{
          position: "absolute",
          top: 3,
          right: 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "none",
          backgroundColor: "rgba(0,0,0,0.55)",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        <X size={10} aria-hidden />
      </button>
    </div>
  );
}

// ── Annotatable thumbnail strip ───────────────────────────────────────────────

/**
 * Renders a row of media thumbnails where image items can be tapped to open
 * the annotation editor. Manages its own editor state so callers just provide
 * the files array plus remove/replace callbacks.
 */
export function AnnotatableThumbStrip({
  files,
  onRemove,
  onReplace,
}: {
  files: CapturedMediaItem[];
  onRemove: (index: number) => void;
  onReplace: (index: number, updated: CapturedMediaItem) => void;
}) {
  const [annotatingIndex, setAnnotatingIndex] = useState<number | null>(null);
  const annotatingItem =
    annotatingIndex !== null ? files[annotatingIndex] : null;

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {files.map((item, i) => (
          <MediaThumb
            key={i}
            item={item}
            onRemove={() => onRemove(i)}
            onAnnotate={
              item.mimeType.startsWith("image/")
                ? () => setAnnotatingIndex(i)
                : undefined
            }
          />
        ))}
      </div>

      {annotatingItem && (
        <ImageAnnotationEditor
          src={annotatingItem.localUrl}
          onSave={(result) => {
            if (isFlattenAnnotationSave(result)) {
              onReplace(annotatingIndex!, {
                localUrl: result.localUrl,
                mimeType: "image/jpeg",
                file: new File([result.blob], "annotated.jpg", {
                  type: "image/jpeg",
                }),
              });
            }
            setAnnotatingIndex(null);
          }}
          onClose={() => setAnnotatingIndex(null)}
        />
      )}
    </>
  );
}

/**
 * Optional inspector comment — never blocks submission.
 */
function QuestionCommentRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslations("forms.fill");
  const inputId = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 8 }}>
      <label
        htmlFor={inputId}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--neutral-600)",
        }}
      >
        {t("questionCommentLabel")}
        <span style={{ fontWeight: 500, color: "var(--neutral-400)", marginLeft: 4 }}>
          ({t("autoSectionOptional")})
        </span>
      </label>
      <textarea
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("questionCommentPlaceholder")}
        rows={2}
        style={{
          width: "100%",
          resize: "vertical",
          minHeight: 56,
          padding: "8px 10px",
          fontSize: 14,
          lineHeight: 1.4,
          borderRadius: 8,
          border: "1px solid var(--neutral-200)",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

/**
 * Photo/media row for question-level `photoRequired` — manages its own
 * camera state and thumbnail strip.
 */
function QuestionPhotoRow({
  capturedFiles,
  onChange,
}: {
  capturedFiles?: CapturedMediaItem[];
  onChange: (files: CapturedMediaItem[] | undefined) => void;
}) {
  const [showCamera, setShowCamera] = useState(false);
  const captured = Boolean(capturedFiles?.length);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
      {captured && (
        <AnnotatableThumbStrip
          files={capturedFiles!}
          onRemove={(i) => {
            const next = capturedFiles!.filter((_, idx) => idx !== i);
            onChange(next.length ? next : undefined);
          }}
          onReplace={(i, updated) => {
            onChange(capturedFiles!.map((f, idx) => (idx === i ? updated : f)));
          }}
        />
      )}
      <PhotoRow
        captured={captured}
        onOpen={() => setShowCamera(true)}
      />
      {showCamera && (
        <CameraCapture
          maxItems={MAX_PHOTOS_PER_CAPTURE_SESSION}
          onCapture={(files: CapturedFile[]) => {
            const items: CapturedMediaItem[] = files.map((f) => ({
              localUrl: f.localUrl,
              mimeType: f.mimeType,
              file: f.file,
            }));
            onChange([...(capturedFiles ?? []), ...items]);
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

// ── Empty states ─────────────────────────────────────────────────────────────

function EmptyOptionsHint() {
  const t = useTranslations("forms.fill");
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px dashed var(--neutral-300)",
        backgroundColor: "var(--neutral-50, #fafafa)",
        fontSize: 12,
        color: "var(--neutral-500)",
      }}
    >
      {t("noOptionsDefined")}
    </div>
  );
}

/**
 * Empty-state shown when the entire form has zero non-empty sections.
 *
 * Intentionally gentle: forms with no questions almost always mean the
 * author hit "Preview" too early on a brand-new draft, not that a real
 * inspector is staring at a broken published form. We don't render the
 * Submit button in this case — a form with no questions has nothing to
 * submit.
 */
// ── Auto-appended Inspector Notes & Media section ────────────────────────────

/**
 * Always rendered at the bottom of every form in live/preview mode.
 * Gives inspectors a place to add general notes and attach media regardless
 * of what questions the form template contains. Entirely optional — no
 * validation is run against these fields.
 */
export function AutoNotesSection({
  notes,
  capturedFiles,
  onNotesChange,
  onMediaChange,
}: {
  notes: string;
  capturedFiles?: CapturedMediaItem[];
  onNotesChange: (text: string) => void;
  onMediaChange: (files: CapturedMediaItem[] | undefined) => void;
}) {
  const t = useTranslations("forms.fill");
  const [showCamera, setShowCamera] = useState(false);
  const hasMedia = Boolean(capturedFiles?.length);

  return (
    <div>
      {/* Section header — visually matches the regular section band */}
      <div className="form-fill-section-header">
        <div className="form-fill-section-header__counter">
          {t("autoSectionBadge")}
        </div>
        <h2 className="form-fill-section-header__title">
          {t("autoSectionTitle")}
        </h2>
      </div>

      {/* Notes text area */}
      <div style={{ padding: "14px 14px 0" }}>
        <label
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--neutral-700)",
            marginBottom: 6,
          }}
        >
          {t("autoSectionNotesLabel")}
          <span
            style={{
              marginLeft: 6,
              fontSize: 11,
              fontWeight: 400,
              color: "var(--neutral-400)",
            }}
          >
            {t("autoSectionOptional")}
          </span>
        </label>
        <textarea
          placeholder={t("autoSectionNotesPlaceholder")}
          rows={3}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--neutral-250)",
            fontSize: 14,
            fontFamily: "inherit",
            color: "var(--neutral-900)",
            backgroundColor: "#fff",
            resize: "vertical",
            minHeight: 72,
            lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Media capture */}
      <div style={{ padding: "10px 14px 16px" }}>
        <label
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--neutral-700)",
            marginBottom: 8,
          }}
        >
          {t("autoSectionMediaLabel")}
          <span
            style={{
              marginLeft: 6,
              fontSize: 11,
              fontWeight: 400,
              color: "var(--neutral-400)",
            }}
          >
            {t("autoSectionOptional")}
          </span>
        </label>

        {/* Captured thumbnails */}
        {hasMedia && (
          <div style={{ marginBottom: 8 }}>
            <AnnotatableThumbStrip
              files={capturedFiles!}
              onRemove={(i) => {
                const next = capturedFiles!.filter((_, idx) => idx !== i);
                onMediaChange(next.length ? next : undefined);
              }}
              onReplace={(i, updated) => {
                onMediaChange(capturedFiles!.map((f, idx) => (idx === i ? updated : f)));
              }}
            />
          </div>
        )}

        <PhotoRow
          captured={hasMedia}
          onOpen={() => setShowCamera(true)}
        />
      </div>

      {showCamera && (
        <CameraCapture
          maxItems={MAX_PHOTOS_PER_CAPTURE_SESSION}
          onCapture={(items: CapturedFile[]) => {
            const mapped: CapturedMediaItem[] = items.map((f) => ({
              localUrl: f.localUrl,
              mimeType: f.mimeType,
              file: f.file,
            }));
            onMediaChange([...(capturedFiles ?? []), ...mapped]);
            setShowCamera(false);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

// ── Empty-form hint ───────────────────────────────────────────────────────────

function EmptyFormHint() {
  const t = useTranslations("forms.fill");
  return (
    <div
      style={{
        padding: "28px 20px",
        borderRadius: 12,
        border: "1px dashed var(--neutral-300)",
        backgroundColor: "#fff",
        textAlign: "center",
        fontSize: 13,
        color: "var(--neutral-500)",
        lineHeight: 1.5,
      }}
    >
      <strong
        style={{
          display: "block",
          marginBottom: 6,
          color: "var(--neutral-700)",
          fontSize: 14,
        }}
      >
        {t("emptyFormTitle")}
      </strong>
      {t("emptyFormBody")}
    </div>
  );
}
