"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ArrowDown, Trash2, Plus, PlusCircle } from "lucide-react";
import type { FormQuestion } from "./formTypes";
import { FormQuestionRow } from "./FormQuestionRow";
import { useSortableList } from "./useSortableList";

interface FormSectionBlockProps {
  itemNumber: number;
  /**
   * Total number of sections in the form. Used for the "Section N of M"
   * label on the folder tab. Optional — when omitted the label falls back
   * to just "SECTION N".
   */
  total?: number;
  title: string;
  description?: string;
  questions: FormQuestion[];
  isFirst: boolean;
  isLast: boolean;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onQuestionsChange: (questions: FormQuestion[]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onAddQuestion: () => void;
  /** Insert a new blank section immediately before this one. */
  onInsertBefore?: () => void;
  /**
   * Whether to render the in-section "Add question" button at the bottom
   * of this section. Defaults to true. Set to false when the caller is
   * rendering a shared inline "Add question / Add section" footer at the
   * form level instead (see FormBuilderClient's sectioned-mode layout).
   */
  showAddQuestionButton?: boolean;
  /** Set of question ids that failed validation — passed through to each row. */
  invalidQuestionIds?: Set<string>;
  /** Per-question error messages keyed by question id. */
  questionErrorMessages?: Map<string, string[]>;
  /** Limits question-type picker for documentation forms. */
  allowedResponseTypes?: import("./formTypes").ResponseType[];
  /**
   * When true, suppress the folder-tab and header card entirely.
   * Used for untitled "preamble" sections that should look like
   * free-floating questions before Section 1.
   */
  hideHeader?: boolean;
}

export function FormSectionBlock({
  itemNumber,
  total,
  title,
  description = "",
  questions,
  isFirst,
  isLast,
  onTitleChange,
  onDescriptionChange,
  onQuestionsChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  onAddQuestion,
  onInsertBefore,
  showAddQuestionButton = true,
  invalidQuestionIds,
  questionErrorMessages,
  allowedResponseTypes,
  hideHeader = false,
}: FormSectionBlockProps) {
  const t = useTranslations("forms.builder");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow both textareas to fit their content — no scrollbar, no clipping.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  const moveQuestion = useCallback(
    (from: number, to: number) => {
      const next = [...questions];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onQuestionsChange(next);
    },
    [questions, onQuestionsChange],
  );

  const sortable = useSortableList(questions.length, moveQuestion);

  function updateQuestion(index: number, updated: FormQuestion) {
    const next = [...questions];
    next[index] = updated;
    onQuestionsChange(next);
  }

  function deleteQuestion(index: number) {
    onQuestionsChange(questions.filter((_, i) => i !== index));
  }

  const sectionLabel = total
    ? t("sectionLabelOf", { n: itemNumber, total })
    : t("sectionLabel", { n: itemNumber });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* ── Folder-tab section header ── */}
      {!hideHeader && <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
        }}
      >
        {/* Tab — sits above the card, hugs the top-left. Filled with the
            same primary blue that the form-header top-stripe uses so it
            reads as a section marker, not a button. */}
        <div
          style={{
            alignSelf: "flex-start",
            backgroundColor: "var(--form-builder-section-tab-bg)",
            color: "var(--color-text-inverse)",
            padding: "5px 14px",
            borderRadius: "6px 6px 0 0",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "var(--tracking-label)",
            textTransform: "uppercase",
            lineHeight: 1.4,
            userSelect: "none",
          }}
        >
          {sectionLabel}
        </div>

        {/* Header card — the title, description, and action buttons live here. */}
        <div
          className="fb-section-header-card"
          style={{
            backgroundColor: "var(--color-surface)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            padding: "10px 12px",
          }}
        >
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => {
                onTitleChange(e.target.value);
              }}
              placeholder={t("untitledSection")}
              rows={1}
              className="no-focus-ring"
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                resize: "none",
                overflow: "hidden",
                fontSize: 20,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                backgroundColor: "transparent",
                fontFamily: "inherit",
                padding: "2px 0",
                lineHeight: 1.4,
              }}
            />

            {/* Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
              {onInsertBefore && (
                <IconButton
                  icon={PlusCircle}
                  onClick={onInsertBefore}
                  label={t("insertSectionAbove")}
                />
              )}
              <IconButton
                icon={ArrowUp}
                onClick={onMoveUp}
                disabled={isFirst}
                label={t("moveSectionUp")}
              />
              <IconButton
                icon={ArrowDown}
                onClick={onMoveDown}
                disabled={isLast}
                label={t("moveSectionDown")}
              />
              <IconButton
                icon={Trash2}
                onClick={onDelete}
                label={t("deleteSection")}
                variant="danger"
              />
            </div>
          </div>

          {/* Description — always visible, placeholder collapses it visually */}
          <textarea
            ref={descRef}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder={t("sectionDescriptionPlaceholder")}
            rows={1}
            className="no-focus-ring"
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              marginTop: 4,
              border: "none",
              outline: "none",
              resize: "none",
              overflow: "hidden",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--color-text-tertiary)",
              backgroundColor: "transparent",
              fontFamily: "inherit",
              padding: "2px 0",
              lineHeight: 1.5,
            }}
          />
        </div>
      </div>}

      {/* ── Questions ── */}
      {questions.map((q, i) => (
        <div key={q.id} id={`question-${q.id}`}>
          <FormQuestionRow
            question={q}
            allowedResponseTypes={allowedResponseTypes}
            number={hideHeader ? String(i + 1) : `${itemNumber}.${i + 1}`}
            isFirst={i === 0}
            isLast={i === questions.length - 1}
            onChange={(updated) => updateQuestion(i, updated)}
            onMoveUp={() => moveQuestion(i, i - 1)}
            onMoveDown={() => moveQuestion(i, i + 1)}
            onDelete={() => deleteQuestion(i)}
            hasError={invalidQuestionIds?.has(q.id) ?? false}
            errorMessages={questionErrorMessages?.get(q.id) ?? []}
            {...sortable.getDragProps(i)}
          />
        </div>
      ))}

      {showAddQuestionButton && (
        <button
          type="button"
          onClick={onAddQuestion}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "11px 18px",
            borderRadius: "var(--radius-lg)",
            border: "1.5px solid var(--color-accent)",
            backgroundColor: "var(--color-accent-subtle)",
            color: "var(--color-accent)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "var(--tracking-ui)",
            cursor: "pointer",
            width: "100%",
            fontFamily: "inherit",
            transition: "background-color 0.12s, border-color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-accent-muted)";
            e.currentTarget.style.borderColor = "var(--color-accent-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-accent-subtle)";
            e.currentTarget.style.borderColor = "var(--color-accent)";
          }}
        >
          <Plus size={15} aria-hidden />
          {t("addQuestion")}
        </button>
      )}
    </div>
  );
}

// ── Internal helper ───────────────────────────────────────────────────────────

type IconComponent = typeof ArrowUp;

function IconButton({
  icon: Icon,
  onClick,
  disabled,
  label,
  variant = "default",
}: {
  icon: IconComponent;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  variant?: "default" | "danger";
}) {
  const isDanger = variant === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 30,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        border: "none",
        backgroundColor: "transparent",
        color: disabled ? "var(--neutral-300)" : "var(--neutral-500)",
        cursor: disabled ? "default" : "pointer",
        transition: "background-color 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (isDanger) {
          e.currentTarget.style.backgroundColor = "var(--error-50)";
          e.currentTarget.style.color = "var(--error-600)";
        } else {
          e.currentTarget.style.backgroundColor = "var(--neutral-100)";
          e.currentTarget.style.color = "var(--neutral-800)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = disabled
          ? "var(--neutral-300)"
          : "var(--neutral-500)";
      }}
    >
      <Icon size={15} aria-hidden />
    </button>
  );
}
