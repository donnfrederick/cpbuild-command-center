"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ChevronDown, Trash2, Copy, Star, X, Plus, Camera, AlertTriangle } from "lucide-react";
import type { FormQuestion, ResponseType } from "./formTypes";
import { allowsAdditionalDeficiencies } from "./formTypes";
import {
  followUpPayloadKey,
  followUpTriggersForResponseType,
  getChoiceFollowUps,
  type ChoiceFollowUpTrigger,
} from "@/lib/forms/choice-follow-ups";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function newFollowUpQuestion(
  parentId: string,
  trigger: ChoiceFollowUpTrigger,
): FormQuestion {
  return {
    id: followUpPayloadKey(parentId, trigger),
    title: "",
    description: "",
    responseType: "SHORT_ANSWER",
    required: true,
    photoRequired: false,
    deficiencyPhotoRequired: false,
    options: [],
  };
}

function patchChoiceFollowUp(
  question: FormQuestion,
  trigger: ChoiceFollowUpTrigger,
  followUp: FormQuestion | undefined,
): Partial<FormQuestion> {
  const next = { ...getChoiceFollowUps(question) };
  if (followUp) next[trigger] = followUp;
  else delete next[trigger];
  const patch: Partial<FormQuestion> = { choiceFollowUps: next };
  if (trigger === "fail") {
    patch.failFollowUp = followUp;
  }
  return patch;
}
import {
  RESPONSE_META,
  ALL_RESPONSE_TYPES,
  DEFICIENCY_SEVERITIES,
  DEFICIENCY_SEVERITY_STYLES,
} from "./formTypes";
import type { DropIndicator } from "./useSortableList";

// ── Drag handle ───────────────────────────────────────────────────────────────

/**
 * Google-Forms-style grip: six dots in a 2-row x 3-column grid sitting at
 * the top-center of the question card. Purely decorative — the whole card
 * is `draggable` — but the cursor hint + visual affordance tells users
 * where to grab.
 */
function DragHandle() {
  const dot = {
    width: 3,
    height: 3,
    borderRadius: "50%",
    backgroundColor: "var(--neutral-400)",
  } as const;
  return (
    <div
      aria-hidden
      className="fb-drag-handle"
      style={{
        position: "absolute",
        top: 4,
        left: "50%",
        transform: "translateX(-50%)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 3px)",
        gridAutoRows: "3px",
        gap: 3,
        padding: "6px 10px",
        cursor: "grab",
        opacity: 0.55,
        transition: "opacity 0.15s",
        userSelect: "none",
      }}
    >
      <span style={dot} />
      <span style={dot} />
      <span style={dot} />
      <span style={dot} />
      <span style={dot} />
      <span style={dot} />
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "none",
        background: "none",
        cursor: "pointer",
        padding: "0 2px",
        fontFamily: "inherit",
      }}
    >
      {/* Track */}
      <div
        style={{
          width: 38,
          height: 22,
          borderRadius: 11,
          backgroundColor: on ? "var(--color-accent)" : "var(--neutral-300)",
          position: "relative",
          flexShrink: 0,
          transition: "background-color 0.2s",
        }}
      >
        {/* Thumb */}
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            backgroundColor: "var(--color-surface)",
            position: "absolute",
            top: 2,
            left: on ? 18 : 2,
            transition: "left 0.2s",
            boxShadow: "var(--shadow-card)",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 13,
        fontWeight: on ? 700 : 500,
        color: on ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ── Answer area ───────────────────────────────────────────────────────────────

