"use client";

/**
 * InspectionRecordClient — read-only inspection report view.
 *
 * Renders the answers captured at inspection time as a clean report,
 * NOT as an editable form. Every question shows its logged answer;
 * pass/fail questions show a labelled readout block (not pill-shaped); failed questions
 * list each deficiency with description, severity, and photo indicator.
 *
 * Designed to replace FormFillClient in readonly mode — the fill client
 * still looks like an open form, which confuses inspectors into thinking
 * they can change results. This component makes it unmistakably a record.
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, XCircle, Star, StickyNote, Paperclip, ChevronLeft, ChevronRight, Mic, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AnswersMap } from "@/components/forms/FormFillClient";
import { activeFollowUpEntries, readFollowUpAnswer } from "@/lib/forms/choice-follow-ups";
import type {
  CapturedMediaItem,
  FormQuestion,
  FormSection,
  FormTemplate,
} from "@/components/forms/formTypes";
import { AUTO_NOTES_KEY, AUTO_MEDIA_KEY } from "@/components/forms/formTypes";
import { isDocumentationForm } from "@/lib/forms/form-purpose-rules";
import {
  sectionDeficiencyOccurrences,
  sectionHasScoredQuestions,
  sectionIsFailed,
  sectionTitleLabel,
  dedupeCategoryHeaderStatus,
  questionIsFailed,
  questionIsPassed,
  isNotApplicableChoice,
} from "./inspectionRecordDisplay";
import {
  InspectionReportCategory,
  InspectionReportCategoryBody,
  InspectionReportCategoryHeader,
  InspectionReportQuestionBlock,
  InspectionReportDeficiencyList,
} from "./InspectionReportLayout";
import {
  InspectionReportDeficiencyRows,
  InspectionReportResolvedHeading,
} from "./InspectionReportDeficiency";

// ── Main component ────────────────────────────────────────────────────────────

export function InspectionRecordClient({
  template,
  answers,
  onClose,
  hideToolbar = false,
}: {
  template: FormTemplate;
  answers: AnswersMap;
  onClose: () => void;
  /** When true, suppresses the built-in sticky toolbar (caller renders one above). */
  hideToolbar?: boolean;
}) {
  const t = useTranslations("inspections");
  const tCommon = useTranslations("common");
  const isDocumentation = isDocumentationForm(template);
  // Flatten sections → questions, skipping empty sections.
  // Guard against malformed/legacy snapshots where sections may be absent.
  const sections = (template.sections ?? []).filter((s) => s.questions.length > 0);
  const bare = sections.length === 1 && !sections[0].title.trim();

  return (
    <div className="inspection-record">
      {/* Toolbar — suppressed when parent wants to render it above the header */}
      {!hideToolbar && (
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          backgroundColor: "#fff",
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
      )}

      {/* Questions */}
      <div className="inspection-record__body">
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            answers={answers}
            showHeader={!bare}
            isDocumentation={isDocumentation}
          />
        ))}

        {/* Auto-section: inspector notes & media (only shown if captured) */}
        <AutoNotesRecord
          notes={answers[AUTO_NOTES_KEY]?.text}
          capturedFiles={answers[AUTO_MEDIA_KEY]?.capturedFiles}
        />
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  answers,
  showHeader,
  isDocumentation,
}: {
  section: FormSection;
  answers: AnswersMap;
  showHeader: boolean;
  isDocumentation: boolean;
}) {
  const t = useTranslations("inspections");

  const scoredSection = !isDocumentation && sectionHasScoredQuestions(section);
  const titleLabel = sectionTitleLabel(section);
  const totalDeficiencyOccurrences = sectionDeficiencyOccurrences(section, answers);
  const sectionFailed = scoredSection && sectionIsFailed(section, answers);

  const failedQuestions = section.questions.filter((q) =>
    questionIsFailed(q, answers[q.id]),
  );
  const passedQuestions = section.questions.filter((q) =>
    questionIsPassed(q, answers[q.id]),
  );
  const otherQuestions = section.questions.filter(
    (q) =>
      !questionIsFailed(q, answers[q.id]) &&
      !questionIsPassed(q, answers[q.id]),
  );

  const tone = sectionFailed ? "fail" : scoredSection ? "pass" : "neutral";
  const statusLabel = sectionFailed
    ? totalDeficiencyOccurrences > 0
      ? t("deficiencyCountDisplay", { count: totalDeficiencyOccurrences })
      : t("failLabel")
    : scoredSection
      ? t("passLabel")
      : "";

  const showCategoryHeader = showHeader && Boolean(titleLabel || scoredSection);
  const soleScoredQuestion =
    failedQuestions.length + passedQuestions.length === 1 &&
    otherQuestions.length === 0;
  const soleScoredQuestionRecord = failedQuestions[0] ?? passedQuestions[0];
  const headerOutcome =
    showCategoryHeader &&
    titleLabel &&
    soleScoredQuestion &&
    soleScoredQuestionRecord
      ? answerOutcomeReadout(
          soleScoredQuestionRecord,
          answers[soleScoredQuestionRecord.id],
          t,
          isDocumentation,
        )
      : undefined;

  const isOutcomeHoistedFor = (questionId: string) =>
    Boolean(
      headerOutcome &&
        soleScoredQuestion &&
        soleScoredQuestionRecord?.id === questionId,
    );

  if (!showCategoryHeader && failedQuestions.length === 0 && passedQuestions.length === 0) {
    return (
      <div className="inspection-report-category inspection-report-category--neutral">
        <InspectionReportCategoryBody>
          {otherQuestions.map((q) => (
            <QuestionRecord
              key={q.id}
              question={q}
              answer={answers[q.id]}
              answers={answers}
              isDocumentation={isDocumentation}
            />
          ))}
        </InspectionReportCategoryBody>
      </div>
    );
  }

  return (
    <InspectionReportCategory tone={tone}>
      {showCategoryHeader && titleLabel && (
        <InspectionReportCategoryHeader
          tone={tone}
          title={titleLabel}
          status={dedupeCategoryHeaderStatus(
            statusLabel,
            Boolean(headerOutcome),
            t("passLabel"),
            t("failLabel"),
          )}
          outcome={headerOutcome}
        />
      )}
      {showCategoryHeader && !titleLabel && scoredSection && (
        <InspectionReportCategoryHeader tone={tone} title={t("recordTitle")} status={statusLabel} />
      )}
      {section.description?.trim() && showCategoryHeader && (
        <p className="inspection-record-section__description">{section.description}</p>
      )}
      <InspectionReportCategoryBody>
        {failedQuestions.map((q) => (
          <QuestionRecord
            key={q.id}
            question={q}
            answer={answers[q.id]}
            answers={answers}
            isDocumentation={isDocumentation}
            showOutcome={!isOutcomeHoistedFor(q.id)}
            suppressReadout={isOutcomeHoistedFor(q.id)}
          />
        ))}
        {otherQuestions.map((q) => (
          <QuestionRecord
            key={q.id}
            question={q}
            answer={answers[q.id]}
            answers={answers}
            isDocumentation={isDocumentation}
          />
        ))}
        {passedQuestions.map((q) => (
          <QuestionRecord
            key={q.id}
            question={q}
            answer={answers[q.id]}
            answers={answers}
            isDocumentation={isDocumentation}
            showOutcome={!isOutcomeHoistedFor(q.id)}
            suppressReadout={isOutcomeHoistedFor(q.id)}
            compactTitle={Boolean(titleLabel)}
          />
        ))}
      </InspectionReportCategoryBody>
    </InspectionReportCategory>
  );
}

