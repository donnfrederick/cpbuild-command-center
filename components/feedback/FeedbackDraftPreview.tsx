"use client";

/**
 * Preview panel for an AI-generated feedback draft before applying to the form.
 * Supports calibration (natural-language revisions) and optional screenshot capture.
 */

import React, { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bug,
  Camera,
  Lightbulb,
  Loader2,
  Paperclip,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import type { AssistFinalReport } from "@/lib/feedback-assist-schema";
import { FEEDBACK_SCREENSHOT_FILE_ACCEPT } from "@/lib/feedback/screenshot-upload";

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

export interface FeedbackDraftPreviewProps {
  report: AssistFinalReport;
  calibrationRounds: number;
  calibrating: boolean;
  onApply: (report: AssistFinalReport, screenshot: string | null, screenshotName?: string | null) => void;
  onCalibrate: (instruction: string) => void;
  onClose: () => void;
}

export function FeedbackDraftPreview({
  report,
  calibrationRounds,
  calibrating,
  onApply,
  onCalibrate,
  onClose,
}: FeedbackDraftPreviewProps) {
  const t = useTranslations("feedback");
  const tAi = useTranslations("feedback.ai");
  const tc = useTranslations("common");

  const [calibrateOpen, setCalibrateOpen] = useState(false);
  const [calibrateText, setCalibrateText] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const proactivePrompts = report.proactivePrompts ?? [];
  const showImageSection = Boolean(report.imagePrompt);
  const isBug = report.kind === "BUG";

  const processScreenshotFile = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setScreenshotError(t("screenshotTooLarge"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setScreenshotError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(reader.result as string);
      setScreenshotName(file.name);
    };
    reader.readAsDataURL(file);
  }, [t]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    processScreenshotFile(Array.from(e.target.files ?? []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleScreenshotDropRejected = useCallback(() => {
    setScreenshotError(t("screenshotUnsupportedMime"));
  }, [t]);

  const { dropHandlers } = useFileDrop({
    onFiles: processScreenshotFile,
    onRejected: handleScreenshotDropRejected,
    accept: FEEDBACK_SCREENSHOT_FILE_ACCEPT,
    multiple: false,
    disabled: Boolean(screenshot),
  });

  function removeScreenshot() {
    setScreenshot(null);
    setScreenshotName(null);
    setScreenshotError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCalibrateSubmit() {
    const instruction = calibrateText.trim();
    if (!instruction || calibrating) return;
    onCalibrate(instruction);
    setCalibrateText("");
    setCalibrateOpen(false);
  }

  function handleProactiveChipClick(prompt: string) {
    setCalibrateOpen(true);
    setCalibrateText((prev) => (prev.trim() ? `${prev.trim()}\n${prompt}` : prompt));
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-[var(--primary-200)] bg-[var(--primary-50)] p-3"
      aria-label={tAi("draftPreviewTitle")}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                isBug
                  ? "bg-[var(--error-100)] text-[var(--error-700)]"
                  : "bg-[var(--primary-100)] text-[var(--primary-700)]",
              ].join(" ")}
            >
              {isBug ? <Bug size={12} aria-hidden /> : <Lightbulb size={12} aria-hidden />}
              {isBug ? t("typeBug") : t("typeFeature")}
            </span>
            {calibrationRounds > 0 ? (
              <span className="text-xs font-medium text-[var(--primary-600)]">
                {tAi("calibratedBadge")}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-medium text-[var(--neutral-900)]">{tAi("draftPreviewTitle")}</p>
          <p className="text-xs text-[var(--neutral-600)]">{tAi("draftPreviewSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={calibrating}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--neutral-500)] hover:bg-[var(--neutral-100)] hover:text-[var(--neutral-800)] disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={tAi("closeDraftPreview")}
          title={tAi("closeDraftPreview")}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[var(--neutral-200)] bg-white p-3">
        <h3 className="text-sm font-semibold text-[var(--neutral-900)] leading-snug">
          {report.suggestedTitle}
        </h3>
        <p className="text-sm text-[var(--neutral-700)] whitespace-pre-wrap leading-relaxed">
          {report.suggestedDescription}
        </p>
        {report.summary ? (
          <p className="text-xs text-[var(--neutral-500)] italic">{report.summary}</p>
        ) : null}
      </div>

      {proactivePrompts.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-[var(--neutral-700)]">
            {tAi("proactivePromptsHeading")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {proactivePrompts.map((prompt, index) => (
              <button
                key={`${index}-${prompt}`}
                type="button"
                onClick={() => handleProactiveChipClick(prompt)}
                className="max-w-full rounded-full border border-[var(--neutral-300)] bg-white px-2.5 py-1 text-left text-xs text-[var(--neutral-700)] hover:border-[var(--primary-400)] hover:bg-[var(--primary-50)] transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showImageSection ? (
        <div className="relative flex flex-col gap-2" {...dropHandlers}>
          <p className="text-xs text-[var(--neutral-700)]">{report.imagePrompt}</p>
          {screenshot ? (
            <div className="flex items-center gap-2 rounded-md border border-[var(--neutral-300)] bg-white px-3 py-2">
              <Paperclip size={14} className="shrink-0 text-[var(--neutral-500)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--neutral-700)]">
                {screenshotName}
              </span>
              <button
                type="button"
                onClick={removeScreenshot}
                className="text-[var(--neutral-500)] hover:text-[var(--error-600)] transition-colors"
                aria-label={t("removeScreenshot")}
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={FEEDBACK_SCREENSHOT_FILE_ACCEPT}
                onChange={handleFileChange}
                className="sr-only"
                id="draft-preview-screenshot"
              />
              <label
                htmlFor="draft-preview-screenshot"
                className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--primary-300)] bg-white px-3 py-2 text-sm text-[var(--primary-700)] hover:border-[var(--primary-500)] transition-colors"
              >
                <Camera size={16} className="shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">{t("attachScreenshot")}</span>
              </label>
            </>
          )}
          {screenshotError ? (
            <span className="text-xs text-[var(--error-600)]">{screenshotError}</span>
          ) : null}
          <FileDropOverlay disabled={Boolean(screenshot)} />
        </div>
      ) : null}

      {calibrateOpen ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={calibrateText}
            onChange={(e) => setCalibrateText(e.target.value)}
            placeholder={tAi("calibratePlaceholder")}
            rows={3}
            maxLength={1000}
            disabled={calibrating}
            className={[
              "w-full rounded-md border bg-white px-3 py-2 text-sm text-[var(--neutral-900)]",
              "placeholder:text-[var(--neutral-500)] resize-y outline-none",
              "focus:border-[var(--primary-500)] focus:ring-2 focus:ring-[var(--primary-500)]/20",
              "border-[var(--neutral-300)] disabled:opacity-60",
            ].join(" ")}
            aria-label={tAi("calibratePlaceholder")}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="flex-1"
              disabled={!calibrateText.trim() || calibrating}
              onClick={handleCalibrateSubmit}
            >
              {calibrating ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1" aria-hidden />
                  {tAi("calibrateSubmit")}
                </>
              ) : (
                tAi("calibrateSubmit")
              )}
            </Button>
            <button
              type="button"
              onClick={() => {
                setCalibrateOpen(false);
                setCalibrateText("");
              }}
              disabled={calibrating}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--neutral-300)] bg-white text-[var(--neutral-700)] hover:bg-[var(--neutral-100)] disabled:opacity-50"
              aria-label={tc("cancel")}
              title={tc("cancel")}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>
      ) : calibrating ? (
        <div
          className="flex items-center justify-center gap-2 py-2 text-sm text-[var(--neutral-600)]"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
          {tAi("calibrating")}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="flex-1"
            onClick={() => onApply(report, screenshot, screenshotName)}
          >
            {tAi("applyDraft")}
          </Button>
          <button
            type="button"
            onClick={() => setCalibrateOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--neutral-300)] bg-white text-[var(--neutral-700)] hover:bg-[var(--neutral-100)] transition-colors"
            aria-label={tAi("calibrate")}
            title={tAi("calibrate")}
          >
            <Wand2 size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--neutral-300)] bg-white text-[var(--neutral-700)] hover:bg-[var(--neutral-100)] transition-colors"
            aria-label={tc("cancel")}
            title={tc("cancel")}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