function OptionsEditor({
  type,
  options,
  onChange,
}: {
  type: "MULTIPLE_CHOICE" | "CHECKBOXES";
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  const t = useTranslations("forms.builder");
  const isRadio = type === "MULTIPLE_CHOICE";
  const displayOptions = options.length > 0 ? options : [];

  function addOption() {
    onChange([...options, t("defaultOption", { n: options.length + 1 })]);
  }

  function updateOption(i: number, val: string) {
    const next = [...options];
    next[i] = val;
    onChange(next);
  }

  function removeOption(i: number) {
    onChange(options.filter((_, j) => j !== i));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      {displayOptions.map((opt, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: isRadio ? "50%" : 3,
              border: "1.5px solid var(--neutral-400)",
              flexShrink: 0,
            }}
          />
          <input
            type="text"
            value={opt}
            onChange={(e) => updateOption(i, e.target.value)}
            className="no-focus-ring"
            style={{
              flex: 1,
              border: "none",
              borderBottom: "1px solid transparent",
              outline: "none",
              fontSize: 14,
              color: "var(--neutral-800)",
              fontFamily: "inherit",
              backgroundColor: "transparent",
              padding: "2px 0",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderBottomColor = "var(--neutral-400)"; }}
            onBlur={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; }}
          />
          {options.length > 1 && (
            <button
              type="button"
              onClick={() => removeOption(i)}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                color: "var(--neutral-350)",
                padding: 2,
                display: "flex",
              }}
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
      ))}

      {/* Add option row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: isRadio ? "50%" : 3,
            border: "1.5px dashed var(--neutral-300)",
            flexShrink: 0,
          }}
        />
        <button
          type="button"
          onClick={addOption}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 14,
            color: "var(--color-accent)",
            fontWeight: 600,
            fontFamily: "inherit",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Plus size={14} aria-hidden />
          {t("addOption")}
        </button>
      </div>
    </div>
  );
}

const previewLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--color-text-disabled)",
  marginBottom: 8,
  margin: "0 0 8px",
};

/**
 * Subtle tinted overlay applied only over the amber deficiency-flow
 * section inside a PASS_FAIL_DEFICIENCIES question preview. Signals that
 * the IF-FAIL block is a non-interactive mock without stamping every
 * other question type.
 */
function DeficiencyPreviewOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      {children}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(243, 244, 246, 0.5)",
          pointerEvents: "none",
          borderRadius: 4,
        }}
      />
    </div>
  );
}

const mockInputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: 320,
  padding: "8px 10px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  backgroundColor: "var(--color-surface-sunken)",
  fontSize: 14,
  color: "var(--color-text-disabled)",
  fontFamily: "inherit",
  pointerEvents: "none",
  userSelect: "none",
};

// ── Deficiency flow preview ───────────────────────────────────────────────────

/**
 * Shown in the builder beneath the Pass / Fail preview when a question is
 * configured as `PASS_FAIL_DEFICIENCIES`. Its job is to make the implicit
 * follow-up flow explicit to form authors: "if the inspector marks Fail,
 * this is exactly what they'll see". The preview is non-interactive.
 *
 * At fill time, a near-identical UI will render live when the inspector
 * actually taps Fail — keeping them visually consistent here lets form
 * authors sanity-check what they're shipping.
 */
/**
 * Builder-side preview of what an inspector sees when they mark this
 * question as "Fail".
 *
 * Flat by design — the strip bleeds to the question card's horizontal
 * edges (via negative margins that match the card body's 14 px
 * horizontal padding) so the amber region is NOT a second padded frame
 * sitting inside the question card. Content inside the strip sits
 * directly in the amber tint; there is no inner "white card" the way
 * the old version had. Mirrors the exact fill-time layout in
 * `FormFillClient` so the preview is a truthful rendering of what the
 * inspector will see. See `.cursor/rules/mobile-density.mdc` rule 7.
 *
 * We explicitly do NOT show the "Number of deficiencies" input here —
 * at fill time there is no such control; inspectors tap "Add another
 * deficiency" to grow the list. Showing a fake count input in the
 * builder preview would teach the form author a mental model the app
 * doesn't actually implement.
 */