// ── Question row ──────────────────────────────────────────────────────────────

function QuestionRecord({
  question,
  answer,
  answers,
  showOutcome = true,
  suppressReadout = false,
  compactTitle = false,
  isDocumentation = false,
}: {
  question: FormQuestion;
  answer: AnswersMap[string] | undefined;
  answers: AnswersMap;
  showOutcome?: boolean;
  suppressReadout?: boolean;
  compactTitle?: boolean;
  isDocumentation?: boolean;
}) {
  const t = useTranslations("inspections");
  const tFill = useTranslations("forms.fill");
  const title =
    question.title || (
      <span style={{ color: "var(--neutral-400)", fontStyle: "italic" }}>{t("untitledQuestion")}</span>
    );

  const followUpEntries = activeFollowUpEntries(question, answer?.choice);
  const outcome =
    showOutcome ? answerOutcomeReadout(question, answer, t, isDocumentation) : undefined;

  return (
    <InspectionReportQuestionBlock
      title={title}
      required={question.required}
      outcome={outcome}
      compactTitle={compactTitle}
    >
      <AnswerDisplay
        question={question}
        answer={answer}
        omitReadout={Boolean(outcome) || suppressReadout}
        isDocumentation={isDocumentation}
      />
      {answer?.capturedFiles && answer.capturedFiles.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <ClickableMediaStrip files={answer.capturedFiles} />
        </div>
      )}
      {answer?.comment?.trim() && (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--neutral-700)",
            whiteSpace: "pre-wrap",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--neutral-500)" }}>
            {tFill("questionCommentLabel")}:{" "}
          </span>
          {answer.comment.trim()}
        </p>
      )}
      {followUpEntries.map(({ trigger, followUp, payloadKey }) => {
        const followUpAnswer =
          readFollowUpAnswer(answers, question.id, trigger) ?? answers[payloadKey];
        if (!followUpAnswer) return null;
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
          <div key={payloadKey} className="inspection-record-followup">
            <span className="inspection-record-deficiency__count">{tFill(labelKey)}</span>
            <div style={{ marginTop: 8 }}>
              <QuestionRecord
                question={followUp}
                answer={followUpAnswer}
                answers={answers}
                showOutcome={false}
                isDocumentation={isDocumentation}
              />
            </div>
          </div>
        );
      })}
    </InspectionReportQuestionBlock>
  );
}

