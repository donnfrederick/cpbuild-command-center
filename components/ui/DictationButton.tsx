"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import {
  getSpeechRecognitionConstructor,
  localeToSpeechRecognitionLang,
  type BrowserSpeechRecognition,
} from "@/lib/browser-speech";

export interface DictationButtonProps {
  /** Called with each finalized phrase from the speech engine (trimmed). */
  onAppendText: (text: string) => void;
  disabled?: boolean;
  /** Shown in aria-label for screen readers. */
  fieldLabel?: string;
  /** When dictation starts, focus moves here so the caret shows where text will land. */
  focusTargetRef?: RefObject<HTMLElement | null>;
  /** Override or extend the button's inline styles (e.g. for absolute positioning inside a field). */
  style?: CSSProperties;
}

const BTN_BASE: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "none",
  backgroundColor: "var(--neutral-50)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "var(--neutral-600)",
  flexShrink: 0,
  padding: 0,
};

/**
 * Toggle mic: uses Web Speech API (Chrome, Edge, Safari where supported).
 * No backend — OS/browser handles recognition.
 */
export function DictationButton({ onAppendText, disabled, fieldLabel, focusTargetRef, style: styleProp }: DictationButtonProps) {
  const t = useTranslations("dictation");
  const locale = useLocale();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const onAppendRef = useRef(onAppendText);

  useEffect(() => {
    onAppendRef.current = onAppendText;
  }, [onAppendText]);

  // Client-only feature detect (avoid SSR/hydration mismatch vs. sync initializer).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SpeechRecognition only exists in browser after mount
    setSupported(getSpeechRecognitionConstructor() !== null);
  }, []);

  const stopRecognition = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    }
    setListening(false);
  }, []);

  useEffect(() => () => stopRecognition(), [stopRecognition]);

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor || disabled) return;

    const rec = new Ctor();
    rec.lang = localeToSpeechRecognitionLang(locale);
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          const text = r[0]?.transcript?.trim();
          if (text) onAppendRef.current(text);
        }
      }
    };

    rec.onerror = (ev) => {
      const code = ev.error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        toast.error(t("errorPermission"));
      } else if (code !== "aborted" && code !== "no-speech") {
        toast.error(t("errorGeneric"));
      }
      recRef.current = null;
      setListening(false);
    };

    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };

    try {
      recRef.current = rec;
      rec.start();
      setListening(true);
      const el = focusTargetRef?.current;
      if (el) {
        requestAnimationFrame(() => {
          el.focus();
        });
      }
    } catch {
      recRef.current = null;
      setListening(false);
      toast.error(t("errorGeneric"));
    }
  }, [disabled, focusTargetRef, locale, t]);

  const toggle = useCallback(() => {
    if (disabled) return;
    if (listening) stopRecognition();
    else startRecognition();
  }, [disabled, listening, startRecognition, stopRecognition]);

  if (!supported) return null;

  const labelBase = fieldLabel ? `${fieldLabel}: ${listening ? t("stop") : t("start")}` : listening ? t("stop") : t("start");

  return (
    <button
      type="button"
      className={listening ? "dictation-btn dictation-btn--listening" : "dictation-btn"}
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={labelBase}
      title={listening ? t("stop") : t("start")}
      style={{
        ...BTN_BASE,
        ...(listening
          ? {
              backgroundColor: "var(--primary-100)",
              color: "var(--primary-700)",
            }
          : {}),
        ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}),
        ...styleProp,
      }}
    >
      <Mic size={16} strokeWidth={2.25} aria-hidden />
    </button>
  );
}
