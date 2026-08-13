"use client";

/**
 * FeedbackAssistChat — the multi-turn conversational UI for the optional
 * AI-assisted feedback flow. Emits a final structured report via `onFinalReport`
 * which the parent form uses to pre-fill title/description before submit.
 *
 * Never persists anything itself. All persistence happens when the parent
 * `FeedbackModal` posts to `/api/feedback` with the aggregated metadata.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles, Send, CornerDownLeft } from "lucide-react";
import {
  AssistFinalReport,
  AssistQuestion,
  AssistTranscriptEntry,
  AssistTurnResponse,
  AssistVideoRef,
  ASSIST_MAX_TURNS,
} from "@/lib/feedback-assist-schema";

interface FeedbackAssistChatProps {
  sessionId: string;
  feedbackType: "BUG" | "FEATURE_REQUEST";
  initialTitle: string;
  initialDescription: string;
  pageUrl: string | null;
  /**
   * When the session was seeded by a video upload, the first assistant turn
   * has already run on the server. The chat renders the seeded transcript
   * and skips its own initial POST. Subsequent turns still go through
   * `/api/feedback/assist`, with `videoRef` forwarded so Gemini stays grounded.
   */
  initialTranscript?: AssistTranscriptEntry[];
  initialQuestion?: AssistQuestion | null;
  initialRemainingTurns?: number;
  videoRef?: AssistVideoRef | null;
  /** Called once the AI returns a final_report. Transcript includes every turn. */
  onFinalReport: (args: {
    report: AssistFinalReport;
    transcript: AssistTranscriptEntry[];
  }) => void;
  /** User backed out — parent should clear aiAssisted state. */
  onCancel: () => void;
}

type Stage =
  | { kind: "loading" }
  | { kind: "question"; question: AssistQuestion; remainingTurns: number }
  | { kind: "error"; message: string };