// ── Answer display (type-specific) ───────────────────────────────────────────

function answerOutcomeReadout(
  question: FormQuestion,
  answer: AnswersMap[string] | undefined,
  t: ReturnType<typeof useTranslations<"inspections">>,
  isDocumentation = false,
) {
  const { responseType } = question;
  if (!answer || answer.choice === undefined) return undefined;

  if (responseType === "PASS_FAIL" || responseType === "YES_NO") {
    const passed = answer.choice === "pass" || answer.choice === "yes";
    const na = isNotApplicableChoice(answer.choice);
    const label =
      na
        ? t("naLabel")
        : answer.choice === "yes"
          ? t("yesLabel")
          : answer.choice === "no"
            ? t("noLabel")
            : passed
              ? t("passLabel")
              : t("failLabel");
    return (
      <RecordedAnswerReadout
        label={label}
        passed={isDocumentation || na ? null : passed}
      />
    );
  }

  if (responseType === "PASS_FAIL_DEFICIENCIES") {
    const na = isNotApplicableChoice(answer.choice);
    const passed = answer.choice === "pass";
    const label = na ? t("naLabel") : passed ? t("passLabel") : t("failLabel");
    return (
      <RecordedAnswerReadout
        label={label}
        passed={isDocumentation || na ? null : passed}
      />
    );
  }

  return undefined;
}

