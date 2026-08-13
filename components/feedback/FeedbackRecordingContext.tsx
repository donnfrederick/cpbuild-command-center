"use client";

/**
 * FeedbackRecordingContext — global recording state that persists across
 * layout-boundary navigations (e.g. (dashboard) → (project) route groups).
 *
 * Lives in app/[locale]/layout.tsx alongside TourProvider so the floating
 * pill and the recording blob survive unmounting of any individual layout.
 */

import {
  createContext, useContext, useState, useRef,
  useCallback, useEffect, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Circle, Square } from "lucide-react";
import { MAX_FEEDBACK_RECORDING_SECONDS } from "@/lib/feedback/assist-session";

export type RecordingState = "idle" | "requesting" | "recording" | "stopped";

export interface FeedbackRecordingContextValue {
  recordingState: RecordingState;
  recordingBlob: Blob | null;
  /** Elapsed capture duration in seconds — set when recording stops. */
  recordingDurationSec: number | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  removeRecording: () => void;
  /** True after recording stops — consumed by MobileAccountPanel to auto-open
   *  the feedback sub-panel. Cleared by calling clearPendingFeedbackOpen(). */
  pendingFeedbackOpen: boolean;
  clearPendingFeedbackOpen: () => void;
}

const FeedbackRecordingContext = createContext<FeedbackRecordingContextValue | null>(null);

export function useFeedbackRecording(): FeedbackRecordingContextValue {
  const ctx = useContext(FeedbackRecordingContext);
  if (!ctx) throw new Error("useFeedbackRecording must be used within FeedbackRecordingProvider");
  return ctx;
}

const MAX_RECORDING_SECONDS = MAX_FEEDBACK_RECORDING_SECONDS;

function formatRecordingTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Isolated pill timer — re-renders only this portal, not the provider subtree. */
function FeedbackRecordingPill({ stopRecording }: { stopRecording: () => void }) {
  const tFeedback = useTranslations("feedback");
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORDING_SECONDS);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          stopRecording();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [stopRecording]);

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-label={tFeedback("recordingInProgress")}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 700,
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 999,
        border: "1px solid var(--error-300)",
        backgroundColor: "var(--neutral-0)",
        boxShadow: "var(--shadow-2)",
        padding: "10px 16px",
      }}
    >
      <Circle
        size={10}
        className="animate-pulse"
        style={{ fill: "var(--error-600)", color: "var(--error-600)", flexShrink: 0 }}
      />
      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--error-700)" }}>
        {tFeedback("recordingInProgress")}
      </span>
      <span style={{ fontSize: 14, fontFamily: "monospace", color: "var(--error-600)", minWidth: "3ch" }} aria-hidden="true">
        {formatRecordingTime(secondsLeft)}
      </span>
      <button
        type="button"
        onClick={stopRecording}
        aria-label={tFeedback("stopRecording")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          borderRadius: 6,
          border: "1px solid var(--error-600)",
          backgroundColor: "var(--neutral-0)",
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--error-600)",
          cursor: "pointer",
        }}
      >
        <Square size={10} style={{ fill: "var(--error-600)" }} />
        {tFeedback("stopRecording")}
      </button>
    </div>,
    document.body,
  );
}

export function FeedbackRecordingProvider({ children }: { children: ReactNode }) {
  const [isBrowser, setIsBrowser] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setIsBrowser(true), []);

  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingDurationSec, setRecordingDurationSec] = useState<number | null>(null);
  const [pendingFeedbackOpen, setPendingFeedbackOpen] = useState(false);

  const clearPendingFeedbackOpen = useCallback(() => setPendingFeedbackOpen(false), []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Guarantee cleanup on unmount — stops the MediaStream tracks so nothing
  // keeps running after the locale layout is replaced.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Already stopped — safe to ignore during locale switch / HMR teardown
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (typeof MediaRecorder === "undefined") {
      setRecordingState("idle");
      return;
    }
    setRecordingState("requesting");
    let screenStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch { /* mic is optional */ }

      const tracks: MediaStreamTrack[] = [...screenStream.getTracks()];
      if (micStream) tracks.push(...micStream.getAudioTracks());
      const combinedStream = new MediaStream(tracks);
      streamRef.current = combinedStream;

      chunksRef.current = [];
      const mimeType = [
        "video/webm;codecs=vp9", "video/webm",
        "video/mp4;codecs=avc1", "video/mp4",
      ].find((mt) => MediaRecorder.isTypeSupported(mt)) ?? "";
      const recorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(combinedStream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const actualType = recorder.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        const startedAt = recordingStartedAtRef.current;
        const elapsed = startedAt
          ? Math.min(MAX_RECORDING_SECONDS, Math.round((Date.now() - startedAt) / 1000))
          : MAX_RECORDING_SECONDS;
        recordingStartedAtRef.current = null;
        setRecordingDurationSec(elapsed);
        setRecordingBlob(blob);
        setRecordingState("stopped");
        setPendingFeedbackOpen(true);
      };

      screenStream.getVideoTracks()[0].onended = () => stopRecording();

      recordingStartedAtRef.current = Date.now();
      recorder.start(1000);
      setRecordingState("recording");
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError") {
        console.error("[FeedbackRecording] Recording error:", err);
      }
      setRecordingState("idle");
      recordingStartedAtRef.current = null;
      screenStream?.getTracks().forEach((t) => t.stop());
      micStream?.getTracks().forEach((t) => t.stop());
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
    }
  }, [stopRecording]);

  const removeRecording = useCallback(() => {
    setRecordingBlob(null);
    setRecordingState("idle");
    setRecordingDurationSec(null);
    recordingStartedAtRef.current = null;
    chunksRef.current = [];
  }, []);

  const isRecording = recordingState === "recording";

  return (
    <FeedbackRecordingContext.Provider
      value={{
        recordingState,
        recordingBlob,
        recordingDurationSec,
        startRecording,
        stopRecording,
        removeRecording,
        pendingFeedbackOpen,
        clearPendingFeedbackOpen,
      }}
    >
      {children}
      {isBrowser && isRecording && <FeedbackRecordingPill stopRecording={stopRecording} />}
    </FeedbackRecordingContext.Provider>
  );
}