export function FeedbackAssistChat({
  sessionId,
  feedbackType,
  initialTitle,
  initialDescription,
  pageUrl,
  initialTranscript,
  initialQuestion,
  initialRemainingTurns,
  videoRef,
  onFinalReport,
  onCancel,
}: FeedbackAssistChatProps) {
  const t = useTranslations("feedback.ai");
  const tCommon = useTranslations("common");

  const seededRef = useRef(
    Boolean(initialTranscript && initialTranscript.length > 0 && initialQuestion),
  );

  const [transcript, setTranscript] = useState<AssistTranscriptEntry[]>(
    () => initialTranscript ?? [],
  );
  const [stage, setStage] = useState<Stage>(() => {
    if (seededRef.current && initialQuestion) {
      return {
        kind: "question",
        question: initialQuestion,
        remainingTurns: initialRemainingTurns ?? ASSIST_MAX_TURNS - 1,
      };
    }
    return { kind: "loading" };
  });
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [customText, setCustomText] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialRequestFired = useRef(seededRef.current);

  const postTurn = useCallback(
    async (nextTranscript: AssistTranscriptEntry[], finalize: boolean) => {
      setStage({ kind: "loading" });
      setFinalizing(finalize);
      try {
        const res = await fetch("/api/feedback/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            initial: {
              feedbackType,
              title: initialTitle,
              description: initialDescription,
              pageUrl,
            },
            transcript: nextTranscript,
            finalize,
            videoRef: videoRef ?? null,
          }),
        });

        if (res.status === 429) {
          setStage({ kind: "error", message: t("rateLimited") });
          return;
        }
        if (res.status === 503) {
          setStage({ kind: "error", message: t("unavailable") });
          return;
        }
        if (!res.ok) {
          setStage({ kind: "error", message: t("turnFailed") });
          return;
        }

        const data = (await res.json()) as AssistTurnResponse;

        if (data.kind === "final_report") {
          onFinalReport({ report: data.report, transcript: nextTranscript });
          return;
        }

        setTranscript((prev) => [
          ...prev,
          { role: "assistant", question: data.question },
        ]);
        setStage({ kind: "question", question: data.question, remainingTurns: data.remainingTurns });
        setSelectedOptions(new Set());
        setCustomText("");
      } catch {
        setStage({ kind: "error", message: t("turnFailed") });
      } finally {
        setFinalizing(false);
      }
    },
    [
      sessionId,
      feedbackType,
      initialTitle,
      initialDescription,
      pageUrl,
      videoRef,
      onFinalReport,
      t,
    ],
  );

  // Kick off the first assistant turn on mount
  useEffect(() => {
    if (initialRequestFired.current) return;
    initialRequestFired.current = true;
    void postTurn([], false);
  }, [postTurn]);

  // Autoscroll transcript. Guard against environments where `scrollTo` is
  // unavailable (jsdom in unit tests, some embedded browsers).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [transcript, stage]);

  const handleToggleOption = (optionId: string, multi: boolean) => {
    setSelectedOptions((prev) => {
      const next = new Set(prev);
      if (multi) {
        if (next.has(optionId)) next.delete(optionId);
        else next.add(optionId);
      } else {
        next.clear();
        next.add(optionId);
      }
      return next;
    });
  };

  const handleSendAnswer = (finalize: boolean) => {
    if (stage.kind !== "question") return;
    const entry: AssistTranscriptEntry = {
      role: "user",
      questionId: stage.question.id,
      selectedOptionIds: Array.from(selectedOptions),
      text: customText.trim(),
    };
    const next = [...transcript, entry];
    setTranscript(next);
    void postTurn(next, finalize);
  };

  const canSend =
    stage.kind === "question" &&
    (selectedOptions.size > 0 || (stage.question.allowCustom && customText.trim().length > 0));

  const canDraftNow = transcript.some((e) => e.role === "user");

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-[var(--primary-200)] bg-[var(--primary-50)] p-3"
      role="group"
      aria-label={t("panelAria")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--primary-700)]">
          <Sparkles size={14} aria-hidden />
          {t("panelTitle")}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-[var(--neutral-600)] underline hover:text-[var(--neutral-900)]"
        >
          {t("cancelAssist")}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1"
        aria-live="polite"
        aria-busy={stage.kind === "loading"}
      >
        {transcript.map((entry, idx) => {
          if (entry.role === "assistant") {
            return (
              <div
                key={`a-${idx}`}
                className="self-start max-w-[85%] rounded-lg border border-[var(--primary-200)] bg-white px-3 py-2 text-sm text-[var(--neutral-900)]"
              >
                <p className="font-medium">{entry.question.text}</p>
                {entry.question.helpText ? (
                  <p className="mt-1 text-xs text-[var(--neutral-500)]">
                    {entry.question.helpText}
                  </p>
                ) : null}
              </div>
            );
          }
          const userOptions = entry.selectedOptionIds
            .map((id) => {
              for (let i = idx - 1; i >= 0; i--) {
                const prev = transcript[i];
                if (prev.role === "assistant" && prev.question.id === entry.questionId) {
                  return prev.question.options.find((o) => o.id === id)?.label ?? id;
                }
              }
              return id;
            })
            .join(", ");
          const userText = [userOptions, entry.text].filter((s) => s && s.length > 0).join(" — ");
          return (
            <div
              key={`u-${idx}`}
              className="self-end max-w-[85%] rounded-lg bg-[var(--primary-600)] px-3 py-2 text-sm text-white"
            >
              {userText || t("userNoAnswer")}
            </div>
          );
        })}

        {stage.kind === "loading" ? (
          <div
            className="self-start flex items-center gap-2 rounded-lg border border-[var(--primary-200)] bg-white px-3 py-2 text-sm text-[var(--neutral-600)]"
            aria-label={t("thinkingAria")}
          >
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {finalizing ? t("draftingReport") : t("thinking")}
          </div>
        ) : null}

        {stage.kind === "error" ? (
          <div
            role="alert"
            className="self-start rounded-lg border border-[var(--error-300)] bg-white px-3 py-2 text-sm text-[var(--error-700)]"
          >
            {stage.message}
          </div>
        ) : null}
      </div>

      {stage.kind === "question" ? (
        <div className="flex flex-col gap-2">
          {stage.question.options.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("optionsAria")}>
              {stage.question.options.map((option) => {
                const active = selectedOptions.has(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleToggleOption(option.id, true)}
                    aria-pressed={active}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-[var(--primary-600)] bg-[var(--primary-600)] text-white"
                        : "border-[var(--neutral-300)] bg-white text-[var(--neutral-700)] hover:bg-[var(--neutral-100)]",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {stage.question.allowCustom ? (
            <div className="flex items-end gap-2">
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder={t("customPlaceholder")}
                rows={2}
                maxLength={2000}
                aria-label={t("customAria")}
                className="w-full rounded-md border border-[var(--neutral-300)] bg-white px-3 py-2 text-sm text-[var(--neutral-900)] placeholder:text-[var(--neutral-500)] focus:border-[var(--primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]/20"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[var(--neutral-600)]">
              {t("turnsLeft", {
                remaining: stage.remainingTurns,
                max: ASSIST_MAX_TURNS,
              })}
            </span>
            <div className="flex items-center gap-1.5">
              {canDraftNow ? (
                <button
                  type="button"
                  onClick={() => handleSendAnswer(true)}
                  disabled={!canSend}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--primary-300)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--primary-700)] hover:bg-[var(--primary-50)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CornerDownLeft size={12} aria-hidden />
                  {t("draftNow")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => handleSendAnswer(false)}
                disabled={!canSend}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--primary-600)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-700)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={12} aria-hidden />
                {t("sendAnswer")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {stage.kind === "error" ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--neutral-300)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--neutral-700)] hover:bg-[var(--neutral-100)]"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void postTurn(transcript, false)}
            className="rounded-md bg-[var(--primary-600)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-700)]"
          >
            {t("retry")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
