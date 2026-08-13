"use client";

/**
 * FeedbackFormInline — full-featured feedback form for embedding in panels
 * (e.g. mobile account panel). Mirrors FeedbackModal completely including
 * AI Assist and screen recording.
 *
 * Screen recording state lives in FeedbackRecordingContext (at the locale
 * layout level) so the floating pill survives (dashboard)↔(project) layout-
 * boundary navigations. This component reads/writes recording state via
 * useFeedbackRecording() and never owns MediaRecorder directly.
 */

import { useState, useEffect, useCallback, useRef, type ChangeEvent, type FormEvent, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Bug, Lightbulb, Loader2, Sparkles, Video, X, Paperclip, AlertCircle, RotateCcw,
} from "lucide-react";
import { FEEDBACK_INBOX_REFRESH_EVENT } from "@/lib/feedback-inbox-events";
import { FeedbackAssistChat } from "@/components/feedback/FeedbackAssistChat";
import { FeedbackDraftPreview } from "@/components/feedback/FeedbackDraftPreview";
import { useFeedbackRecording } from "@/components/feedback/FeedbackRecordingContext";
import { FileDropOverlay } from "@/components/ui/FileDropOverlay";
import { useFileDrop } from "@/hooks/use-file-drop";
import { resolveClientMime } from "@/lib/image-utils";
import {
  FEEDBACK_SCREENSHOT_ALLOWED_MIME,
  FEEDBACK_SCREENSHOT_FILE_ACCEPT,
} from "@/lib/feedback/screenshot-upload";
import {
  saveFeedbackDraft,
  loadFeedbackDraft,
  clearFeedbackDraft,
  hasMeaningfulDraftContent,
  draftAgeLabel,
  type FeedbackDraft,
} from "@/lib/feedback/draft-storage";
import { saveCapturedMediaToDeviceIfEnabled } from "@/lib/save-to-photos-preference";
import type {
  AssistFinalReport,
  AssistInputMode,
  AssistQuestion,
  AssistTranscriptEntry,
  AssistTurnResponse,
  AssistVideoRef,
  FeedbackAssistMetadata,
} from "@/lib/feedback-assist-schema";
import {
  FEEDBACK_ASSIST_MODEL,
  FEEDBACK_ASSIST_VIDEO_MAX_BYTES,
  FEEDBACK_ASSIST_VIDEO_MAX_SEC,
} from "@/lib/ai/types";
import {
  makeFeedbackAssistSessionId,
  MAX_FEEDBACK_RECORDING_SECONDS,
  isFeedbackScreenRecordingSupported,
} from "@/lib/feedback/assist-session";

type FeedbackType = "BUG" | "FEATURE_REQUEST";

interface FeedbackFormInlineProps {
  pageUrl?: string;
  onSuccess?: () => void;
  /**
   * Called whenever screen recording starts or stops so the parent panel can
   * hide itself while the user navigates the app to reproduce their issue.
   */
  onRecordingActiveChange?: (active: boolean) => void;
}