function DeficiencyFlowPreview({
  photoRequired,
  descriptionEnabled,
  allowAdditionalEntries,
}: {
  photoRequired: boolean;
  descriptionEnabled: boolean;
  allowAdditionalEntries: boolean;
}) {
  const t = useTranslations("forms.builder");
  return (
    <div
      className="fb-deficiency-preview"
      style={{
        // Bleed to the question card edges — matches card body's 14 px
        // mobile padding. The `.fb-deficiency-preview` class in
        // globals.css re-tunes these margins to -20 on desktop, where
        // the card body is 20 px horizontal. Keep mobile values here
        // as the source of truth.
        marginLeft: -14,
        marginRight: -14,
        marginTop: 12,
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: 10,
        paddingBottom: 12,
        backgroundColor: "var(--form-deficiency-bg)",
        borderTop: "1px solid var(--form-deficiency-border)",
        borderBottom: "none",
      }}
    >
      {/* Header — single line, no box */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
        }}
      >
        <AlertTriangle
          size={13}
          aria-hidden
          style={{ color: "var(--form-deficiency-fg)", flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "var(--tracking-section)",
            textTransform: "uppercase",
            color: "var(--form-deficiency-fg)",
          }}
        >
          {t("deficiencyFlowHeader")}
        </span>
      </div>

      {/* Example entry — flat inside the amber strip. No inner white card. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {descriptionEnabled && (
          <div
            style={{
              ...mockInputStyle,
              maxWidth: "100%",
              padding: "8px 10px",
              fontSize: 12,
            }}
          >
            {t("deficiencyDescPlaceholder")}
          </div>
        )}

        {/* Occurrence count stepper — preview only */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "var(--tracking-section)",
              textTransform: "uppercase",
              color: "var(--form-deficiency-fg)",
            }}
          >
            {t("deficiencyCountLabel")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 0, pointerEvents: "none" }}>
            <div style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--form-deficiency-border)", borderRight: "none", borderRadius: "6px 0 0 6px", background: "var(--form-deficiency-bg)", color: "var(--form-deficiency-fg)", fontSize: 16 }}>−</div>
            <div style={{ width: 42, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--form-deficiency-border)", background: "var(--color-surface)", fontSize: 13, fontWeight: 700, color: "var(--form-deficiency-fg)" }}>1</div>
            <div style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--form-deficiency-border)", borderLeft: "none", borderRadius: "0 6px 6px 0", background: "var(--color-surface)", color: "var(--form-deficiency-fg)", fontSize: 16 }}>+</div>
          </div>
        </div>

        {/* Severity label + pills + photo chip */}
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "var(--tracking-section)",
            textTransform: "uppercase",
            color: "var(--form-deficiency-fg)",
            margin: 0,
          }}
        >
          {t("deficiencySeverityLabel")}
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
          }}
        >
          {DEFICIENCY_SEVERITIES.map((sev) => {
            const s = DEFICIENCY_SEVERITY_STYLES[sev];
            return (
              <span
                key={sev}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  backgroundColor: s.bg,
                  color: s.fg,
                  border: "none",
                  userSelect: "none",
                }}
              >
                {sev}
              </span>
            );
          })}
          {photoRequired && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 999,
                border: "none",
                backgroundColor: "var(--color-surface-sunken)",
                color: "var(--color-text-tertiary)",
                fontSize: 11,
                fontWeight: 500,
                userSelect: "none",
              }}
            >
              <Camera size={11} aria-hidden />
              {t("photoLabel")}
            </span>
          )}
        </div>
        {allowAdditionalEntries && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 10,
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px dashed var(--form-deficiency-border)",
              backgroundColor: "var(--color-surface)",
              color: "var(--form-deficiency-fg)",
              fontSize: 11,
              fontWeight: 600,
              userSelect: "none",
            }}
          >
            <Plus size={12} aria-hidden />
            {t("deficiencyAddAnotherPreview")}
          </span>
        )}
      </div>
    </div>
  );
}

