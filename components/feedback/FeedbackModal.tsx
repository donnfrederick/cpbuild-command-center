"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Bug, Lightbulb, Paperclip, X, Loader2, Video, Square, Circle, Sparkles, RotateCcw } from "lucide-react";
import { FEEDBACK_INBOX_REFRESH_EVENT } from "@/lib/feedback-inbox-events";
import { FeedbackAssistChat } from "@/components/feedback/FeedbackAssistChat";
import { FeedbackDraftPreview } from "@/components/feedback/FeedbackDraftPreview";
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
} from "@/lib/feedback/assist-session";
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

type FeedbackType = "BUG" | "FEATURE_REQUEST";
type RecordingState = "idle" | "requesting" | "recording" | "stopped";

interface ScreenshotEntry {
  id: string;
  name: string;
  /** Object URL for thumbnail preview — revoked on remove */
  previewUrl: string;
  uploading: boolean;
  /** Supabase signed URL returned after upload */
  url: string | null;
  error: boolean;
}

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageUrl?: string;
}

/** Generate a cryptographically secure session ID (UUID v4). */
function makeSessionId(): string {
  return makeFeedbackAssistSessionId();
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB per image
const MAX_SCREENSHOT_COUNT = 10;
const MAX_RECORDING_SECONDS = MAX_FEEDBACK_RECORDING_SECONDS;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FeedbackModal({ open, onOpenChange, pageUrl }: FeedbackModalProps) {
  const t = useTranslations("feedback");
  const tAi = useTranslations("feedback.ai");
  const tc = useTranslations("common");

  // Form state
  const [type, setType] = useState<FeedbackType>("BUG");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  /** Legacy screenshot — used only by the AI draft preview path (single base64 from FeedbackDraftPreview). */
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  /** Multi-image screenshots from manual file uploads (up to 10 Supabase URLs). */
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingScreenshotFilesRef = useRef<Map<string, File>>(new Map());
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const screenshotsRef = useRef(screenshots);
  screenshotsRef.current = screenshots;

  // ── Draft persistence ────────────────────────────────────────────────────────
  const [pendingDraft, setPendingDraft] = useState<FeedbackDraft | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On modal open: check for a saved draft and offer restore.
  useEffect(() => {
    if (!open) return;
    const saved = loadFeedbackDraft();
    if (saved && hasMeaningfulDraftContent(saved)) {
      setPendingDraft(saved);
    }
  }, [open]);

  // Autosave when form content changes (modal only — skip when closed).
  useEffect(() => {
    if (!open) return;
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
        pageUrl: pageUrl ?? null,
        savedAt: Date.now(),
      });
    }, 800);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [open, type, title, description, screenshots, pageUrl]);

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

  // AI-assisted flow state
  const [aiAvailability, setAiAvailability] = useState<"unknown" | "enabled" | "disabled">("unknown");
  const [assistActive, setAssistActive] = useState(false);
  const [assistSessionId, setAssistSessionId] = useState<string | null>(null);
  const [aiMetadata, setAiMetadata] = useState<FeedbackAssistMetadata | null>(null);
  const [analyzingRecording, setAnalyzingRecording] = useState(false);
  /**
   * Seed payload for the chat after a successful video analysis. When set,
   * the chat renders the first assistant turn without re-POSTing.
   */
  const [assistSeed, setAssistSeed] = useState<{
    transcript: AssistTranscriptEntry[];
    question: AssistQuestion;
    remainingTurns: number;
  } | null>(null);
  /**
   * Input modes exercised this session. Persisted inside `aiAssistMetadata`
   * so triage can see whether the AI saw a recording or just text.
   */
  const [inputModes, setInputModes] = useState<AssistInputMode[]>([]);
  const [assistVideoRef, setAssistVideoRef] = useState<AssistVideoRef | null>(null);
  /** AI draft awaiting user review before populating the form. */
  const [draftPreview, setDraftPreview] = useState<AssistFinalReport | null>(null);
  const [pendingAssistTranscript, setPendingAssistTranscript] = useState<AssistTranscriptEntry[]>([]);
  const [calibrationRounds, setCalibrationRounds] = useState(0);
  const [calibrating, setCalibrating] = useState(false);

  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORDING_SECONDS);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop and clean up the active recording
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Auto-stop when timer hits 0
  useEffect(() => {
    if (secondsLeft === 0 && recordingState === "recording") {
      stopRecording();
    }
  }, [secondsLeft, recordingState, stopRecording]);

  // Clean up on unmount or modal close
  useEffect(() => {
    if (!open) {
      stopRecording();
    }
    return () => stopRecording();
  }, [open, stopRecording]);

  // Probe whether the Gemini-backed assist flow is currently enabled. This
  // runs once per modal open so the toggle always reflects current env state
  // even if the server restarts with a new GEMINI_API_KEY between opens.
  useEffect(() => {
    if (!open || aiAvailability !== "unknown") return;
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
    return () => {
      cancelled = true;
    };
  }, [open, aiAvailability]);

  function reset() {
    abortAllScreenshotUploads();
    setType("BUG");
    setTitle("");
    setDescription("");
    setScreenshot(null);
    setScreenshotName(null);
    setScreenshots((prev) => {
      prev.forEach((s) => {
        if (!s.previewUrl.startsWith("http")) URL.revokeObjectURL(s.previewUrl);
      });
      return [];
    });
    pendingScreenshotFilesRef.current.clear();
    setErrors({});
    setPendingDraft(null);
    setRecordingBlob(null);
    setRecordingState("idle");
    setSecondsLeft(MAX_RECORDING_SECONDS);
    chunksRef.current = [];
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
  }

  function handleStartAssist() {
    if (aiAvailability !== "enabled") return;
    // Fresh session every time the user starts the assistant — each run is
    // its own auditable conversation, even when retrying.
    setAssistSessionId(makeSessionId());
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

  function handleDraftApply(report: AssistFinalReport, screenshotFromPreview: string | null, screenshotNameFromPreview?: string | null) {
    if (screenshotFromPreview) {
      setScreenshot(screenshotFromPreview);
      setScreenshotName(screenshotNameFromPreview ?? "screenshot.png");
    }
    const sessionId = assistSessionId ?? makeSessionId();
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

  async function handleDraftCalibrate(instruction: string) {
    if (!draftPreview) return;
    const sessionId = assistSessionId ?? makeSessionId();
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
      if (res.status === 429) {
        toast.error(tAi("rateLimited"));
        return;
      }
      if (res.status === 503) {
        toast.error(tAi("unavailable"));
        return;
      }
      if (!res.ok) {
        toast.error(tAi("calibrateFailed"));
        return;
      }
      const data = (await res.json()) as { kind: "final_report"; report: AssistFinalReport };
      setDraftPreview((prev) => (prev !== null ? data.report : null));
      setCalibrationRounds((n) => Math.min(n + 1, 20));
    } catch {
      toast.error(tAi("calibrateFailed"));
    } finally {
      setCalibrating(false);
    }
  }

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
    if (aiAvailability !== "enabled") return;
    if (!recordingBlob) return;
    if (analyzingRecording) return;

    if (recordingBlob.size > FEEDBACK_ASSIST_VIDEO_MAX_BYTES) {
      toast.error(
        tAi("videoTooLarge", {
          maxMb: String(Math.round(FEEDBACK_ASSIST_VIDEO_MAX_BYTES / (1024 * 1024))),
        }),
      );
      return;
    }
    // Duration is implicitly capped by MediaRecorder's 2-minute timer, but
    // keep a pre-flight guard so future changes don't silently bypass it.
    const durationSec = MAX_RECORDING_SECONDS - secondsLeft;
    if (durationSec > FEEDBACK_ASSIST_VIDEO_MAX_SEC) {
      toast.error(
        tAi("videoTooLong", { maxSeconds: String(FEEDBACK_ASSIST_VIDEO_MAX_SEC) }),
      );
      return;
    }

    const sessionId = makeSessionId();
    setAssistSessionId(sessionId);
    setAnalyzingRecording(true);
    setErrors({});

    try {
      const form = new FormData();
      const ext = recordingBlob.type.includes("mp4") ? "mp4" : "webm";
      form.append("recording", recordingBlob, `recording.${ext}`);
      form.append(
        "metadata",
        JSON.stringify({
          sessionId,
          feedbackType: type,
          initialTitle: title,
          initialUserText: description,
          pageUrl: pageUrl ?? null,
          ...(durationSec > 0 ? { durationSec } : {}),
        }),
      );

      const res = await fetch("/api/feedback/assist/video", {
        method: "POST",
        body: form,
      });

      if (res.status === 429) {
        toast.error(tAi("videoRateLimited"));
        return;
      }
      if (res.status === 503) {
        toast.error(tAi("videoAnalysisUnavailable"));
        return;
      }
      if (!res.ok) {
        toast.error(tAi("videoAnalysisFailed"));
        return;
      }

      const data = (await res.json()) as AssistTurnResponse;
      const videoRefFromServer = data.videoRef ?? null;

      // `recordingBlob` is guaranteed non-null here: we returned early at the
      // top of this handler if it wasn't set. Always record both modes.
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

      // Seed the chat with the first assistant turn returned from the video
      // route. The chat renders it without making its own GET round-trip.
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

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
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
        setScreenshots((prev) => prev.map((s) => s.id === entry.id ? { ...s, uploading: false, url } : s));
      } else {
        setScreenshots((prev) => prev.map((s) => s.id === entry.id ? { ...s, uploading: false, error: true } : s));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setScreenshots((prev) => prev.map((s) => s.id === entry.id ? { ...s, uploading: false, error: true } : s));
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(e.target.files ?? []);
    processScreenshotFiles(incoming);
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

  async function startRecording() {
    setRecordingState("requesting");
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // Try to mix microphone audio in; non-fatal if denied
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        // mic is optional — user may deny or device may not have one
      }

      const tracks: MediaStreamTrack[] = [...screenStream.getTracks()];
      if (micStream) tracks.push(...micStream.getAudioTracks());
      const combinedStream = new MediaStream(tracks);
      streamRef.current = combinedStream;

      chunksRef.current = [];
      // Pick the best supported format — Safari requires mp4, Chrome/Firefox prefer webm
      const mimeType = [
        "video/webm;codecs=vp9",
        "video/webm",
        "video/mp4;codecs=avc1",
        "video/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(combinedStream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // Use the actual MIME type the recorder used (mp4 on Safari, webm on Chrome/Firefox)
        const actualType = recorder.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        setRecordingBlob(blob);
        setRecordingState("stopped");
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      };

      // If the user stops sharing via the browser's native stop button
      screenStream.getVideoTracks()[0].onended = () => stopRecording();

      recorder.start(1000); // collect chunks every second
      setRecordingState("recording");
      setSecondsLeft(MAX_RECORDING_SECONDS);

      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      // User cancelled the permission prompt — back to idle silently
      if (err instanceof Error && err.name !== "NotAllowedError") {
        console.error("[FeedbackModal] Recording error:", err);
      }
      setRecordingState("idle");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function removeRecording() {
    setRecordingBlob(null);
    setRecordingState("idle");
    setSecondsLeft(MAX_RECORDING_SECONDS);
    chunksRef.current = [];
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = t("titleRequired");
    if (!description.trim()) next.description = t("descriptionRequired");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
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

    setSubmitting(true);
    try {
      // Upload recording first if one was captured
      let videoUrl: string | null = null;
      if (recordingBlob) {
        const formData = new FormData();
        const ext = recordingBlob.type.includes("mp4") ? "mp4" : "webm";
        formData.append("recording", recordingBlob, `recording.${ext}`);
        const uploadRes = await fetch("/api/feedback/upload-recording", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json() as { url: string };
          videoUrl = url;
        } else {
          // Non-fatal — submit without the recording URL rather than blocking the report
          console.warn("[FeedbackModal] Recording upload failed — submitting without video");
        }
      }

      // Block submit while any image is still uploading (defensive — checked above)
      const screenshotUrls = screenshots.map((s) => s.url as string);

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          // Legacy base64 screenshot from AI draft preview path (if set)
          screenshot,
          screenshots: screenshotUrls,
          videoUrl,
          pageUrl: pageUrl ?? null,
          aiAssisted: aiMetadata !== null,
          aiAssistMetadata: aiMetadata,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Failed to submit");
      }

      const report = await res.json() as { shortId?: number };
      const refLabel = report.shortId
        ? t("referenceId", { id: String(report.shortId).padStart(4, "0") })
        : null;
      toast.success(refLabel ? `${t("submitSuccess")} ${refLabel}` : t("submitSuccess"));
      window.dispatchEvent(new CustomEvent(FEEDBACK_INBOX_REFRESH_EVENT));
      clearFeedbackDraft();
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  // When recording is active the modal hides so the user can navigate the app freely.
  // A floating pill in the corner shows the timer and Stop button instead.
  const isRecording = recordingState === "recording";

  return (
    <>
      {/* Floating recording indicator — visible only while the modal is hidden */}
      {open && isRecording && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-[200] flex items-center gap-3 rounded-full border border-[var(--error-300)] bg-white shadow-lg px-4 py-3"
        >
          <Circle
            size={10}
            className="fill-[var(--error-600)] text-[var(--error-600)] shrink-0 animate-pulse"
          />
          <span className="text-sm font-medium text-[var(--error-700)]">
            {t("recordingInProgress")}
          </span>
          <span className="text-sm font-mono text-[var(--error-600)] tabular-nums">
            {formatTime(secondsLeft)}
          </span>
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-1 rounded-md border border-[var(--error-600)] bg-white px-2 py-1 text-xs font-medium text-[var(--error-600)] hover:bg-[var(--error-50)] transition-colors"
            aria-label={t("stopRecording")}
          >
            <Square size={10} className="fill-[var(--error-600)]" />
            {t("stopRecording")}
          </button>
        </div>
      )}

    <Dialog open={open && !isRecording} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Draft restore banner */}
          {pendingDraft && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--warning-300, #f59e0b)",
                backgroundColor: "var(--warning-50, #fffbeb)",
              }}
            >
              <RotateCcw
                size={15}
                aria-hidden
                className="mt-0.5 shrink-0"
                style={{ color: "var(--warning-600, #d97706)" }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="font-medium text-[var(--neutral-900)]">
                  {t("draftBannerTitle")}
                </p>
                <p className="text-xs text-[var(--neutral-600)]">
                  {t("draftBannerBody", { time: draftAgeLabel(pendingDraft.savedAt) })}
                  {pendingDraft.screenshotUrls.length > 0 && (
                    <span className="ml-1 text-[var(--neutral-500)]">
                      ({pendingDraft.screenshotUrls.length}{" "}
                      {pendingDraft.screenshotUrls.length === 1 ? "photo" : "photos"})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => restoreDraft(pendingDraft)}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold text-white transition-colors"
                  style={{ backgroundColor: "var(--warning-600, #d97706)" }}
                >
                  {t("draftRestore")}
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="rounded-md border border-[var(--neutral-300)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--neutral-600)] transition-colors"
                >
                  {t("draftDiscard")}
                </button>
              </div>
            </div>
          )}

          {/* Type selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("BUG")}
              className={[
                "flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                type === "BUG"
                  ? "border-[var(--error-600)] bg-[var(--error-100)] text-[var(--error-600)]"
                  : "border-[var(--neutral-300)] bg-white text-[var(--neutral-700)] hover:bg-[var(--neutral-100)]",
              ].join(" ")}
              aria-pressed={type === "BUG"}
            >
              <Bug size={16} />
              {t("typeBug")}
            </button>
            <button
              type="button"
              onClick={() => setType("FEATURE_REQUEST")}
              className={[
                "flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                type === "FEATURE_REQUEST"
                  ? "border-[var(--primary-500)] bg-[var(--primary-100)] text-[var(--primary-700)]"
                  : "border-[var(--neutral-300)] bg-white text-[var(--neutral-700)] hover:bg-[var(--neutral-100)]",
              ].join(" ")}
              aria-pressed={type === "FEATURE_REQUEST"}
            >
              <Lightbulb size={16} />
              {t("typeFeature")}
            </button>
          </div>

          {/* AI-assisted feedback toggle */}
          {!assistActive && !draftPreview ? (
            <div
              className={[
                "flex items-start gap-3 rounded-md border px-3 py-2 text-sm",
                aiAvailability === "enabled"
                  ? "border-[var(--primary-200)] bg-[var(--primary-50)]"
                  : "border-[var(--neutral-200)] bg-[var(--neutral-50)]",
              ].join(" ")}
            >
              <Sparkles
                size={16}
                className={
                  aiAvailability === "enabled"
                    ? "mt-0.5 shrink-0 text-[var(--primary-600)]"
                    : "mt-0.5 shrink-0 text-[var(--neutral-400)]"
                }
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-medium text-[var(--neutral-900)]">{tAi("toggleTitle")}</p>
                <p className="text-xs text-[var(--neutral-600)]">
                  {aiAvailability === "enabled"
                    ? tAi("toggleHint")
                    : aiAvailability === "disabled"
                      ? tAi("toggleDisabledHint")
                      : tAi("togglePendingHint")}
                </p>
                {aiMetadata ? (
                  <p className="text-xs font-medium text-[var(--success-700)]">
                    {tAi("draftAppliedHint")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleStartAssist}
                disabled={aiAvailability !== "enabled" || submitting}
                aria-disabled={aiAvailability !== "enabled"}
                className={[
                  "shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  aiAvailability === "enabled"
                    ? "bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)]"
                    : "cursor-not-allowed bg-[var(--neutral-200)] text-[var(--neutral-500)]",
                ].join(" ")}
                title={
                  aiAvailability === "enabled"
                    ? tAi("toggleCta")
                    : tAi("toggleDisabledHint")
                }
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feedback-title">{t("titleLabel")}</Label>
            <Input
              id="feedback-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "BUG" ? t("titlePlaceholderBug") : t("titlePlaceholderFeature")}
              maxLength={120}
              aria-describedby={errors.title ? "feedback-title-error" : undefined}
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <span id="feedback-title-error" className="text-[var(--error-600)] text-xs">
                {errors.title}
              </span>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="feedback-description">{t("descriptionLabel")}</Label>
            <textarea
              id="feedback-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === "BUG" ? t("descriptionPlaceholderBug") : t("descriptionPlaceholderFeature")}
              rows={4}
              maxLength={4000}
              className={[
                "w-full rounded-md border bg-white px-3 py-2 text-sm text-[var(--neutral-900)] placeholder:text-[var(--neutral-500)]",
                "resize-y outline-none transition-colors",
                "focus:border-[var(--primary-500)] focus:ring-2 focus:ring-[var(--primary-500)]/20",
                errors.description ? "border-[var(--error-600)]" : "border-[var(--neutral-300)]",
              ].join(" ")}
              aria-describedby={errors.description ? "feedback-desc-error" : undefined}
              aria-invalid={!!errors.description}
            />
            <div className="flex items-start justify-between">
              {errors.description ? (
                <span id="feedback-desc-error" className="text-[var(--error-600)] text-xs">
                  {errors.description}
                </span>
              ) : (
                <span />
              )}
              <span className="text-[var(--neutral-500)] text-xs ml-auto">
                {description.length}/4000
              </span>
            </div>
          </div>

          {/* Screenshots — multi-image (up to 10) */}
          <div className="relative flex flex-col gap-1.5" {...screenshotDropHandlers}>
            <Label>{t("screenshotLabel")}</Label>

            {/* Legacy AI-draft screenshot pill */}
            {screenshot && (
              <div className="flex items-center gap-2 rounded-md border border-[var(--neutral-300)] bg-[var(--neutral-100)] px-3 py-2">
                <Paperclip size={14} className="text-[var(--neutral-500)] shrink-0" />
                <span className="text-sm text-[var(--neutral-700)] truncate flex-1">
                  {screenshotName ?? "screenshot.png"}
                </span>
                <button
                  type="button"
                  onClick={() => { setScreenshot(null); setScreenshotName(null); }}
                  className="text-[var(--neutral-500)] hover:text-[var(--error-600)] transition-colors"
                  aria-label={t("removeScreenshot")}
                  title={t("removeScreenshot")}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Thumbnail grid */}
            {screenshots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {screenshots.map((s) => (
                  <div
                    key={s.id}
                    className="relative shrink-0 rounded-md overflow-hidden border border-[var(--neutral-200)]"
                    style={{ width: 56, height: 56 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.previewUrl}
                      alt={s.name}
                      className="w-full h-full object-cover block"
                    />
                    {(s.uploading || s.error) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                        {s.uploading
                          ? <Loader2 size={16} className="animate-spin text-white" />
                          : (
                            <button
                              type="button"
                              onClick={() => retryUpload(s.id)}
                              aria-label={t("screenshotUploadFailed")}
                              title={t("screenshotUploadFailed")}
                              className="flex items-center justify-center bg-transparent border-none cursor-pointer p-0"
                            >
                              <AlertCircle size={16} className="text-[var(--error-400)]" />
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
                        className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full bg-black/55 border-none cursor-pointer p-0"
                        style={{ width: 18, height: 18 }}
                      >
                        <X size={10} className="text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add images button */}
            {screenshots.length < MAX_SCREENSHOT_COUNT && !screenshot && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={FEEDBACK_SCREENSHOT_FILE_ACCEPT}
                  multiple
                  onChange={handleFileChange}
                  className="sr-only"
                  id="feedback-screenshot"
                  aria-label={t("screenshotLabel")}
                />
                <label
                  htmlFor="feedback-screenshot"
                  className="flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-[var(--neutral-300)] px-3 py-2 text-sm text-[var(--neutral-500)] hover:border-[var(--primary-500)] hover:text-[var(--primary-500)] transition-colors"
                >
                  <Paperclip size={14} />
                  {t("attachScreenshot")}
                  <span className="ml-auto text-xs">
                    {screenshots.length}/{MAX_SCREENSHOT_COUNT}
                  </span>
                </label>
                {errors.screenshots && (
                  <span className="text-[var(--error-600)] text-xs mt-1 block">
                    {errors.screenshots}
                  </span>
                )}
              </div>
            )}

            <p className="text-xs text-[var(--neutral-500)]">{t("screenshotHint")}</p>
            <FileDropOverlay
              disabled={screenshots.length >= MAX_SCREENSHOT_COUNT || Boolean(screenshot)}
            />
          </div>

          {/* Screen recording */}
          <div className="flex flex-col gap-1.5">
            <Label>{t("recordingLabel")}</Label>

            {recordingState === "idle" && (
              typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function" ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-2 rounded-md border border-dashed border-[var(--neutral-300)] px-3 py-2 text-sm text-[var(--neutral-500)] hover:border-[var(--primary-500)] hover:text-[var(--primary-500)] transition-colors w-full"
                >
                  <Video size={14} />
                  {t("recordScreen")}
                  <span className="ml-auto text-xs">{t("recordingHint")}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--neutral-300)] px-3 py-2 text-sm text-[var(--neutral-400)] w-full cursor-not-allowed">
                  <Video size={14} />
                  {t("recordScreen")}
                  <span className="ml-auto text-xs">{t("recordingNotSupported")}</span>
                </div>
              )
            )}

            {recordingState === "requesting" && (
              <div className="flex items-center gap-2 rounded-md border border-[var(--neutral-300)] bg-[var(--neutral-100)] px-3 py-2 text-sm text-[var(--neutral-500)]">
                <Loader2 size={14} className="animate-spin shrink-0" />
                {t("recordingRequesting")}
              </div>
            )}

            {/* "recording" state is shown via the floating pill outside the modal */}

            {recordingState === "stopped" && recordingBlob && (
              <div className="flex flex-col gap-2 rounded-md border border-[var(--success-300)] bg-[var(--success-50)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <Video size={14} className="text-[var(--success-600)] shrink-0" />
                  <span className="text-sm text-[var(--success-700)] flex-1">
                    {t("recordingReady")}
                    <span className="text-xs text-[var(--neutral-500)] ml-1">
                      ({(recordingBlob.size / (1024 * 1024)).toFixed(1)} MB)
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={removeRecording}
                    disabled={analyzingRecording}
                    className="text-[var(--neutral-500)] hover:text-[var(--error-600)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={t("removeRecording")}
                  >
                    <X size={14} />
                  </button>
                </div>
                {!assistActive && !aiMetadata ? (
                  <button
                    type="button"
                    onClick={() => void handleAnalyzeRecording()}
                    disabled={aiAvailability !== "enabled" || analyzingRecording || submitting}
                    aria-disabled={aiAvailability !== "enabled"}
                    title={
                      aiAvailability === "enabled"
                        ? tAi("analyzeRecording")
                        : tAi("videoAnalysisUnavailable")
                    }
                    className={[
                      "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                      aiAvailability === "enabled"
                        ? "bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)] disabled:opacity-60 disabled:cursor-not-allowed"
                        : "cursor-not-allowed bg-[var(--neutral-200)] text-[var(--neutral-500)]",
                    ].join(" ")}
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

            <p className="text-xs text-[var(--neutral-500)]">{t("recordingHintFull")}</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={submitting || recordingState === "recording"}>
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1" />
                  {recordingBlob ? t("submittingWithRecording") : t("submitting")}
                </>
              ) : (
                t("submit")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