interface ScreenshotEntry {
  id: string;
  name: string;
  /** Object URL for the thumbnail preview — revoked on remove */
  previewUrl: string;
  uploading: boolean;
  /** Supabase signed URL returned after upload */
  url: string | null;
  error: boolean;
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB per image
const MAX_SCREENSHOT_COUNT = 10;

export function FeedbackFormInline({ pageUrl, onSuccess, onRecordingActiveChange }: FeedbackFormInlineProps) {
  const t = useTranslations("feedback");
  const tAi = useTranslations("feedback.ai");
  const tCommon = useTranslations("common");

  // ── Recording state (global context — persists across layout navigations) ───
  const {
    recordingState,
    recordingBlob,
    recordingDurationSec,
    startRecording,
    stopRecording,
    removeRecording,
  } = useFeedbackRecording();

  const isRecording = recordingState === "recording";

  // ── Form state ──────────────────────────────────────────────────────────────
  const [type, setType] = useState<FeedbackType>("BUG");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  /** Legacy base64 screenshot from AI draft preview — kept for backward compat. */
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  /** Multi-image uploads (up to 10 Supabase signed URLs). */
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Retains original File blobs so failed uploads can be retried without re-selection. */
  const pendingScreenshotFilesRef = useRef<Map<string, File>>(new Map());
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const screenshotsRef = useRef(screenshots);
  screenshotsRef.current = screenshots;

  // ── Draft persistence ────────────────────────────────────────────────────────
  /** Saved draft waiting for user to confirm restore or discard. */
  const [pendingDraft, setPendingDraft] = useState<FeedbackDraft | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: check for a saved draft and offer to restore it.
  useEffect(() => {
    const saved = loadFeedbackDraft();
    if (saved && hasMeaningfulDraftContent(saved)) {
      setPendingDraft(saved);
    }
  }, []);

  // Autosave: debounce saves whenever meaningful form content changes.
  useEffect(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    const uploadedUrls = screenshots
      .filter((s) => !s.uploading && !s.error && s.url !== null)
      .map((s) => s.url as string);

    const hasSomething =
      title.trim().length > 0 ||
      description.trim().length > 0 ||
      uploadedUrls.length > 0;

    if (!hasSomething) return;

    autosaveTimerRef.current = setTimeout(() => {
      saveFeedbackDraft({
        type,
        title,
        description,
        screenshotUrls: uploadedUrls,
        pageUrl: null,
        savedAt: Date.now(),
      });
    }, 800);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [type, title, description, screenshots]);

  function restoreDraft(draft: FeedbackDraft) {
    setType(draft.type);
    setTitle(draft.title);
    setDescription(draft.description);

    if (draft.screenshotUrls.length > 0) {
      const restored: ScreenshotEntry[] = draft.screenshotUrls.map((url) => ({
        id: `restored-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: "restored-photo.jpg",
        previewUrl: url,
        uploading: false,
        url,
        error: false,
      }));
      setScreenshots(restored);
    }

    clearFeedbackDraft();
    setPendingDraft(null);
    toast.success(t("draftRestored"));
  }

  function discardDraft() {
    clearFeedbackDraft();
    setPendingDraft(null);
  }

  function abortScreenshotUpload(id: string) {
    uploadAbortControllersRef.current.get(id)?.abort();
    uploadAbortControllersRef.current.delete(id);
  }

  function abortAllScreenshotUploads() {
    uploadAbortControllersRef.current.forEach((controller) => controller.abort());
    uploadAbortControllersRef.current.clear();
  }

  useEffect(() => {
    return () => {
      abortAllScreenshotUploads();
      screenshotsRef.current.forEach((s) => {
        if (!s.previewUrl.startsWith("http")) URL.revokeObjectURL(s.previewUrl);
      });
      pendingScreenshotFilesRef.current.clear();
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // ── AI Assist state ─────────────────────────────────────────────────────────
  const [aiAvailability, setAiAvailability] = useState<"unknown" | "enabled" | "disabled">("unknown");
  const [assistActive, setAssistActive] = useState(false);
  const [assistSessionId, setAssistSessionId] = useState<string | null>(null);
  const [aiMetadata, setAiMetadata] = useState<FeedbackAssistMetadata | null>(null);
  const [analyzingRecording, setAnalyzingRecording] = useState(false);
  const [assistSeed, setAssistSeed] = useState<{
    transcript: AssistTranscriptEntry[];
    question: AssistQuestion;
    remainingTurns: number;
  } | null>(null);
  const [inputModes, setInputModes] = useState<AssistInputMode[]>([]);
  const [assistVideoRef, setAssistVideoRef] = useState<AssistVideoRef | null>(null);
  const [draftPreview, setDraftPreview] = useState<AssistFinalReport | null>(null);
  const [pendingAssistTranscript, setPendingAssistTranscript] = useState<AssistTranscriptEntry[]>([]);
  const [calibrationRounds, setCalibrationRounds] = useState(0);
  const [calibrating, setCalibrating] = useState(false);

  // Probe whether AI Assist is currently available. Runs once on mount.
  useEffect(() => {
    if (aiAvailability !== "unknown") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/feedback/assist", { method: "GET" });
        if (!res.ok) {
          if (!cancelled) setAiAvailability("disabled");
          return;
        }
        const data = (await res.json()) as { enabled?: boolean };
        if (!cancelled) setAiAvailability(data.enabled ? "enabled" : "disabled");
      } catch {
        if (!cancelled) setAiAvailability("disabled");
      }
    })();
    return () => { cancelled = true; };
  }, [aiAvailability]);

  // Notify parent when recording starts/stops so it can hide itself.
  useEffect(() => {
    onRecordingActiveChange?.(isRecording);
  }, [isRecording, onRecordingActiveChange]);

  // ── AI Assist handlers ──────────────────────────────────────────────────────

  function handleStartAssist() {
    if (aiAvailability !== "enabled") return;
    setAssistSessionId(makeFeedbackAssistSessionId());
    setAssistSeed(null);
    setAssistVideoRef(null);
    setDraftPreview(null);
    setPendingAssistTranscript([]);
    setCalibrationRounds(0);
    setInputModes(["text"]);
    setAssistActive(true);
  }

  function handleAssistCancel() {
    setAssistActive(false);
    setAssistSeed(null);
    setAssistVideoRef(null);
    setAiMetadata(null);
    setInputModes([]);
    setDraftPreview(null);
    setPendingAssistTranscript([]);
    setCalibrationRounds(0);
  }

  function handleDraftClose() {
    setDraftPreview(null);
    setPendingAssistTranscript([]);
    setCalibrationRounds(0);
  }

  function handleDraftApply(
    report: AssistFinalReport,
    screenshotFromPreview: string | null,
    screenshotNameFromPreview?: string | null,
  ) {
    if (screenshotFromPreview) {
      setScreenshot(screenshotFromPreview);
      setScreenshotName(screenshotNameFromPreview ?? "screenshot.png");
    }
    const sessionId = assistSessionId ?? makeFeedbackAssistSessionId();
    const modes: AssistInputMode[] = inputModes.length > 0 ? inputModes : ["text"];
    const metadata: FeedbackAssistMetadata = {
      version: 1,
      aiModel: FEEDBACK_ASSIST_MODEL,
      sessionId,
      transcript: pendingAssistTranscript,
      finalReport: report,
      generatedAt: new Date().toISOString(),
      inputModes: modes,
      videoRef: assistVideoRef,
      calibrationRounds,
    };
    setAiMetadata(metadata);
    applyFinalReportToForm(report);
    setDraftPreview(null);
    setPendingAssistTranscript([]);
    setErrors({});
    toast.success(tAi("draftAppliedHint"));
  }

  const handleDraftCalibrate = useCallback(
    async (instruction: string) => {
      if (!draftPreview) return;
      const sessionId = assistSessionId ?? makeFeedbackAssistSessionId();
      setCalibrating(true);
      try {
        const res = await fetch("/api/feedback/assist/calibrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            currentReport: draftPreview,
            instruction,
            feedbackType: draftPreview.kind,
            pageUrl: pageUrl ?? null,
          }),
        });
        if (res.status === 429) { toast.error(tAi("rateLimited")); return; }
        if (res.status === 503) { toast.error(tAi("unavailable")); return; }
        if (!res.ok) { toast.error(tAi("calibrateFailed")); return; }
        const data = (await res.json()) as { kind: "final_report"; report: AssistFinalReport };
        setDraftPreview((prev) => (prev !== null ? data.report : null));
        setCalibrationRounds((n) => Math.min(n + 1, 20));
      } catch {
        toast.error(tAi("calibrateFailed"));
      } finally {
        setCalibrating(false);
      }
    },
    [assistSessionId, draftPreview, pageUrl, tAi],
  );

  function applyFinalReportToForm(report: AssistFinalReport) {
    if (report.suggestedTitle) setTitle(report.suggestedTitle);
    if (report.suggestedDescription) setDescription(report.suggestedDescription);
    if (report.kind === "BUG" || report.kind === "FEATURE_REQUEST") setType(report.kind);
  }

  function handleAssistFinalReport({
    report,
    transcript,
  }: {
    report: AssistFinalReport;
    transcript: AssistTranscriptEntry[];
  }) {
    setPendingAssistTranscript(transcript);
    setDraftPreview(report);
    setAssistActive(false);
    setAssistSeed(null);
    setErrors({});
    toast.success(tAi("draftReady"));
  }

  async function handleAnalyzeRecording() {
    if (aiAvailability !== "enabled" || !recordingBlob || analyzingRecording) return;

    if (recordingBlob.size > FEEDBACK_ASSIST_VIDEO_MAX_BYTES) {
      toast.error(tAi("videoTooLarge", { maxMb: String(Math.round(FEEDBACK_ASSIST_VIDEO_MAX_BYTES / (1024 * 1024))) }));
      return;
    }
    const durationSec = recordingDurationSec ?? MAX_FEEDBACK_RECORDING_SECONDS;
    if (durationSec > FEEDBACK_ASSIST_VIDEO_MAX_SEC) {
      toast.error(tAi("videoTooLong", { maxSeconds: String(FEEDBACK_ASSIST_VIDEO_MAX_SEC) }));
      return;
    }

    const sessionId = makeFeedbackAssistSessionId();
    setAssistSessionId(sessionId);
    setAnalyzingRecording(true);
    setErrors({});

    try {
      const form = new FormData();
      const ext = recordingBlob.type.includes("mp4") ? "mp4" : "webm";
      form.append("recording", recordingBlob, `recording.${ext}`);
      form.append("metadata", JSON.stringify({
        sessionId,
        feedbackType: type,
        initialTitle: title,
        initialUserText: description,
        pageUrl: pageUrl ?? null,
        ...(durationSec > 0 ? { durationSec } : {}),
      }));

      const res = await fetch("/api/feedback/assist/video", { method: "POST", body: form });

      if (res.status === 429) { toast.error(tAi("videoRateLimited")); return; }
      if (res.status === 503) { toast.error(tAi("videoAnalysisUnavailable")); return; }
      if (!res.ok) { toast.error(tAi("videoAnalysisFailed")); return; }

      const data = (await res.json()) as AssistTurnResponse;
      const videoRefFromServer = data.videoRef ?? null;

      setInputModes(["text", "video"]);
      setAssistVideoRef(videoRefFromServer);

      if (data.kind === "final_report") {
        const metadata: FeedbackAssistMetadata = {
          version: 1,
          aiModel: FEEDBACK_ASSIST_MODEL,
          sessionId,
          transcript: [],
          finalReport: data.report,
          generatedAt: new Date().toISOString(),
          inputModes: ["text", "video"],
          videoRef: videoRefFromServer,
          calibrationRounds: 0,
        };
        setAiMetadata(metadata);
        applyFinalReportToForm(data.report);
        setPendingAssistTranscript([]);
        setErrors({});
        toast.success(tAi("draftReady"));
        return;
      }

      const seededEntry: AssistTranscriptEntry = {
        role: "assistant",
        question: data.question,
      };
      setAssistSeed({
        transcript: [seededEntry],
        question: data.question,
        remainingTurns: data.remainingTurns,
      });
      setAssistActive(true);
    } catch {
      toast.error(tAi("videoAnalysisFailed"));
    } finally {
      setAnalyzingRecording(false);
    }
  }

  // ── Form handlers ───────────────────────────────────────────────────────────

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = t("titleRequired");
    if (!description.trim()) next.description = t("descriptionRequired");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function uploadScreenshotFile(entry: ScreenshotEntry, file: File, signal: AbortSignal): Promise<void> {
    const form = new FormData();
    form.append("screenshot", file);
    try {
      const res = await fetch("/api/feedback/upload-screenshot", { method: "POST", body: form, signal });
      if (signal.aborted) return;
      if (res.ok) {
        const { url } = await res.json() as { url: string };
        if (signal.aborted) return;
        pendingScreenshotFilesRef.current.delete(entry.id);
        uploadAbortControllersRef.current.delete(entry.id);
        setScreenshots((prev) =>
          prev.map((s) => s.id === entry.id ? { ...s, uploading: false, url } : s),
        );
      } else {
        setScreenshots((prev) =>
          prev.map((s) => s.id === entry.id ? { ...s, uploading: false, error: true } : s),
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setScreenshots((prev) =>
        prev.map((s) => s.id === entry.id ? { ...s, uploading: false, error: true } : s),
      );
    }
  }

  const processScreenshotFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;

    const remaining = MAX_SCREENSHOT_COUNT - screenshots.length;
    if (remaining <= 0) {
      setErrors((prev) => ({ ...prev, screenshots: t("screenshotsTooMany") }));
      return;
    }

    const accepted = incoming.slice(0, remaining);
    if (incoming.length > remaining) {
      setErrors((prev) => ({ ...prev, screenshots: t("screenshotsTooMany") }));
    }

    const newEntries: ScreenshotEntry[] = [];

    for (const file of accepted) {
      const mime = resolveClientMime(file);
      if (!FEEDBACK_SCREENSHOT_ALLOWED_MIME.includes(mime)) {
        setErrors((prev) => ({ ...prev, screenshots: t("screenshotUnsupportedMime") }));
        continue;
      }
      if (file.size > MAX_SCREENSHOT_BYTES) {
        setErrors((prev) => ({ ...prev, screenshots: t("screenshotTooLarge") }));
        continue;
      }
      const entry: ScreenshotEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        uploading: true,
        url: null,
        error: false,
      };
      newEntries.push(entry);
      pendingScreenshotFilesRef.current.set(entry.id, file);
      const controller = new AbortController();
      uploadAbortControllersRef.current.set(entry.id, controller);
      void uploadScreenshotFile(entry, file, controller.signal);
    }

    if (newEntries.length > 0) {
      setScreenshots((prev) => [...prev, ...newEntries]);
      setErrors((prev) => { const n = { ...prev }; delete n.screenshots; return n; });

      saveCapturedMediaToDeviceIfEnabled(
        accepted.filter((f) =>
          FEEDBACK_SCREENSHOT_ALLOWED_MIME.includes(resolveClientMime(f)),
        ),
      );
    }
  }, [screenshots.length, t]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    processScreenshotFiles(Array.from(e.target.files ?? []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleScreenshotDropRejected = useCallback(() => {
    setErrors((prev) => ({ ...prev, screenshots: t("screenshotUnsupportedMime") }));
  }, [t]);

  const { dropHandlers: screenshotDropHandlers } = useFileDrop({
    onFiles: processScreenshotFiles,
    onRejected: handleScreenshotDropRejected,
    accept: FEEDBACK_SCREENSHOT_FILE_ACCEPT,
    disabled: screenshots.length >= MAX_SCREENSHOT_COUNT || Boolean(screenshot),
  });

  function removeScreenshot(id: string) {
    abortScreenshotUpload(id);
    pendingScreenshotFilesRef.current.delete(id);
    setScreenshots((prev) => {
      const entry = prev.find((s) => s.id === id);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  function retryUpload(id: string) {
    const file = pendingScreenshotFilesRef.current.get(id);
    const entry = screenshots.find((s) => s.id === id);
    if (!file || !entry) {
      removeScreenshot(id);
      fileInputRef.current?.click();
      return;
    }
    const retryEntry: ScreenshotEntry = { ...entry, uploading: true, error: false, url: null };
    setScreenshots((prev) => prev.map((s) => (s.id === id ? retryEntry : s)));
    abortScreenshotUpload(id);
    const controller = new AbortController();
    uploadAbortControllersRef.current.set(id, controller);
    void uploadScreenshotFile(retryEntry, file, controller.signal);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const uploading = screenshots.some((s) => s.uploading);
    if (uploading) {
      toast.error(t("screenshotUploading"));
      return;
    }

    const hasFailedScreenshots = screenshots.some((s) => s.error || s.url === null);
    if (hasFailedScreenshots) {
      toast.error(t("screenshotsUnresolved"));
      return;
    }

    const screenshotUrls = screenshots.map((s) => s.url as string);

    setSubmitting(true);
    try {
      let videoUrl: string | null = null;
      if (recordingBlob) {
        const formData = new FormData();
        const ext = recordingBlob.type.includes("mp4") ? "mp4" : "webm";
        formData.append("recording", recordingBlob, `recording.${ext}`);
        const uploadRes = await fetch("/api/feedback/upload-recording", { method: "POST", body: formData });
        if (uploadRes.ok) {
          const { url } = (await uploadRes.json()) as { url: string };
          videoUrl = url;
        } else {
          console.warn("[FeedbackFormInline] Recording upload failed — submitting without video");
        }
      }

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          screenshot,
          screenshots: screenshotUrls,
          videoUrl,
          pageUrl: pageUrl ?? null,
          aiAssisted: aiMetadata !== null,
          aiAssistMetadata: aiMetadata,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to submit");
      }

      const report = (await res.json()) as { shortId?: number };
      const refLabel = report.shortId
        ? t("referenceId", { id: String(report.shortId).padStart(4, "0") })
        : null;
      toast.success(refLabel ? `${t("submitSuccess")} ${refLabel}` : t("submitSuccess"));
      window.dispatchEvent(new CustomEvent(FEEDBACK_INBOX_REFRESH_EVENT));
      clearFeedbackDraft();
      setPendingDraft(null);

      // Reset form state
      setType("BUG");
      setTitle("");
      setDescription("");
      setScreenshot(null);
      setScreenshotName(null);
      abortAllScreenshotUploads();
      screenshots.forEach((s) => {
        if (!s.previewUrl.startsWith("http")) URL.revokeObjectURL(s.previewUrl);
      });
      pendingScreenshotFilesRef.current.clear();
      setScreenshots([]);
      setErrors({});
      removeRecording();
      stopRecording();
      setAssistActive(false);
      setAssistSessionId(null);
      setAiMetadata(null);
      setAnalyzingRecording(false);
      setAssistSeed(null);
      setInputModes([]);
      setAssistVideoRef(null);
      setDraftPreview(null);
      setPendingAssistTranscript([]);
      setCalibrationRounds(0);
      setCalibrating(false);

      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const INPUT_STYLE: CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "var(--radius-md)",
    border: "none",
    fontSize: 14,
    backgroundColor: "var(--color-surface-sunken)",
    color: "var(--color-text-primary)",
    boxSizing: "border-box",
    fontFamily: "inherit",
    outline: "none",
  };

  const LABEL_STYLE: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--neutral-600)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    display: "block",
    marginBottom: 5,
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Draft restore banner */}
        {pendingDraft && (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1.5px solid var(--warning-300, #f59e0b)",
              backgroundColor: "var(--warning-50, #fffbeb)",
            }}
          >
            <RotateCcw
              size={14}
              aria-hidden
              style={{ marginTop: 2, flexShrink: 0, color: "var(--warning-600, #d97706)" }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--neutral-900)" }}>
                {t("draftBannerTitle")}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--neutral-600)" }}>
                {t("draftBannerBody", { time: draftAgeLabel(pendingDraft.savedAt) })}
                {pendingDraft.screenshotUrls.length > 0 && (
                  <span style={{ marginLeft: 4, color: "var(--neutral-500)" }}>
                    ({pendingDraft.screenshotUrls.length}{" "}
                    {pendingDraft.screenshotUrls.length === 1 ? "photo" : "photos"})
                  </span>
                )}
              </p>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => restoreDraft(pendingDraft)}
                style={{
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: "var(--warning-600, #d97706)",
                  color: "#fff",
                }}
              >
                {t("draftRestore")}
              </button>
              <button
                type="button"
                onClick={discardDraft}
                aria-label={t("draftDiscard")}
                style={{
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  border: "1.5px solid var(--neutral-300)",
                  cursor: "pointer",
                  backgroundColor: "transparent",
                  color: "var(--neutral-600)",
                }}
              >
                {t("draftDiscard")}
              </button>
            </div>
          </div>
        )}

        {/* Type toggle */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["BUG", "FEATURE_REQUEST"] as FeedbackType[]).map((tp) => {
            const isActive = type === tp;
            return (
              <button
                key={tp}
                type="button"
                onClick={() => setType(tp)}
                aria-pressed={isActive}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${isActive ? "var(--primary-400)" : "var(--neutral-200)"}`,
                  backgroundColor: isActive ? "var(--primary-50)" : "var(--neutral-0)",
                  color: isActive ? "var(--primary-700)" : "var(--neutral-600)",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                {tp === "BUG" ? <Bug size={14} aria-hidden /> : <Lightbulb size={14} aria-hidden />}
                {tp === "BUG" ? t("typeBug") : t("typeFeature")}
              </button>
            );
          })}
        </div>

        {/* AI Assist toggle / chat / draft */}
        {!assistActive && !draftPreview ? (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              border: `1.5px solid ${aiAvailability === "enabled" ? "var(--primary-200)" : "var(--neutral-200)"}`,
              backgroundColor: aiAvailability === "enabled" ? "var(--primary-50)" : "var(--neutral-50)",
            }}
          >
            <Sparkles
              size={15}
              aria-hidden
              style={{
                marginTop: 2,
                flexShrink: 0,
                color: aiAvailability === "enabled" ? "var(--primary-600)" : "var(--neutral-400)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--neutral-900)" }}>
                {tAi("toggleTitle")}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--neutral-600)" }}>
                {aiAvailability === "enabled"
                  ? tAi("toggleHint")
                  : aiAvailability === "disabled"
                    ? tAi("toggleDisabledHint")
                    : tAi("togglePendingHint")}
              </p>
              {aiMetadata ? (
                <p style={{ margin: "2px 0 0", fontSize: 12, fontWeight: 600, color: "var(--success-700)" }}>
                  {tAi("draftAppliedHint")}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleStartAssist}
              disabled={aiAvailability !== "enabled" || submitting}
              aria-disabled={aiAvailability !== "enabled"}
              title={aiAvailability === "enabled" ? tAi("toggleCta") : tAi("toggleDisabledHint")}
              style={{
                flexShrink: 0,
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 700,
                border: "none",
                cursor: aiAvailability === "enabled" ? "pointer" : "not-allowed",
                backgroundColor:
                  aiAvailability === "enabled" ? "var(--primary-600)" : "var(--neutral-200)",
                color: aiAvailability === "enabled" ? "#fff" : "var(--neutral-500)",
                transition: "background-color 0.12s",
              }}
            >
              {aiMetadata ? tAi("toggleRedo") : tAi("toggleCta")}
            </button>
          </div>
        ) : draftPreview ? (
          <FeedbackDraftPreview
            report={draftPreview}
            calibrationRounds={calibrationRounds}
            calibrating={calibrating}
            onApply={handleDraftApply}
            onCalibrate={(instruction) => void handleDraftCalibrate(instruction)}
            onClose={handleDraftClose}
          />
        ) : assistSessionId ? (
          <FeedbackAssistChat
            sessionId={assistSessionId}
            feedbackType={type}
            initialTitle={title}
            initialDescription={description}
            pageUrl={pageUrl ?? null}
            initialTranscript={assistSeed?.transcript}
            initialQuestion={assistSeed?.question ?? null}
            initialRemainingTurns={assistSeed?.remainingTurns}
            videoRef={assistVideoRef}
            onFinalReport={handleAssistFinalReport}
            onCancel={handleAssistCancel}
          />
        ) : null}

