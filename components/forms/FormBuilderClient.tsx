"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, Eye, Plus, Rows3, Save, Settings2 } from "lucide-react";
import type {
  FormTemplate,
  FormQuestion,
  FormSection,
} from "./formTypes";
import {
  INSPECTION_CATEGORY_LABELS,
  normalizeFormPurpose,
  type FormPurpose,
} from "./formTypes";
import {
  responseTypesForPurpose,
  validateDocumentationFormForPublish,
} from "@/lib/forms/form-purpose-rules";
import { FormSectionBlock } from "./FormSectionBlock";
import { FormQuestionRow } from "./FormQuestionRow";
import { FormFillClient } from "./FormFillClient";
import { useSortableList } from "./useSortableList";
import { saveFormDraft, publishForm, unpublishForm, saveFormVersion, saveFormSetup, getForm } from "@/lib/forms/formsApi";
import { getChoiceFollowUps } from "@/lib/forms/choice-follow-ups";
import { normalizeGypcreteFormSetup } from "@/lib/inspections/gypcrete-form-rules";
import { FormSetupModal, type FormSetupValues } from "./FormSetupModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function newQuestion(formPurpose: FormPurpose = "inspection"): FormQuestion {
  return {
    id: uid(),
    title: "",
    description: "",
    responseType:
      formPurpose === "documentation" ? "YES_NO" : "PASS_FAIL_DEFICIENCIES",
    required: true,
    photoRequired: false,
    deficiencyPhotoRequired: false,
    allowAdditionalDeficiencies: false,
    options: [],
  };
}