function AnswerDisplay({
  question,
  answer,
  omitReadout = false,
  isDocumentation = false,
}: {
  question: FormQuestion;
  answer: AnswersMap[string] | undefined;
  omitReadout?: boolean;
  isDocumentation?: boolean;
}) {
  const t = useTranslations("inspections");
  const { responseType } = question;

  if (!answer || (answer.choice === undefined && !answer.text && !answer.choices?.length && !answer.rating && !(answer.number && answer.number.trim().length > 0))) {
    return (
      <span style={{ fontSize: 13, color: "var(--neutral-350)", fontStyle: "italic" }}>
        {t("notAnswered")}
      </span>
    );
  }

  // Pass / Fail (no deficiency capture)
  if (responseType === "PASS_FAIL" || responseType === "YES_NO") {
    const passed = answer.choice === "pass" || answer.choice === "yes";
    const na = isNotApplicableChoice(answer.choice);
    const label =
      na
        ? t("naLabel")
        : answer.choice === "yes"
          ? t("yesLabel")
          : answer.choice === "no"
            ? t("noLabel")
            : passed
              ? t("passLabel")
              : t("failLabel");
    return (
      <div>
        {!omitReadout && (
          <RecordedAnswerReadout
            label={label}
            passed={isDocumentation || na ? null : passed}
          />
        )}
        {answer.resolvedDeficiencies && answer.resolvedDeficiencies.length > 0 && (
          <>
            <InspectionReportResolvedHeading />
            <InspectionReportDeficiencyList>
              <InspectionReportDeficiencyRows
                deficiencies={answer.resolvedDeficiencies}
                variant="resolved"
              />
            </InspectionReportDeficiencyList>
          </>
        )}
      </div>
    );
  }

  // Pass / Fail with deficiencies
  if (responseType === "PASS_FAIL_DEFICIENCIES") {
    if (answer.choice === undefined) {
      if (answer.deficiencies?.length) {
        return (
          <InspectionReportDeficiencyList>
            <InspectionReportDeficiencyRows deficiencies={answer.deficiencies} />
          </InspectionReportDeficiencyList>
        );
      }
      if (answer.capturedFiles?.length) {
        return null;
      }
      return (
        <span style={{ fontSize: 13, color: "var(--neutral-350)", fontStyle: "italic" }}>
          {t("notAnswered")}
        </span>
      );
    }
    const passed = answer.choice === "pass";
    const na = isNotApplicableChoice(answer.choice);
    return (
      <div>
        {!omitReadout && (
          <RecordedAnswerReadout
            label={na ? t("naLabel") : passed ? t("passLabel") : t("failLabel")}
            passed={isDocumentation || na ? null : passed}
          />
        )}
        {!passed && !na && answer.deficiencies && answer.deficiencies.length > 0 && (
          <InspectionReportDeficiencyList>
            <InspectionReportDeficiencyRows deficiencies={answer.deficiencies} />
          </InspectionReportDeficiencyList>
        )}
        {answer.resolvedDeficiencies && answer.resolvedDeficiencies.length > 0 && (
          <>
            <InspectionReportResolvedHeading />
            <InspectionReportDeficiencyList>
              <InspectionReportDeficiencyRows
                deficiencies={answer.resolvedDeficiencies}
                variant="resolved"
              />
            </InspectionReportDeficiencyList>
          </>
        )}
      </div>
    );
  }

  // Text answers
  if (responseType === "SHORT_ANSWER" || responseType === "PARAGRAPH") {
    return (
      <span style={{ fontSize: "var(--text-caption)", color: "var(--color-text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap", fontWeight: "var(--font-weight-semibold)" }}>
        {answer.text || <span style={{ color: "var(--neutral-350)", fontStyle: "italic" }}>{t("noAnswer")}</span>}
      </span>
    );
  }

  // Number
  if (responseType === "NUMBER") {
    const display =
      answer.number && answer.number.trim().length > 0
        ? answer.number
        : answer.text && answer.text.trim().length > 0
          ? answer.text
          : null;
    return (
      <span style={{ fontSize: 13, color: "var(--neutral-800)", fontWeight: 600 }}>
        {display ?? t("emptyAnswerDash")}
      </span>
    );
  }

  // Multiple choice / checkboxes — plain text list, not pill buttons
  if (responseType === "MULTIPLE_CHOICE") {
    return (
      <RecordedPlainValue>{String(answer.choice ?? "—")}</RecordedPlainValue>
    );
  }

  if (responseType === "CHECKBOXES") {
    const selected = answer.choices ?? [];
    if (selected.length === 0) return <span style={{ fontSize: 13, color: "var(--neutral-350)", fontStyle: "italic" }}>{t("noneSelected")}</span>;
    return (
      <RecordedPlainValue>{selected.join(", ")}</RecordedPlainValue>
    );
  }

  // Rating
  if (responseType === "RATING") {
    const r = answer.rating ?? 0;
    return (
      <div style={{ display: "flex", gap: 3 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={18}
            aria-hidden
            style={{
              color: n <= r ? "var(--warning-500, #f59e0b)" : "var(--neutral-200)",
              fill: n <= r ? "var(--warning-500, #f59e0b)" : "none",
            }}
          />
        ))}
        <span style={{ fontSize: 12, color: "var(--neutral-500)", marginLeft: 4, alignSelf: "center" }}>
          {t("starRatingScore", { count: r })}
        </span>
      </div>
    );
  }

  return null;
}

// ── Small UI pieces ───────────────────────────────────────────────────────────

export function RecordedAnswerReadout({
  label,
  passed,
  variant = "label",
}: {
  label: string;
  passed: boolean | null;
  /** label = static status chip (default); pill = larger readout with icon */
  variant?: "label" | "pill";
}) {
  const stateClass =
    passed === null
      ? "neutral"
      : passed
        ? "pass"
        : "fail";

  if (variant === "label") {
    return (
      <span
        role="status"
        className={`inspection-status-label inspection-status-label--${stateClass}`}
      >
        {passed !== null && (
          <span className="inspection-status-label__dot" aria-hidden />
        )}
        {label}
      </span>
    );
  }

  return (
    <div className={`inspection-record-answer inspection-record-answer--${stateClass}`}>
      {passed !== null &&
        (passed ? (
          <CheckCircle2 size={16} aria-hidden style={{ flexShrink: 0 }} />
        ) : (
          <XCircle size={16} aria-hidden style={{ flexShrink: 0 }} />
        ))}
      <span>{label}</span>
    </div>
  );
}

function RecordedPlainValue({ children }: { children: ReactNode }) {
  return (
    <div className="inspection-record-plain">
      {children}
    </div>
  );
}

// ── Media lightbox ────────────────────────────────────────────────────────────

/**
 * Full-screen lightbox for browsing captured media items. Rendered into a
 * portal at z-index 700 (above the inspection record overlay at 300). Supports
 * keyboard Escape + arrow-key navigation and tap/click on the backdrop to close.
 */
