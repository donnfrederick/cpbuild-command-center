/**
 * Browser / OS speech-to-text helpers (Web Speech API).
 * Uses the device or browser speech engine — no custom STT service.
 */

/** Append a dictated segment to existing text with a space when needed, optional max length. */
export function appendTranscriptSegment(
  current: string,
  segment: string,
  maxLength?: number,
): string {
  const t = segment.trim();
  if (!t) return current;
  const needsSpace = current.length > 0 && !/\s$/.test(current);
  const next = needsSpace ? `${current} ${t}` : `${current}${t}`;
  if (maxLength !== undefined && next.length > maxLength) {
    return next.slice(0, maxLength);
  }
  return next;
}

/** Map next-intl locale (e.g. en, es) to BCP-47 tag for SpeechRecognition.lang */
export function localeToSpeechRecognitionLang(locale: string): string {
  const base = (locale || "en").split("-")[0]?.toLowerCase() ?? "en";
  if (base === "es") return "es-ES";
  return "en-US";
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
}

export type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

export type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}