function newSection(title = ""): FormSection {
  return {
    id: uid(),
    title,
    questions: [],
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

interface QuestionError {
  questionId: string;
  messages: string[];
}

interface FormValidationResult {
  valid: boolean;
  /** Errors not tied to a specific question (e.g. no questions at all) */
  formErrors: string[];
  questionErrors: QuestionError[];
}

function validateFormForPublish(form: FormTemplate): FormValidationResult {
  const formErrors: string[] = [];
  const questionErrors: QuestionError[] = [];

  if (!form.name.trim()) {
    formErrors.push("Form name is required before publishing.");
  }

  const docErrorKey = validateDocumentationFormForPublish(form);
  if (docErrorKey) {
    formErrors.push(docErrorKey);
  }

  const allQuestions = form.sections.flatMap((s) => s.questions);

  if (allQuestions.length === 0) {
    formErrors.push("Add at least one question before publishing.");
  }

  for (const q of allQuestions) {
    const msgs: string[] = [];
    if (!q.title.trim()) {
      msgs.push("Question text is required.");
    }
    if (
      (q.responseType === "MULTIPLE_CHOICE" || q.responseType === "CHECKBOXES") &&
      q.options.filter((o) => o.trim()).length < 2
    ) {
      msgs.push("Add at least 2 answer options.");
    }
    for (const followUp of Object.values(getChoiceFollowUps(q))) {
      if (followUp && !followUp.title.trim()) {
        msgs.push("Follow-up question text is required when enabled.");
      }
    }
    if (msgs.length > 0) {
      questionErrors.push({ questionId: q.id, messages: msgs });
    }
  }

  return {
    valid: formErrors.length === 0 && questionErrors.length === 0,
    formErrors,
    questionErrors,
  };
}

// Every form starts with one blank section containing one empty question —
// so the builder lands with something to type into immediately, the way
// Google Forms does. The user never sees the section wrapper until they
// explicitly click "Add section" (see `isBareMode` below).
function makeEmptyForm(): FormTemplate {
  return {
    id: null,
    name: "",
    description: "",
    status: "draft",
    // Scope-level is the common case — most inspections target a
    // specific trade's scope. Unit-level (gypcrete-style) forms are
    // the exception and the author flips the toggle when needed.
    level: "scope",
    // Empty until the author tags the form in the metadata band. An
    // empty array means the form won't surface in any scope's picker,
    // which is the right default — nothing slips into inspectors'
    // pickers half-finished.
    scopeTypeCodes: [],
    category: "OTHER",
    formPurpose: "inspection",
    sections: [
      {
        id: uid(),
        title: "",
        questions: [newQuestion("inspection")],
      },
    ],
  };
}

/**
 * "Bare mode" = a form with exactly one section that has no title. In this
 * mode the section wrapper is not rendered — the user just sees a flat list
 * of questions, which is the common case and matches Google Forms' landing
 * experience. The moment a user either (a) clicks "Add section", or (b)
 * types a title into the solo section, we exit bare mode and section
 * headers become visible dividers between question groups.
 */
function isBareMode(f: FormTemplate): boolean {
  return f.sections.length === 1 && f.sections[0].title.trim() === "";
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "draft" | "published" }) {
  const tForms = useTranslations("forms");
  const isDraft = status === "draft";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "3px 9px",
        borderRadius: 20,
        backgroundColor: isDraft ? "var(--neutral-100)" : "var(--success-100, #dcfce7)",
        color: isDraft ? "var(--neutral-500)" : "var(--success-700, #15803d)",
        border: isDraft ? "1px solid var(--neutral-200)" : "1px solid var(--success-200, #bbf7d0)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: isDraft ? "var(--neutral-400)" : "var(--success-500, #22c55e)",
          flexShrink: 0,
        }}
      />
      {isDraft ? tForms("draft") : tForms("published")}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface FormBuilderClientProps {
  /** DB id of the form to load. Required — forms always live in the DB now. */
  formId: string;
  /**
   * When true the form is in "published edit mode": auto-save is disabled,
   * a warning banner is shown, and the save button creates a new version
   * instead of saving a draft.
   */
  isPublishedEditMode?: boolean;
}

/** Shape of a row returned by /api/lookups → canonicalScopeTypes. */
interface ScopeTypeOption {
  id: string;
  code: string;
  displayName: string;
}

export default function FormBuilderClient({ formId, isPublishedEditMode = false }: FormBuilderClientProps) {
  const router = useRouter();
  const t = useTranslations("forms.builder");
  const [form, setForm] = useState<FormTemplate>(() => makeEmptyForm());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saved, setSaved] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [scopeTypeOptions, setScopeTypeOptions] = useState<ScopeTypeOption[]>([]);
  /** Question ids that failed validation on the last publish attempt. */
  const [invalidQuestionIds, setInvalidQuestionIds] = useState<Set<string>>(new Set());
  /** Per-question error messages keyed by question id. */
  const [questionErrorMessages, setQuestionErrorMessages] = useState<Map<string, string[]>>(new Map());
  /** Form-level errors (e.g. "no questions"). Shown in the publish button area. */
  const [formValidationErrors, setFormValidationErrors] = useState<string[]>([]);

  // Load form from API on mount
  useEffect(() => {
    let cancelled = false;
    getForm(formId)
      .then((stored) => {
        if (cancelled) return;
        if (stored) {
          setForm(stored.template);
          setLoadState("ready");
        } else {
          setLoadState("error");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => { cancelled = true; };
  }, [formId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/lookups");
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { canonicalScopeTypes?: ScopeTypeOption[] };
        if (!cancelled) setScopeTypeOptions(data.canonicalScopeTypes ?? []);
      } catch {
        if (!cancelled) setScopeTypeOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Setup modal state — re-opened when the author taps "Edit setup"
  // on the pinned summary strip. Submitting merges the new values
  // back into form state (clearing scopeTypeCodes if level flips
  // to unit, which the modal already handles in its local state).
  const [setupOpen, setSetupOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  /**
   * Tracks whether there are unsynced changes. Separate from `saved` so we
   * can debounce autosave writes without the "Saved" label flickering off
   * the moment the user types a keystroke.
   */
  const dirtyRef = useRef(false);

  function markDirty() {
    dirtyRef.current = true;
    setSaved(false);
  }

  /**
   * Autosave (drafts only): when dirty and NOT in published-edit mode,
   * persist to the API after a 600ms debounce.
   */
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (isPublishedEditMode) return; // no auto-save in edit mode
    if (loadState !== "ready") return;
    const timer = setTimeout(() => {
      saveFormDraft(formId, form)
        .then(() => {
          dirtyRef.current = false;
          setSaved(true);
        })
        .catch((err) => console.warn("[FormBuilderClient] autosave failed", err));
    }, 600);
    return () => clearTimeout(timer);
  }, [form, formId, isPublishedEditMode, loadState]);

  function updateForm(partial: Partial<FormTemplate>) {
    setForm((f) => ({ ...f, ...partial }));
    markDirty();
  }

  const bare = isBareMode(form);
  const allowedResponseTypes = useMemo(
    () => responseTypesForPurpose(normalizeFormPurpose(form.formPurpose)),
    [form.formPurpose],
  );

  // ── Section operations ──────────────────────────────────────────────────

  /**
   * "Add section" from bare mode surfaces the existing hidden section as
   * "Section 1" — one click = one section, as expected. Subsequent clicks
   * append further sections. Previously this also appended a Section 2 on
   * the first click, producing two sections from a single action.
   */
  function addSection() {
    setForm((f) => {
      if (isBareMode(f)) {
        // Just make the existing section visible — don't add a second one.
        return {
          ...f,
          sections: f.sections.map((s, i) =>
            i === 0 ? { ...s, title: t("sectionLabel", { n: 1 }) } : s
          ),
        };
      }
      // Already in sectioned mode — append a new section.
      const nextNumber = f.sections.length + 1;
      return {
        ...f,
        sections: [...f.sections, newSection(t("sectionLabel", { n: nextNumber }))],
      };
    });
    markDirty();
  }

  function insertSectionBefore(index: number) {
    setForm((f) => {
      const next = [...f.sections];
      next.splice(index, 0, newSection(t("sectionLabel", { n: index + 1 })));
      return { ...f, sections: next };
    });
    markDirty();
  }

  /**
   * Add a question outside all named sections — implemented as an untitled
   * "preamble" section at index 0. If one already exists (title === ""),
   * append a question to it; otherwise splice a new untitled section in first.
   */
  function addPreambleQuestion() {
    setForm((f) => {
      const hasPreamble = f.sections.length > 0 && f.sections[0].title.trim() === "";
      if (hasPreamble) {
        const updated = f.sections.map((s, i) =>
          i === 0 ? { ...s, questions: [...s.questions, newQuestion(normalizeFormPurpose(f.formPurpose))] } : s,
        );
        return { ...f, sections: updated };
      }
      const preamble: FormSection = {
        ...newSection(""),
        questions: [newQuestion(normalizeFormPurpose(f.formPurpose))],
      };
      return { ...f, sections: [preamble, ...f.sections] };
    });
    markDirty();
  }

  const updateSectionTitle = useCallback((sectionId: string, title: string) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)),
    }));
    markDirty();
  }, []);

  const updateSectionDescription = useCallback((sectionId: string, description: string) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s) => (s.id === sectionId ? { ...s, description } : s)),
    }));
    markDirty();
  }, []);

  const updateSectionQuestions = useCallback(
    (sectionId: string, questions: FormQuestion[]) => {
      setForm((f) => ({
        ...f,
        sections: f.sections.map((s) =>
          s.id === sectionId ? { ...s, questions } : s,
        ),
      }));
      markDirty();
    },
    [],
  );

  const addQuestionToSection = useCallback((sectionId: string) => {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s) =>
        s.id === sectionId
          ? { ...s, questions: [...s.questions, newQuestion(normalizeFormPurpose(f.formPurpose))] }
          : s,
      ),
    }));
    markDirty();
  }, []);

  function moveSection(fromIndex: number, toIndex: number) {
    setForm((f) => {
      if (
        toIndex < 0 ||
        toIndex >= f.sections.length ||
        fromIndex === toIndex
      ) {
        return f;
      }
      const next = [...f.sections];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...f, sections: next };
    });
    markDirty();
  }

  function deleteSection(sectionId: string) {
    setForm((f) => {
      const remaining = f.sections.filter((s) => s.id !== sectionId);
      if (remaining.length === 0) {
        // Deleting the last section — revert to bare mode with an empty
        // untitled section so the builder always has a canvas for questions.
        return { ...f, sections: [newSection("")] };
      }
      return { ...f, sections: remaining };
    });
    markDirty();
  }

  // ── Bare-mode question operations (solo section, flat list) ─────────────

  const bareSection = form.sections[0];

  const updateBareQuestion = useCallback(
    (questionId: string, updated: FormQuestion) => {
      setForm((f) => ({
        ...f,
        sections: f.sections.map((s, i) =>
          i === 0
            ? {
                ...s,
                questions: s.questions.map((q) =>
                  q.id === questionId ? updated : q,
                ),
              }
            : s,
        ),
      }));
      markDirty();
    },
    [],
  );

  function addBareQuestion() {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, i) =>
        i === 0 ? { ...s, questions: [...s.questions, newQuestion(normalizeFormPurpose(f.formPurpose))] } : s,
      ),
    }));
    markDirty();
  }

  const moveBareQuestion = useCallback((from: number, to: number) => {
    setForm((f) => {
      const questions = [...f.sections[0].questions];
      if (to < 0 || to >= questions.length || from === to) return f;
      const [moved] = questions.splice(from, 1);
      questions.splice(to, 0, moved);
      return {
        ...f,
        sections: f.sections.map((s, i) =>
          i === 0 ? { ...s, questions } : s,
        ),
      };
    });
    markDirty();
  }, []);

  // Drag-and-drop reorder for bare-mode questions. Only wired up when bare.
  const bareSortable = useSortableList(
    bare ? form.sections[0].questions.length : 0,
    moveBareQuestion,
  );

  function deleteBareQuestion(questionId: string) {
    setForm((f) => ({
      ...f,
      sections: f.sections.map((s, i) =>
        i === 0
          ? { ...s, questions: s.questions.filter((q) => q.id !== questionId) }
          : s,
      ),
    }));
    markDirty();
  }

  // ── Save / publish ───────────────────────────────────────────────────────

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (isPublishedEditMode) {
        // Persist metadata (category / level / scope tags) and sections together.
        await saveFormDraft(formId, form);
        await saveFormVersion(formId, form.sections);
        dirtyRef.current = false;
        setSaved(true);
        toast.success(t("savedToast"), { duration: 2000 });
        router.push("/forms");
      } else {
        await saveFormDraft(formId, form);
        dirtyRef.current = false;
        setSaved(true);
        toast.success(t("savedToast"), { duration: 2000 });
      }
    } catch (err) {
      console.error("[FormBuilderClient] save failed", err);
      toast.error(t("saveFailedToast"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublish() {
    // Validate before touching the network
    const validation = validateFormForPublish(form);
    if (!validation.valid) {
      // Build lookup maps for per-question error rendering
      const idSet = new Set(validation.questionErrors.map((e) => e.questionId));
      const msgMap = new Map(
        validation.questionErrors.map((e) => [e.questionId, e.messages])
      );
      setInvalidQuestionIds(idSet);
      setQuestionErrorMessages(msgMap);
      setFormValidationErrors(validation.formErrors);

      // Toast the summary
      const questionCount = validation.questionErrors.length;
      const hasFormErrors = validation.formErrors.length > 0;
      if (hasFormErrors && questionCount === 0) {
        const msg = validation.formErrors[0];
        toast.error(
          msg === "documentationFormHasPassFailQuestions"
            ? t("documentationFormHasPassFailQuestions")
            : msg,
        );
      } else if (questionCount > 0) {
        toast.error(
          questionCount === 1
            ? t("validationOneQuestion")
            : t("validationManyQuestions", { count: questionCount }),
          { description: hasFormErrors ? validation.formErrors[0] : undefined }
        );
      }

      // Scroll to the first invalid question
      const firstId = validation.questionErrors[0]?.questionId;
      if (firstId) {
        document.getElementById(`question-${firstId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }

    // Clear any previous validation state
    setInvalidQuestionIds(new Set());
    setQuestionErrorMessages(new Map());
    setFormValidationErrors([]);

    try {
      // Always persist current draft before publishing so the publish route
      // never sees a null draftSections (which would cause a 422).
      await saveFormDraft(formId, form);
      dirtyRef.current = false;
      setSaved(true);

      await publishForm(formId);
      setForm((f) => ({ ...f, status: "published" }));
      router.push(`/forms?just=${formId}`);
    } catch (err) {
      console.error("[FormBuilderClient] publish failed", err);
      toast.error(t("publishFailedToast"), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function handleUnpublish() {
    try {
      await unpublishForm(formId);
      dirtyRef.current = false;
      setSaved(true);
      setForm((f) => ({ ...f, status: "draft" }));
    } catch (err) {
      console.error("[FormBuilderClient] unpublish failed", err);
    }
  }

  async function handlePreview() {
    if (!isPublishedEditMode) {
      await saveFormDraft(formId, form).catch(() => {});
      dirtyRef.current = false;
      setSaved(true);
    }
    setPreviewOpen(true);
  }

  const isPublished = form.status === "published";

  // ── Loading / error states ────────────────────────────────────────────────

  if (loadState === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-disabled)", gap: 8, fontSize: 13 }}>
        <span aria-hidden style={{ display: "inline-block", width: 16, height: 16, border: "2px solid var(--neutral-300)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        {t("loadingForm")}
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "40px 24px", gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--color-text-primary)" }}>{t("formNotFound")}</h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-tertiary)", maxWidth: 340, lineHeight: 1.5 }}>{t("formNotFoundDescription")}</p>
        <button type="button" onClick={() => router.push("/forms")} style={{ padding: "9px 18px", borderRadius: "var(--radius-md)", border: "none", backgroundColor: "var(--color-accent)", color: "var(--color-text-inverse)", fontSize: 13, fontWeight: 700, letterSpacing: "var(--tracking-ui)", cursor: "pointer", fontFamily: "inherit" }}>
          {t("backToForms")}
        </button>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {/* ── Published edit mode banner ── */}
      {isPublishedEditMode && (
        <div
          style={{
            backgroundColor: "var(--form-deficiency-bg)",
            borderBottom: "1px solid var(--form-deficiency-border)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--form-deficiency-fg)",
            fontWeight: 600,
          }}
        >
          <AlertTriangle size={15} aria-hidden style={{ flexShrink: 0 }} />
          <span>{t("editModeBanner")}</span>
          <button
            type="button"
            onClick={() => router.push("/forms")}
            style={{ marginLeft: "auto", fontSize: 12, color: "var(--form-deficiency-fg)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0, flexShrink: 0 }}
          >
            {t("editModeCancel")}
          </button>
        </div>
      )}

      {/* ── Top bar ──
          Mobile-first: back is icon-only, status badge is the contextual
          indicator, Preview + Save are icon-only ghost buttons, Publish
          is the one text-labeled primary CTA. See
          `docs/design/MOBILE_DENSITY.md`. */}
      <div
        className="fb-topbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-divider)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 14px",
          height: 54,
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/forms")}
          aria-label={t("backToForms")}
          title={t("backToForms")}
          style={{
            width: 32,
            height: 32,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "var(--neutral-600)",
            borderRadius: 6,
            fontFamily: "inherit",
            transition: "background-color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--neutral-100)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <ArrowLeft size={18} aria-hidden />
        </button>

        <StatusBadge status={form.status} />

        <div style={{ flex: 1 }} />

        <span
          className="fb-topbar-saved"
          style={{
            fontSize: 11,
            color: "var(--neutral-400)",
            opacity: saved ? 1 : 0,
            transition: "opacity 0.3s",
            whiteSpace: "nowrap",
          }}
        >
          {t("savedIndicator")}
        </span>

        {/* Preview — icon-only (secondary action) */}
        <IconToolbarButton
          onClick={handlePreview}
          icon={<Eye size={16} aria-hidden />}
          label={t("previewAriaLabel")}
        />

        <IconToolbarButton
          onClick={handleSave}
          disabled={isSaving}
          icon={
            isSaving ? (
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 16,
                  border: "2px solid var(--neutral-300)",
                  borderTopColor: "var(--color-accent)",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                }}
              />
            ) : (
              <Save size={16} aria-hidden />
            )
          }
          label={isSaving ? t("savingIndicator") : isPublishedEditMode ? t("saveNewVersion") : isPublished ? t("saveChanges") : t("saveDraft")}
        />

        {/* Publish / Unpublish — the one labeled CTA on the toolbar */}
        {isPublished ? (
          <button
            type="button"
            onClick={handleUnpublish}
            className="fb-publish-btn"
            style={{
              padding: "7px 14px",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: "var(--color-surface-sunken)",
              color: "var(--color-text-secondary)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "var(--tracking-ui)",
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {t("unpublish")}
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePublish}
            className="fb-publish-btn"
            style={{
              padding: "7px 14px",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: "var(--form-builder-commit-bg)",
              color: "var(--color-text-inverse)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "var(--tracking-ui)",
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {t("publish")}
          </button>
        )}
      </div>

      {/* ── Page content ──
          Mobile-first padding (12 px horizontal, 16 px top). The CSS
          class `fb-builder-content` bumps it up on tablet/desktop so
          there's more breathing room on larger screens without burning
          mobile width. See `.cursor/rules/mobile-density.mdc` rule 5. */}
      <div
        className="fb-builder-content"
        style={{
          maxWidth: 680,
          margin: "0 auto",
          padding: "16px 12px 48px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* ── Setup summary strip ──
            Metadata ABOUT the form (category / level / scope types),
            rendered as a caption row above the title card. No border,
            no background — reads as a label, not a form field.
            Category is the kicker (primary color, uppercase) because
            it's the form's identity; level + scope types are
            supporting detail in neutral text. "Edit" is a quiet text
            button in the top-right. All editing happens in
            FormSetupModal; this strip never edits inline. */}
        <SetupSummaryStrip
          form={form}
          scopeTypeOptions={scopeTypeOptions}
          onEdit={() => setSetupOpen(true)}
        />

        {/* Form header card — tight padding on mobile so the title
            input gets maximum horizontal room. Long titles like
            "Clear Inspection: CABINETRY TEST" need every pixel; the
            old 28 px sides were eating ~36 characters worth of text
            on a 320 px screen. */}
        <div
          className="fb-form-header-card"
          style={{
            backgroundColor: "var(--color-surface)",
            borderRadius: "var(--radius-lg)",
            borderTop: "6px solid var(--form-builder-card-stripe)",
            boxShadow: "var(--shadow-card)",
            padding: "12px 14px",
          }}
        >
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            placeholder={t("untitledForm")}
            className="no-focus-ring fb-form-title-input"
            style={{
              width: "100%",
              border: "none",
              borderBottom: "none",
              outline: "none",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              fontFamily: "inherit",
              padding: "0 0 8px",
              boxSizing: "border-box",
              backgroundColor: "transparent",
              lineHeight: 1.3,
            }}
          />
          <textarea
            value={form.description}
            onChange={(e) => updateForm({ description: e.target.value })}
            placeholder={t("formDescriptionPlaceholder")}
            rows={2}
            className="no-focus-ring"
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              fontSize: 13,
              color: "var(--color-text-tertiary)",
              fontFamily: "inherit",
              padding: "8px 0 0",
              boxSizing: "border-box",
              backgroundColor: "transparent",
              lineHeight: 1.5,
            }}
          />
        </div>

        {bare ? (
          // ── BARE MODE: single untitled section, render questions flat ──
          // This is the Google-Forms landing experience. No section header,
          // just the form + questions + an "Add question" button.
          <>
            {bareSection.questions.map((q, i) => (
              <div key={q.id} id={`question-${q.id}`}>
                <FormQuestionRow
                  question={q}
                  allowedResponseTypes={allowedResponseTypes}
                  number={String(i + 1)}
                  isFirst={i === 0}
                  isLast={i === bareSection.questions.length - 1}
                  onChange={(updated) => {
                    updateBareQuestion(q.id, updated);
                    // Clear error for this question once the title is filled
                    if (updated.title.trim() && invalidQuestionIds.has(q.id)) {
                      setInvalidQuestionIds((prev) => {
                        const next = new Set(prev);
                        next.delete(q.id);
                        return next;
                      });
                    }
                  }}
                  onMoveUp={() => moveBareQuestion(i, i - 1)}
                  onMoveDown={() => moveBareQuestion(i, i + 1)}
                  onDelete={() => deleteBareQuestion(q.id)}
                  hasError={invalidQuestionIds.has(q.id)}
                  errorMessages={questionErrorMessages.get(q.id) ?? []}
                  {...bareSortable.getDragProps(i)}
                />
              </div>
            ))}

            <AddButtonsRow
              onAddQuestion={addBareQuestion}
              onAddSection={addSection}
            />
          </>
        ) : (
          // ── SECTIONED MODE: user has organized their form into groups ──
          // Each section renders its own "Add question" button at its
          // bottom, EXCEPT the last one — for the last section we promote
          // "Add question" into the form-level inline footer alongside
          // "Add section", so the two actions sit side by side the same
          // way they do in bare mode.
          <>
            {(() => {
              // A preamble is the first section when its title is blank —
              // it renders without a section header so questions feel like
              // they exist "outside" any named section.
              const hasPreamble = form.sections.length > 0 && form.sections[0].title.trim() === "";
              const namedSections = hasPreamble ? form.sections.slice(1) : form.sections;

              return (
                <>
                  {/* Preamble section (untitled, no header) */}
                  {hasPreamble && (
                    <FormSectionBlock
                      key={form.sections[0].id}
                      itemNumber={0}
                      title={form.sections[0].title}
                      description={form.sections[0].description}
                      questions={form.sections[0].questions}
                      isFirst={true}
                      isLast={false}
                      hideHeader={true}
                      showAddQuestionButton={true}
                      onTitleChange={(title) => updateSectionTitle(form.sections[0].id, title)}
                      onDescriptionChange={(description) => updateSectionDescription(form.sections[0].id, description)}
                      onQuestionsChange={(questions) => updateSectionQuestions(form.sections[0].id, questions)}
                      onInsertBefore={() => {}}
                      onMoveUp={() => {}}
                      onMoveDown={() => {}}
                      onDelete={() => deleteSection(form.sections[0].id)}
                      onAddQuestion={() => addQuestionToSection(form.sections[0].id)}
                      invalidQuestionIds={invalidQuestionIds}
                      questionErrorMessages={questionErrorMessages}
                      allowedResponseTypes={allowedResponseTypes}
                    />
                  )}

                  {/* Button to add a question before Section 1 when no preamble yet */}
                  {!hasPreamble && (
                    <button
                      type="button"
                      onClick={addPreambleQuestion}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        padding: "10px 18px",
                        borderRadius: "var(--radius-md)",
                        border: "1.5px dashed var(--color-divider)",
                        backgroundColor: "transparent",
                        color: "var(--color-text-tertiary)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        width: "100%",
                        fontFamily: "inherit",
                        transition: "border-color 0.12s, color 0.12s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-accent)";
                        e.currentTarget.style.color = "var(--color-accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-divider)";
                        e.currentTarget.style.color = "var(--color-text-tertiary)";
                      }}
                    >
                      + Add question above Section 1
                    </button>
                  )}

                  {namedSections.map((section, i) => {
                    const sectionIndex = hasPreamble ? i + 1 : i;
                    const isLastSection = sectionIndex === form.sections.length - 1;
                    return (
                      <FormSectionBlock
                        key={section.id}
                        itemNumber={i + 1}
                        total={namedSections.length}
                        title={section.title}
                        description={section.description}
                        questions={section.questions}
                        isFirst={sectionIndex === (hasPreamble ? 1 : 0)}
                        isLast={isLastSection}
                        onTitleChange={(title) => updateSectionTitle(section.id, title)}
                        onDescriptionChange={(description) => updateSectionDescription(section.id, description)}
                        onQuestionsChange={(questions) =>
                          updateSectionQuestions(section.id, questions)
                        }
                        onInsertBefore={() => insertSectionBefore(sectionIndex)}
                        onMoveUp={() => moveSection(sectionIndex, sectionIndex - 1)}
                        onMoveDown={() => moveSection(sectionIndex, sectionIndex + 1)}
                        onDelete={() => deleteSection(section.id)}
                        onAddQuestion={() => addQuestionToSection(section.id)}
                        showAddQuestionButton={!isLastSection}
                        invalidQuestionIds={invalidQuestionIds}
                        questionErrorMessages={questionErrorMessages}
                        allowedResponseTypes={allowedResponseTypes}
                      />
                    );
                  })}
                </>
              );
            })()}

            <AddButtonsRow
              onAddQuestion={() => {
                const lastSection = form.sections[form.sections.length - 1];
                if (lastSection) addQuestionToSection(lastSection.id);
              }}
              onAddSection={addSection}
            />

            {/* Auto-appended section — always visible, not editable */}
            <AutoNotesSectionPreview />
          </>
        )}
      </div>

      {setupOpen && (
        <FormSetupModal
          mode="edit"
          initialValues={{
            formPurpose: normalizeFormPurpose(form.formPurpose),
            category: form.category,
            level: form.level,
            scopeTypeCodes: form.scopeTypeCodes,
          }}
          onSubmit={async (values: FormSetupValues) => {
            const normalized = normalizeGypcreteFormSetup({
              category: values.category,
              level: values.level,
              scopeTypeCodes: values.scopeTypeCodes,
            });
            const nextForm = {
              ...form,
              ...normalized,
              formPurpose: values.formPurpose,
              category:
                values.formPurpose === "documentation" ? "OTHER" : normalized.category,
            };
            try {
              const saved = await saveFormSetup(formId, {
                formPurpose: nextForm.formPurpose ?? "inspection",
                level: nextForm.level,
                category: nextForm.category,
                scopeTypeCodes: nextForm.scopeTypeCodes,
              });
              setForm((prev) => ({
                ...prev,
                ...saved.template,
                sections: prev.sections,
              }));
              dirtyRef.current = false;
              setSaved(true);
              setSetupOpen(false);
            } catch (err) {
              console.warn("[FormBuilderClient] setup save failed", err);
              const message =
                err instanceof Error ? err.message : t("saveFailedToast");
              toast.error(message);
            }
          }}
          onClose={() => setSetupOpen(false)}
        />
      )}

      {previewOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
              overflowY: "auto",
              backgroundColor: "var(--neutral-50, #fafafa)",
            }}
          >
            <FormFillClient
              template={form}
              mode="preview"
              onClose={() => setPreviewOpen(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Setup summary strip — pinned read-only echo of the category, level,
 * and scope-type tags the author picked in FormSetupModal. Sits
 * directly below the title card so the author can always see what
 * they're building. Tapping "Edit setup" reopens the same modal with
 * current values preloaded; there is NO inline editing of these
 * fields in the builder itself, which keeps the builder page
 * focused on questions and keeps taxonomy decisions in one place.
 *
 * Chip labels prefer the human `name` from /api/lookups; if that
 * hasn't loaded (or a code isn't found), we fall back to the raw
 * code so the summary never goes blank.
 */
function SetupSummaryStrip({
  form,
  scopeTypeOptions,
  onEdit,
}: {
  form: FormTemplate;
  scopeTypeOptions: ScopeTypeOption[];
  onEdit: () => void;
}) {
  const t = useTranslations("forms.builder");
  const tSetup = useTranslations("forms.setup");
  const codeToOption = new Map(scopeTypeOptions.map((o) => [o.code, o]));
  const isScope = form.level === "scope";
  const isProject = form.level === "project";
  const isPublished = form.status === "published";
  const purpose = normalizeFormPurpose(form.formPurpose);
  const isDocumentation = purpose === "documentation";
  // Missing-setup detection for legacy drafts that predate this flow.
  // Documentation forms auto-use OTHER; scope-level still needs scope tags.
  const needsSetup =
    (isScope && form.scopeTypeCodes.length === 0) ||
    (!isDocumentation && form.category === "OTHER");

  // Supporting line: "Unit-level" for unit forms, or a list of scope
  // names for scope forms. Format: "Cabinetry (CAB)". Falls back to the
  // raw code if the canonical option hasn't loaded yet.
  const scopeLabels = form.scopeTypeCodes.map((code) => {
    const opt = codeToOption.get(code);
    return opt ? `${opt.displayName} (${code})` : code;
  });
  const detail = isProject
    ? t("projectLevel")
    : isScope
      ? scopeLabels.length > 0
        ? `${t("scopeLevel")} · ${scopeLabels.join(", ")}`
        : t("scopeLevel")
      : t("unitLevel");
  const versionLabel = isPublished && form.versionNumber !== undefined
    ? `v${form.versionNumber}`
    : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: "0 2px",
        marginBottom: -2,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: needsSetup
              ? "var(--form-deficiency-fg)"
              : "var(--color-accent)",
            lineHeight: 1.3,
          }}
        >
          {isDocumentation
            ? tSetup("purposeDocumentation")
            : INSPECTION_CATEGORY_LABELS[form.category]}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            lineHeight: 1.35,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {detail}
          {versionLabel && (
            <span style={{ color: "var(--neutral-400)" }}> · {versionLabel}</span>
          )}
          {needsSetup && (
            <>
              {" · "}
              <span
                style={{
                  color: "var(--warning-700, #b45309)",
                  fontStyle: "italic",
                }}
              >
                {t("finishSetupToPublish")}
              </span>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t("editSetupAriaLabel")}
        title={t("editSetupAriaLabel")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 4px",
          margin: "-2px -4px 0 0",
          borderRadius: 6,
          border: "none",
          backgroundColor: "transparent",
          color: "var(--neutral-500)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
          lineHeight: 1.3,
        }}
      >
        <Settings2 size={12} aria-hidden />
        {t("editSetup")}
      </button>
    </div>
  );
}

/**
 * Bare-mode footer: a side-by-side row with the primary "Add question"
 * button stretching to fill, and the secondary "Add section" button
 * compact on the right. This places the two related actions in the same
 * visual band so they read as a coherent "what do I add next?" choice.
 */
function AddButtonsRow({
  onAddQuestion,
  onAddSection,
}: {
  onAddQuestion: () => void;
  onAddSection: () => void;
}) {
  const t = useTranslations("forms.builder");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 8,
        paddingTop: 4,
      }}
    >
      <button
        type="button"
        onClick={onAddQuestion}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "13px 18px",
          borderRadius: "var(--radius-lg)",
          border: "none",
          backgroundColor: "var(--color-accent)",
          color: "var(--color-text-inverse)",
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "var(--tracking-ui)",
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "background-color 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-accent-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--color-accent)";
        }}
      >
        <Plus size={16} aria-hidden />
        {t("addQuestion")}
      </button>

      <AddSectionButton onClick={onAddSection} />
    </div>
  );
}

function AddSectionButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("forms.builder");
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("addSectionTitle")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px dashed var(--neutral-300)",
        backgroundColor: "transparent",
        color: "var(--color-text-secondary)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        transition:
          "background-color 0.12s, border-color 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--color-surface)";
        e.currentTarget.style.borderColor = "var(--color-accent)";
        e.currentTarget.style.color = "var(--color-accent-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.borderColor = "var(--color-divider)";
        e.currentTarget.style.color = "var(--color-text-secondary)";
      }}
    >
      <Rows3 size={14} aria-hidden />
      {t("addSection")}
    </button>
  );
}

/**
 * 32×32 icon-only ghost button for the builder top bar.
 *
 * Standardizes the look of secondary toolbar actions (Preview, Save draft)
 * so they share identical visual weight and tap geometry. The label is
 * passed as both `aria-label` and `title` so it's discoverable without
 * eating horizontal space on narrow screens.
 *
 * See `docs/design/MOBILE_DENSITY.md` for the density principles this
 * implements.
 */
/**
 * Read-only preview card that appears below the editable sections in the
 * form builder to represent the auto-appended Inspector Notes & Media section.
 * Locked so form authors can see it exists without being able to delete or
 * reorganise it.
 */
function AutoNotesSectionPreview() {
  return (
    <div
      style={{
        margin: "12px 0 4px",
        border: "1.5px dashed var(--color-divider)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        opacity: 0.75,
      }}
    >
      {/* Header band */}
      <div
        style={{
          padding: "8px 12px",
          backgroundColor: "var(--neutral-100)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "var(--neutral-400)",
              marginBottom: 1,
            }}
          >
            Auto-appended · All forms
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--neutral-700)",
            }}
          >
            Inspector Notes & Media
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--neutral-400)",
            backgroundColor: "var(--neutral-200)",
            padding: "2px 7px",
            borderRadius: 99,
            whiteSpace: "nowrap",
          }}
        >
          Optional
        </span>
      </div>

      {/* Mock fields */}
      <div
        style={{
          padding: "10px 12px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          backgroundColor: "var(--color-surface)",
        }}
      >
        {/* Notes preview */}
        <div
          style={{
            borderRadius: 7,
            border: "none",
            padding: "8px 10px",
            fontSize: 12,
            color: "var(--color-text-disabled)",
            minHeight: 52,
            backgroundColor: "var(--color-surface-sunken)",
          }}
        >
          Notes about this inspection…
        </div>

        {/* Media button preview */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 10px",
            border: "none",
            borderRadius: 7,
            fontSize: 12,
            color: "var(--color-text-disabled)",
            backgroundColor: "var(--color-surface-sunken)",
            alignSelf: "flex-start",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Add photo / video / audio
        </div>
      </div>
    </div>
  );
}

function IconToolbarButton({
  onClick,
  icon,
  label,
  disabled = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        backgroundColor: "var(--color-surface-sunken)",
        color: disabled ? "var(--color-text-disabled)" : "var(--color-text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 8,
        fontFamily: "inherit",
        flexShrink: 0,
        opacity: disabled ? 0.7 : 1,
        transition: "background-color 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--color-accent-subtle)";
        e.currentTarget.style.color = "var(--color-accent-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--color-surface-sunken)";
        e.currentTarget.style.color = "var(--color-text-secondary)";
      }}
    >
      {icon}
    </button>
  );
}