function AnswerArea({
  question,
  onChange,
}: {
  question: FormQuestion;
  onChange: (opts: string[]) => void;
}) {
  const t = useTranslations("forms.builder");
  const { responseType, options } = question;

  const previewLabel = <p style={previewLabelStyle}>{t("responsePreview")}</p>;

  const passFailBtns = (items: { label: string; bg: string; fg: string }[]) => (
    <div>
      {previewLabel}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {items.map((item) => (
          <span
            key={item.label}
            style={{
              padding: "7px 20px",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              fontWeight: 700,
              color: item.fg,
              backgroundColor: item.bg,
              userSelect: "none",
            }}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );

  switch (responseType) {
    case "PASS_FAIL":
      return (
        <div>
          {passFailBtns([
            { label: t("passLabel"), bg: "var(--form-response-pass-bg)", fg: "var(--form-response-pass-fg)" },
            { label: t("failLabel"), bg: "var(--form-response-fail-bg)", fg: "var(--form-response-fail-fg)" },
            { label: t("naLabel"), bg: "var(--form-response-na-bg)", fg: "var(--form-response-na-fg)" },
          ])}
          {getChoiceFollowUps(question).fail && "id" in (getChoiceFollowUps(question).fail ?? {}) && (
            <div style={{ marginTop: 10, paddingLeft: 14, borderLeft: "3px solid var(--form-deficiency-border)" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--form-deficiency-fg)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                {t("followUpSectionTitle")}
              </span>
            </div>
          )}
        </div>
      );

    case "PASS_FAIL_DEFICIENCIES":
      return (
        <div>
          {passFailBtns([
            { label: t("passLabel"), bg: "var(--form-response-pass-bg)", fg: "var(--form-response-pass-fg)" },
            { label: t("failLabel"), bg: "var(--form-response-fail-bg)", fg: "var(--form-response-fail-fg)" },
            { label: t("naLabel"), bg: "var(--form-response-na-bg)", fg: "var(--form-response-na-fg)" },
          ])}
          <DeficiencyPreviewOverlay>
            <DeficiencyFlowPreview
              photoRequired={question.deficiencyPhotoRequired ?? false}
              descriptionEnabled={question.deficiencyDescriptionEnabled ?? true}
              allowAdditionalEntries={allowsAdditionalDeficiencies(question)}
            />
          </DeficiencyPreviewOverlay>
        </div>
      );

    case "YES_NO": {
      const yesNoOptions = [
        { label: t("yesLabel"), bg: "var(--color-accent-subtle)", fg: "var(--color-accent-hover)" },
        { label: t("noLabel"), bg: "var(--form-response-na-bg)", fg: "var(--form-response-na-fg)" },
      ];
      if (question.showNotApplicable) {
        yesNoOptions.push({
          label: t("naLabel"),
          bg: "var(--form-response-na-bg)",
          fg: "var(--form-response-na-fg)",
        });
      }
      return passFailBtns(yesNoOptions);
    }

    case "MULTIPLE_CHOICE":
    case "CHECKBOXES":
      return (
        <div>
          {previewLabel}
          <OptionsEditor
            type={responseType}
            options={options}
            onChange={onChange}
          />
        </div>
      );

    case "SHORT_ANSWER":
      return (
        <div>
          {previewLabel}
          <div style={mockInputStyle}>{t("shortAnswerPlaceholder")}</div>
        </div>
      );

    case "PARAGRAPH":
      return (
        <div>
          {previewLabel}
          <div style={{ ...mockInputStyle, maxWidth: "100%", minHeight: 72 }}>{t("longAnswerPlaceholder")}</div>
        </div>
      );

    case "NUMBER":
      return (
        <div>
          {previewLabel}
          <div style={{ ...mockInputStyle, maxWidth: 160 }}>{t("numberPlaceholder")}</div>
        </div>
      );

    case "RATING":
      return (
        <div>
          {previewLabel}
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={28} style={{ color: "var(--neutral-300)" }} aria-hidden />
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ── Shared type option list ───────────────────────────────────────────────────

function TypeOptionList({
  current,
  onSelect,
  types,
  mobile = false,
}: {
  current: ResponseType;
  onSelect: (type: ResponseType) => void;
  types: ResponseType[];
  mobile?: boolean;
}) {
  return (
    <>
      {types.map((type) => {
        const active = type === current;
        const meta = RESPONSE_META[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: mobile ? "14px 20px" : "9px 16px",
              border: "none",
              borderBottom: mobile ? "1px solid var(--color-divider)" : "none",
              textAlign: "left",
              cursor: "pointer",
              fontSize: mobile ? 15 : 13,
              fontFamily: "inherit",
              fontWeight: active ? 700 : 500,
              backgroundColor: active ? "var(--color-accent-subtle)" : "transparent",
              color: active ? "var(--color-accent-hover)" : "var(--color-text-secondary)",
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = "var(--color-surface-sunken)"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = active ? "var(--color-accent-subtle)" : "transparent"; }}
          >
            <span style={{
              fontSize: mobile ? 18 : 14,
              width: mobile ? 24 : 20,
              textAlign: "center",
              flexShrink: 0,
              color: active ? "var(--color-accent)" : "var(--color-text-tertiary)",
            }}>
              {meta.icon}
            </span>
            {meta.label}
            {active && (
              <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--color-accent)" }}>✓</span>
            )}
          </button>
        );
      })}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface FormQuestionRowProps {
  question: FormQuestion;
  onChange: (updated: FormQuestion) => void;
  onDelete: () => void;
  // Flat-list mode (FormBuilderClient)
  index?: number;
  total?: number;
  onDuplicate?: () => void;
  // Sectioned mode (FormSectionBlock)
  number?: string;
  isFirst?: boolean;
  isLast?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  // Drag-and-drop (opt-in). Supplied by `useSortableList` on the parent.
  draggable?: boolean;
  isDragging?: boolean;
  dropIndicator?: DropIndicator;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  /** When true the card renders with a red error border and inline error messages. */
  hasError?: boolean;
  /** Specific errors for this question — shown as inline hints below the affected field. */
  errorMessages?: string[];
  /** When set, limits the question-type picker (e.g. documentation forms). */
  allowedResponseTypes?: ResponseType[];
}

export function FormQuestionRow({
  question,
  index = 0,
  total,
  onChange,
  onDuplicate,
  onDelete,
  number: displayNumber,
  draggable,
  isDragging,
  dropIndicator,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  hasError = false,
  errorMessages = [],
  allowedResponseTypes = ALL_RESPONSE_TYPES,
}: FormQuestionRowProps) {
  const t = useTranslations("forms.builder");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [focused, setFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  );
  const cardRef = useRef<HTMLDivElement>(null);

  function update(partial: Partial<FormQuestion>) {
    onChange({ ...question, ...partial });
  }

  // Attach media-query listener — initial value is set by the state initializer above
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Close desktop dropdown on outside click
  useEffect(() => {
    if (isMobile) return;
    function handle(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setShowTypePicker(false);
      }
    }
    if (showTypePicker) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showTypePicker, isMobile]);

  return (
    <>
    <div
      // Outer wrapper exists solely to host the drop-indicator lines above
      // and below without disturbing the card's own layout / shadow.
      style={{
        position: "relative",
        // Slightly more top padding when a drag handle is visible so the
        // handle has a clear margin above the card body.
        paddingTop: draggable ? 8 : 0,
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drop indicator — a blue line that shows where the dragged card will
          land when released. */}
      {dropIndicator === "above" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -2,
            left: 0,
            right: 0,
            height: 3,
          backgroundColor: "var(--color-accent)",
          borderRadius: 2,
          boxShadow: "0 0 0 2px rgba(245,95,0,0.20)",
          pointerEvents: "none",
        }}
      />
      )}
      {dropIndicator === "below" && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: -5,
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: "var(--color-accent)",
            borderRadius: 2,
            boxShadow: "0 0 0 2px rgba(245,95,0,0.20)",
            pointerEvents: "none",
          }}
        />
      )}

      <div
        ref={cardRef}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!cardRef.current?.contains(e.relatedTarget as Node)) setFocused(false);
        }}
        style={{
          position: "relative",
          backgroundColor: "var(--color-surface)",
          borderRadius: 10,
          boxShadow: hasError
            ? "var(--shadow-card), 0 0 0 1.5px var(--red-100)"
            : "var(--shadow-card)",
          borderLeft: `4px solid ${hasError ? "var(--color-error)" : focused ? "var(--color-accent)" : "transparent"}`,
          transition: "border-color 0.15s, opacity 0.15s",
          opacity: isDragging ? 0.4 : 1,
        }}
      >
        {draggable && <DragHandle />}
        {/* Question number — top-right corner, clear of the type dropdown */}
        <span
          aria-label={`Question ${displayNumber ?? index + 1}${total != null ? ` of ${total}` : ""}`}
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--color-text-disabled)",
            letterSpacing: "var(--tracking-label)",
            pointerEvents: "none",
            userSelect: "none",
            padding: "2px 6px",
            backgroundColor: "var(--color-surface-sunken)",
            borderRadius: 4,
          }}
        >
          {displayNumber ?? `${index + 1}${total != null ? ` / ${total}` : ""}`}
        </span>

        {/* ── Card body ──
            Mobile-first: 14 px horizontal so nested amber strips etc.
            can bleed to the card edges with `-14` margins without
            needing to know a per-breakpoint padding value. The CSS
            class `fb-question-body` bumps to 18 px on desktop where
            there's room for breathing. See
            `.cursor/rules/mobile-density.mdc` rule 5. */}
        <div
          className="fb-question-body"
          style={{ padding: draggable ? "44px 14px 0" : "38px 14px 0" }}
        >

        {/* Row 1: question input + type dropdown */}
        <div className="fb-question-top-row" style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 4 }}>

          {/* Question title — grow-wrap auto-resize */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="textarea-grow-wrap" data-value={question.title || t("questionPlaceholder", { n: displayNumber ?? index + 1 })}>
              <textarea
                value={question.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder={t("questionPlaceholder", { n: displayNumber ?? index + 1 })}
                rows={1}
                className="no-focus-ring"
                style={{
                  width: "100%",
                  border: "none",
                  borderBottom: "none",
                  outline: "none",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  backgroundColor: hasError && !question.title.trim()
                    ? "var(--color-error-subtle)"
                    : "var(--color-surface-sunken)",
                  fontFamily: "inherit",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  boxSizing: "border-box",
                  lineHeight: 1.5,
                  transition: "border-color 0.15s, background-color 0.15s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-surface)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.backgroundColor =
                    hasError && !question.title.trim()
                      ? "var(--color-error-subtle)"
                      : "var(--color-surface-sunken)";
                }}
              />
            </div>
            {/* Inline validation errors */}
            {hasError && errorMessages.length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
                {errorMessages.map((msg, i) => (
                  <li
                    key={i}
                    role="alert"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--color-error)",
                    }}
                  >
                    <AlertTriangle size={12} aria-hidden />
                    {msg}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Type picker trigger */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setShowTypePicker((v) => !v)}
              className="fb-type-dropdown-btn"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                backgroundColor: "var(--color-surface-sunken)",
                color: "var(--color-text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                minWidth: 170,
                justifyContent: "space-between",
              }}
            >
              <span>{RESPONSE_META[question.responseType].label}</span>
              <ChevronDown
                size={15}
                aria-hidden
                style={{
                  transform: showTypePicker && !isMobile ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s",
                  color: "var(--neutral-400)",
                }}
              />
            </button>

            {/* Desktop dropdown */}
            {showTypePicker && !isMobile && (
              <div
                className="fb-type-dropdown-menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  zIndex: 20,
                  backgroundColor: "var(--color-surface)",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-modal)",
                  minWidth: 200,
                  overflow: "hidden",
                  padding: "6px 0",
                }}
              >
                <TypeOptionList
                  current={question.responseType}
                  types={allowedResponseTypes}
                  onSelect={(type) => { update({ responseType: type }); setShowTypePicker(false); }}
                />
              </div>
            )}
          </div>

          {/* Mobile bottom sheet — portaled to body */}
          {showTypePicker && isMobile && typeof document !== "undefined" && createPortal(
            <>
              {/* Backdrop */}
              <div
                onClick={() => setShowTypePicker(false)}
                style={{
                  position: "fixed", inset: 0, zIndex: 50,
                  backgroundColor: "rgba(16,18,43,0.35)",
                }}
              />
              {/* Sheet */}
              <div
                style={{
                  position: "fixed", bottom: 0, left: 0, right: 0,
                  zIndex: 51,
                  backgroundColor: "var(--color-surface)",
                  borderRadius: "16px 16px 0 0",
                  boxShadow: "var(--shadow-modal)",
                  padding: "0 0 32px",
                  animation: "slideUp 0.22s ease",
                }}
              >
                {/* Handle */}
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
                  <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "var(--color-divider)" }} />
                </div>
                {/* Title row */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 20px 12px",
                  borderBottom: "1px solid var(--color-divider)",
                }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
                    {t("questionTypePicker")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTypePicker(false)}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--neutral-400)", display: "flex", padding: 4 }}
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>
                <TypeOptionList
                  current={question.responseType}
                  types={allowedResponseTypes}
                  onSelect={(type) => { update({ responseType: type }); setShowTypePicker(false); }}
                  mobile
                />
              </div>
            </>,
            document.body
          )}
        </div>


        {/* Answer area */}
        <AnswerArea
          question={question}
          onChange={(opts) => update({ options: opts })}
        />

        {/* Spacing before footer */}
        <div style={{ height: 14 }} />
      </div>

      {/* ── Card footer ──
          Mobile-first padding (matches card body horizontal). The
          CSS class bumps it up on desktop. */}
      <div
        className="fb-question-footer"
        style={{
          borderTop: "1px solid var(--color-divider)",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Toggles */}
        <Toggle
          on={question.required}
          onChange={(v) => update({ required: v })}
          label={t("requiredToggle")}
        />
        {question.responseType === "PASS_FAIL_DEFICIENCIES" ? (
          <>
            <Toggle
              on={question.deficiencyDescriptionEnabled ?? true}
              onChange={(v) => update({ deficiencyDescriptionEnabled: v })}
              label={t("deficiencyDescriptionToggle")}
            />
            <Toggle
              on={question.deficiencyPhotoRequired ?? false}
              onChange={(v) => update({ deficiencyPhotoRequired: v })}
              label={t("deficiencyPhotoRequiredToggle")}
            />
            <Toggle
              on={allowsAdditionalDeficiencies(question)}
              onChange={(v) => update({ allowAdditionalDeficiencies: v })}
              label={t("allowAdditionalDeficienciesToggle")}
            />
          </>
        ) : (
          <Toggle
            on={question.photoRequired}
            onChange={(v) => update({ photoRequired: v })}
            label={t("photoRequiredToggle")}
          />
        )}

        <Toggle
          on={question.commentsEnabled ?? false}
          onChange={(v) => update({ commentsEnabled: v })}
          label={t("commentsEnabledToggle")}
        />

        {question.responseType === "YES_NO" && (
          <Toggle
            on={Boolean(question.showNotApplicable)}
            onChange={(v) => update({ showNotApplicable: v })}
            label={t("showNotApplicableToggle")}
          />
        )}

        {/* Follow-up questions — YES_NO and PASS_FAIL */}
        <div style={{ flex: 1 }} />

        {/* Divider */}
        <div style={{ width: 1, height: 20, backgroundColor: "var(--color-divider)" }} />

        {/* Duplicate — only shown in flat-list mode */}
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            title={t("duplicateQuestion")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 6,
              border: "none", backgroundColor: "transparent",
              color: "var(--color-text-disabled)", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-surface-sunken)"; e.currentTarget.style.color = "var(--color-text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--color-text-disabled)"; }}
          >
            <Copy size={15} aria-hidden />
          </button>
        )}

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          title={t("deleteQuestion")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, borderRadius: 6,
            border: "none", backgroundColor: "transparent",
            color: "var(--color-text-disabled)", cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-error-subtle)"; e.currentTarget.style.color = "var(--color-error)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--color-text-disabled)"; }}
        >
          <Trash2 size={15} aria-hidden />
        </button>
      </div>
      </div>
    </div>

    {(question.responseType === "YES_NO" || question.responseType === "PASS_FAIL") && (
      <div style={{ marginTop: 8, paddingLeft: 4, display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--color-text-secondary)",
            letterSpacing: "var(--tracking-label)",
            textTransform: "uppercase",
          }}
        >
          {t("followUpSectionTitle")}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {followUpTriggersForResponseType(question.responseType).map((trigger) => {
            const enabled = Boolean(getChoiceFollowUps(question)[trigger]);
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
              <Toggle
                key={trigger}
                on={enabled}
                onChange={(v) => {
                  if (v) {
                    update(
                      patchChoiceFollowUp(
                        question,
                        trigger,
                        newFollowUpQuestion(question.id, trigger),
                      ),
                    );
                  } else {
                    update(patchChoiceFollowUp(question, trigger, undefined));
                  }
                }}
                label={t(labelKey)}
              />
            );
          })}
        </div>
      </div>
    )}

    {/* ── Choice follow-up sub-cards ── */}
    {(question.responseType === "YES_NO" || question.responseType === "PASS_FAIL") &&
      followUpTriggersForResponseType(question.responseType).map((trigger) => {
        const followUp = getChoiceFollowUps(question)[trigger];
        if (!followUp || !("id" in followUp)) return null;
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
            key={trigger}
            style={{
              marginTop: 6,
              paddingLeft: 20,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                backgroundColor: "var(--form-deficiency-border)",
                borderRadius: 2,
              }}
            />
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                marginBottom: 6,
                padding: "3px 10px",
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
            <FormQuestionRow
              question={followUp}
              allowedResponseTypes={allowedResponseTypes}
              onChange={(updated) => update(patchChoiceFollowUp(question, trigger, updated))}
              onDelete={() => update(patchChoiceFollowUp(question, trigger, undefined))}
            />
          </div>
        );
      })}
    </>
  );
}