        {/* Title */}
        <div>
          <label htmlFor="ffi-title" style={LABEL_STYLE}>
            {t("titleLabel")}
          </label>
          <input
            id="ffi-title"
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setErrors((p) => { const n = { ...p }; delete n.title; return n; });
            }}
            placeholder={type === "BUG" ? t("titlePlaceholderBug") : t("titlePlaceholderFeature")}
            style={INPUT_STYLE}
            aria-describedby={errors.title ? "ffi-title-error" : undefined}
            aria-invalid={!!errors.title}
          />
          {errors.title && (
            <p id="ffi-title-error" style={{ margin: "4px 0 0", fontSize: 12, color: "var(--error-600)" }}>
              {errors.title}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="ffi-description" style={LABEL_STYLE}>
            {t("descriptionLabel")}
          </label>
          <textarea
            id="ffi-description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setErrors((p) => { const n = { ...p }; delete n.description; return n; });
            }}
            placeholder={type === "BUG" ? t("descriptionPlaceholderBug") : t("descriptionPlaceholderFeature")}
            rows={4}
            style={{ ...INPUT_STYLE, resize: "none", lineHeight: 1.5 }}
            aria-describedby={errors.description ? "ffi-description-error" : undefined}
            aria-invalid={!!errors.description}
          />
          {errors.description && (
            <p id="ffi-description-error" style={{ margin: "4px 0 0", fontSize: 12, color: "var(--error-600)" }}>
              {errors.description}
            </p>
          )}
        </div>

        {/* Screenshots — multi-image (up to 10) */}
        <div style={{ position: "relative" }} {...screenshotDropHandlers}>
          <label style={LABEL_STYLE}>{t("screenshotLabel")}</label>

          {/* Legacy AI-draft screenshot pill */}
          {screenshot && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                marginBottom: 8,
                border: "1.5px solid var(--neutral-200)",
                borderRadius: 8,
                backgroundColor: "var(--neutral-50)",
              }}
            >
              <Paperclip size={13} style={{ color: "var(--neutral-500)", flexShrink: 0 }} aria-hidden />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: "var(--neutral-700)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {screenshotName ?? "screenshot.png"}
              </span>
              <button
                type="button"
                onClick={() => { setScreenshot(null); setScreenshotName(null); }}
                aria-label={t("removeScreenshot")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--neutral-400)", lineHeight: 1, padding: "0 2px" }}
              >
                <X size={13} />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            id="ffi-screenshot"
            type="file"
            accept={FEEDBACK_SCREENSHOT_FILE_ACCEPT}
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
            aria-label={t("screenshotLabel")}
          />

          {screenshots.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {screenshots.map((s) => (
                <div
                  key={s.id}
                  style={{ position: "relative", width: 56, height: 56, borderRadius: 6, overflow: "hidden", border: "1.5px solid var(--neutral-200)", flexShrink: 0 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.previewUrl}
                    alt={s.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  {(s.uploading || s.error) && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.45))" }}>
                      {s.uploading
                        ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--neutral-0)" }} aria-hidden />
                        : (
                          <button
                            type="button"
                            onClick={() => retryUpload(s.id)}
                            aria-label={t("screenshotUploadFailed")}
                            title={t("screenshotUploadFailed")}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                          >
                            <AlertCircle size={16} style={{ color: "var(--error-400)" }} />
                          </button>
                        )
                      }
                    </div>
                  )}
                  {!s.uploading && (
                    <button
                      type="button"
                      onClick={() => removeScreenshot(s.id)}
                      aria-label={t("removeScreenshot")}
                      title={t("removeScreenshot")}
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.55))",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                      }}
                    >
                      <X size={10} style={{ color: "var(--neutral-0)" }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {screenshots.length < MAX_SCREENSHOT_COUNT && !screenshot && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 8,
                border: "1.5px dashed var(--neutral-300)",
                backgroundColor: "transparent",
                color: "var(--neutral-500)",
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Paperclip size={13} aria-hidden />
              {t("attachScreenshot")}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--neutral-400)" }}>
                {screenshots.length}/{MAX_SCREENSHOT_COUNT}
              </span>
            </button>
          )}

          {errors.screenshots && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--error-600)" }}>{errors.screenshots}</p>
          )}
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--neutral-500)" }}>{t("screenshotHint")}</p>
          <FileDropOverlay
            disabled={screenshots.length >= MAX_SCREENSHOT_COUNT || Boolean(screenshot)}
          />
        </div>

        {/* Screen recording */}
        <div>
          <label style={LABEL_STYLE}>{t("recordingLabel")}</label>

          {recordingState === "idle" && (
            isFeedbackScreenRecordingSupported() ? (
              <button
                type="button"
                onClick={() => void startRecording()}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1.5px dashed var(--neutral-300)",
                  backgroundColor: "transparent",
                  color: "var(--neutral-500)",
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Video size={13} aria-hidden />
                {t("recordScreen")}
                <span style={{ marginLeft: "auto", fontSize: 11 }}>{t("recordingHint")}</span>
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1.5px dashed var(--neutral-200)",
                  color: "var(--neutral-400)",
                  fontSize: 13,
                  cursor: "not-allowed",
                }}
              >
                <Video size={13} aria-hidden />
                {t("recordScreen")}
                <span style={{ marginLeft: "auto", fontSize: 11 }}>{t("recordingNotSupported")}</span>
              </div>
            )
          )}

          {recordingState === "requesting" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                borderRadius: 8,
                border: "1.5px solid var(--neutral-200)",
                backgroundColor: "var(--neutral-50)",
                color: "var(--neutral-500)",
                fontSize: 13,
              }}
            >
              <Loader2 size={13} className="animate-spin" style={{ flexShrink: 0 }} aria-hidden />
              {t("recordingRequesting")}
            </div>
          )}

          {/* "recording" state is shown via the global floating pill in FeedbackRecordingContext */}

          {recordingState === "stopped" && recordingBlob && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1.5px solid var(--success-300)",
                backgroundColor: "var(--success-50)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Video size={13} style={{ color: "var(--success-600)", flexShrink: 0 }} aria-hidden />
                <span style={{ flex: 1, fontSize: 13, color: "var(--success-700)" }}>
                  {t("recordingReady")}
                  <span style={{ fontSize: 11, color: "var(--neutral-500)", marginLeft: 4 }}>
                    ({(recordingBlob.size / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={removeRecording}
                  disabled={analyzingRecording}
                  aria-label={t("removeRecording")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: analyzingRecording ? "not-allowed" : "pointer",
                    color: "var(--neutral-400)",
                    opacity: analyzingRecording ? 0.4 : 1,
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                >
                  <X size={13} />
                </button>
              </div>
              {!assistActive && !aiMetadata ? (
                <button
                  type="button"
                  onClick={() => void handleAnalyzeRecording()}
                  disabled={aiAvailability !== "enabled" || analyzingRecording || submitting}
                  aria-disabled={aiAvailability !== "enabled"}
                  title={aiAvailability === "enabled" ? tAi("analyzeRecording") : tAi("videoAnalysisUnavailable")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    border: "none",
                    cursor:
                      aiAvailability === "enabled" && !analyzingRecording && !submitting
                        ? "pointer"
                        : "not-allowed",
                    backgroundColor:
                      aiAvailability === "enabled"
                        ? "var(--primary-600)"
                        : "var(--neutral-200)",
                    color: aiAvailability === "enabled" ? "#fff" : "var(--neutral-500)",
                    opacity: analyzingRecording || submitting ? 0.6 : 1,
                    transition: "background-color 0.12s",
                  }}
                >
                  {analyzingRecording ? (
                    <>
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                      {tAi("analyzingRecording")}
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} aria-hidden />
                      {tAi("analyzeRecording")}
                    </>
                  )}
                </button>
              ) : null}
            </div>
          )}

          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--neutral-500)" }}>
            {t("recordingHintFull")}
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || isRecording}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 8,
            border: "none",
            backgroundColor: submitting || isRecording ? "var(--neutral-200)" : "var(--primary-600)",
            color: submitting || isRecording ? "var(--neutral-400)" : "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: submitting || isRecording ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "background-color 0.15s",
          }}
        >
          {submitting && <Loader2 size={15} className="animate-spin" aria-hidden />}
          {submitting
            ? (recordingBlob ? t("submittingWithRecording") : tCommon("saving"))
            : t("submit")}
        </button>
      </form>
  );
}