function MediaLightbox({
  items,
  initialIndex,
  onClose,
}: {
  items: CapturedMediaItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const item = items[idx];
  const isVideo = item?.mimeType.startsWith("video/");
  const isAudio = item?.mimeType.startsWith("audio/");
  const hasPrev = idx > 0;
  const hasNext = idx < items.length - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft" && hasPrev) setIdx((i) => i - 1);
      if (e.key === "ArrowRight" && hasNext) setIdx((i) => i + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, hasPrev, hasNext]);

  if (typeof document === "undefined" || !item) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 700,
        backgroundColor: "rgba(0,0,0,0.93)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Prev */}
      {hasPrev && (
        <button
          type="button"
          aria-label="Previous"
          onClick={(e) => { e.stopPropagation(); setIdx((i) => i - 1); }}
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "none",
            backgroundColor: "rgba(255,255,255,0.15)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft size={22} />
        </button>
      )}

      {/* Media */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "90vw",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        {isAudio ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Mic size={56} color="#fff" aria-hidden />
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={item.serverUrl ?? item.localUrl} controls style={{ width: 280 }} />
          </div>
        ) : isVideo ? (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <video
            src={item.serverUrl ?? item.localUrl}
            controls
            autoPlay
            style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 8 }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.serverUrl ?? item.localUrl}
            alt=""
            style={{
              maxWidth: "90vw",
              maxHeight: "80vh",
              objectFit: "contain",
              borderRadius: 8,
              display: "block",
            }}
          />
        )}

        {/* Counter */}
        {items.length > 1 && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            {idx + 1} / {items.length}
          </span>
        )}
      </div>

      {/* Next */}
      {hasNext && (
        <button
          type="button"
          aria-label="Next"
          onClick={(e) => { e.stopPropagation(); setIdx((i) => i + 1); }}
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "none",
            backgroundColor: "rgba(255,255,255,0.15)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Close */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "none",
          backgroundColor: "rgba(255,255,255,0.15)",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={18} />
      </button>
    </div>,
    document.body,
  );
}

/**
 * Grid of larger media thumbnails — images/videos are clickable to open the
 * lightbox. Used in AutoNotesRecord and DeficiencyList.
 */
export function ClickableMediaStrip({ files }: { files: CapturedMediaItem[] }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {files.map((item, i) => {
          const isVideo = item.mimeType.startsWith("video/");
          const isAudio = item.mimeType.startsWith("audio/");
          const isClickable = !isAudio; // audio uses inline player, not lightbox
          return (
            <button
              key={i}
              type="button"
              onClick={isClickable ? () => setLightboxIdx(i) : undefined}
              disabled={!isClickable}
              aria-label={isClickable ? "View media" : undefined}
              style={{
                position: "relative",
                width: 96,
                height: 96,
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid var(--neutral-200)",
                backgroundColor: "var(--neutral-100)",
                flexShrink: 0,
                cursor: isClickable ? "pointer" : "default",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isAudio ? (
                <Mic size={28} color="var(--neutral-400)" aria-hidden />
              ) : isVideo ? (
                <>
                  <video
                    src={item.serverUrl ?? item.localUrl}
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
                    <Play size={22} color="#fff" aria-hidden />
                  </div>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.serverUrl ?? item.localUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {lightboxIdx !== null && (
        <MediaLightbox
          items={files}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}

// ── Auto-section (notes & media) readonly display ─────────────────────────────

function AutoNotesRecord({
  notes,
  capturedFiles,
}: {
  notes?: string;
  capturedFiles?: CapturedMediaItem[];
}) {
  const hasNotes = Boolean(notes?.trim());
  const hasMedia = Boolean(capturedFiles?.length);
  if (!hasNotes && !hasMedia) return null;

  return (
    <div
      style={{
        borderTop: "1px solid var(--neutral-150)",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--neutral-400)",
          marginBottom: 10,
        }}
      >
        Inspector Notes & Media
      </div>

      {hasNotes && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: hasMedia ? 10 : 0,
          }}
        >
          <StickyNote size={14} color="var(--neutral-400)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "var(--neutral-700)",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {notes}
          </p>
        </div>
      )}

      {hasMedia && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginBottom: 10,
              fontSize: 12,
              color: "var(--neutral-500)",
              fontWeight: 500,
            }}
          >
            <Paperclip size={12} aria-hidden />
            {capturedFiles!.length} {capturedFiles!.length === 1 ? "attachment" : "attachments"}
          </div>
          <ClickableMediaStrip files={capturedFiles!} />
        </div>
      )}
    </div>
  );
}
