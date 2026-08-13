"use client";

/**
 * TourPlayer — guided tour overlay using Web Speech API for narration.
 *
 * Lifecycle:
 * 1. On mount, check sessionStorage for a "pendingTour" (initial start) key.
 * 2. Also listens for "tour:request" CustomEvent (dispatched by TourPicker/SiteTourLauncher)
 *    so tours launched from the panel start immediately without a page reload.
 * 3. Play the tour: each step highlights a DOM element and speaks voiceText.
 * 4. On finish or skip, clear sessionStorage and stop speech synthesis.
 *
 * Cross-page navigation:
 * - goToStep sets `pendingNavStep` (does NOT navigate immediately).
 * - TourCursor animates to the sidebar nav link, fires a click pulse, then calls
 *   `handleNavAnimationComplete`.
 * - handleNavAnimationComplete writes `activeTour` to sessionStorage, sets
 *   tourState → null (hides card), then calls router.push.
 * - The pathname-watching effect fires on the new page and restores tourState
 *   from sessionStorage, continuing the tour at the correct step.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import type { LocalizedString } from "@/lib/site-tour-steps";
import { Volume2, VolumeX, ChevronRight, ChevronLeft, X, Play, Pause } from "lucide-react";
import { TourCursor } from "./TourCursor";

export interface TourAutoInteract {
  type: "type" | "click" | "dispatch";
  text?: string;
  /** CustomEvent name dispatched on window (only used when type === 'dispatch'). */
  eventName?: string;
  cleanupOnLeave?: "clear" | "escape";
}

export interface TourStep {
  order: number;
  pageUrl: string;
  elementSelector: string;
  /** Plain string for builder-created tours; LocalizedString object from site-tour API. */
  title: string | LocalizedString;
  description: string | LocalizedString;
  voiceText: string | LocalizedString;
  autoInteract?: TourAutoInteract;
}

/** Returns the plain string value from a field that is either a bare string or a LocalizedString object. */
export function resolveLocalized(value: string | LocalizedString, locale: "en" | "es" = "en"): string {
  if (typeof value === "string") return value;
  return value[locale];
}

interface ActiveTourState {
  feedbackId?: string;
  releaseId?: string;
  siteTour?: boolean;
  steps: TourStep[];
  currentIndex: number;
  autoPlay?: boolean;
  speed?: number;
  /** Tour narration / card language — persisted across page navigations. */
  tourLang?: "en" | "es";
}

interface PendingNavStep {
  /** The pageUrl string (e.g. "/projects") passed to router.push */
  targetPath: string;
  /** Full tour state serialized to sessionStorage after cursor animation */
  state: ActiveTourState;
}

const PENDING_KEY = "pendingTour";
const ACTIVE_KEY = "activeTour";

export const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;
export type SpeedOption = (typeof SPEED_OPTIONS)[number];

/**
 * Selects the best available voice for the tour narrator.
 *
 * English priority: en-PH → female English (Fiona/Samantha/Karen/Moira) → any en-*
 * Spanish priority: es-MX → es-US → any es-*
 *
 * Voices are loaded asynchronously; this is called after voiceschanged fires or
 * lazily on first speak (the fallback chain handles cold starts).
 */
function selectTourVoice(lang: "en" | "es" = "en"): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (lang === "es") {
    return (
      voices.find((v) => v.lang === "es-MX") ??
      voices.find((v) => v.lang === "es-US") ??
      voices.find((v) => v.lang.startsWith("es-")) ??
      null
    );
  }
  return (
    voices.find((v) => v.lang === "en-PH") ??
    voices.find((v) => v.lang.startsWith("en-") && /female|fiona|samantha|karen|moira/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en-")) ??
    null
  );
}

/**
 * Speak `text` using the Web Speech API (or a timed no-op when muted).
 * Returns a cancel function — call it to stop any pending speech or muted timer
 * immediately. Used as the cleanup return value of the speak useEffect so that
 * stale step callbacks are never invoked after the step has changed.
 */
function speak(text: string, muted: boolean, speed: number, lang: "en" | "es", onEnd?: () => void): () => void {
  if (!text || typeof window === "undefined") return () => {};
  if (!("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.cancel();

  let cancelled = false;

  if (muted) {
    if (onEnd) {
      const timer = setTimeout(() => { if (!cancelled) onEnd(); }, 1200);
      return () => { cancelled = true; clearTimeout(timer); };
    }
    return () => { cancelled = true; };
  }

  const doSpeak = () => {
    if (cancelled) return;
    const utt = new SpeechSynthesisUtterance(text);
    const voice = selectTourVoice(lang);
    if (voice) {
      utt.voice = voice;
      utt.lang = voice.lang;
    } else {
      utt.lang = lang === "es" ? "es-MX" : "en-PH";
    }
    utt.rate = 0.92 * speed;
    utt.pitch = 1.1;
    if (onEnd) utt.onend = () => { if (!cancelled) onEnd(); };
    window.speechSynthesis.speak(utt);
  };

  // Voices may not be loaded on first call — wait for voiceschanged, then speak
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak();
    return () => { cancelled = true; window.speechSynthesis.cancel(); };
  }

  const onVoicesChanged = () => {
    window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
    doSpeak();
  };
  window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
  // Fallback: if voiceschanged never fires (some browsers), speak anyway after 300ms
  const fallbackTimer = setTimeout(() => {
    window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
    if (!cancelled && !window.speechSynthesis.speaking) doSpeak();
  }, 300);

  return () => {
    cancelled = true;
    clearTimeout(fallbackTimer);
    window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
    window.speechSynthesis.cancel();
  };
}

function stopSpeech() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Set a React-controlled input's value programmatically.
 * Standard DOM value assignment bypasses React's synthetic event system;
 * using the native setter + dispatching an input event makes React update state.
 */
function setReactInputValue(el: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (proto?.set) {
    proto.set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

const TYPING_DELAY_MS = 75;

/**
 * Simulate an agent typing text into an input one character at a time.
 * Clears the field first, then appends characters with TYPING_DELAY_MS between each.
 *
 * `isCancelled` is checked before every character write — if it returns true
 * (because the user clicked Next while typing was in progress), the loop aborts
 * immediately so stale DOM events don't interfere with subsequent steps.
 *
 * After all characters are typed, dispatches a `tour:search` CustomEvent so
 * React components that debounce their onChange handler (like ProjectsTable) can
 * still pick up the final value without relying on native event tricks.
 */
async function simulateTyping(
  selector: string,
  text: string,
  isCancelled: () => boolean
): Promise<void> {
  const container = document.querySelector(selector);
  if (!container) return;
  // The selector may match a wrapper div — find the actual input inside it
  const el =
    container instanceof HTMLInputElement
      ? container
      : (container.querySelector("input") as HTMLInputElement | null);
  if (!el) return;
  el.focus();
  setReactInputValue(el, "");
  for (let i = 1; i <= text.length; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, TYPING_DELAY_MS));
    if (isCancelled()) return;
    setReactInputValue(el, text.slice(0, i));
  }
  // Belt-and-suspenders: notify React-controlled search components of the final value.
  if (!isCancelled()) {
    window.dispatchEvent(new CustomEvent("tour:search", { detail: { query: text } }));
  }
}

/** Clear a typed input back to "" and blur it. Also fires tour:search so debounced filters reset. */
function clearInteractedInput(selector: string) {
  const container = document.querySelector(selector);
  if (!container) return;
  const el =
    container instanceof HTMLInputElement
      ? container
      : (container.querySelector("input") as HTMLInputElement | null);
  if (!el) return;
  setReactInputValue(el, "");
  el.blur();
  window.dispatchEvent(new CustomEvent("tour:search", { detail: { query: "" } }));
}

/** Dispatch an Escape keydown on document — closes modals and dropdowns. */
function dispatchEscape() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
}

/** Clean up whatever auto-interaction was active on a step before leaving it. */
function cleanupAutoInteract(step: TourStep) {
  if (!step.autoInteract?.cleanupOnLeave) return;
  if (step.autoInteract.cleanupOnLeave === "clear") {
    clearInteractedInput(step.elementSelector);
  } else if (step.autoInteract.cleanupOnLeave === "escape") {
    dispatchEscape();
  }
}

type TourPayload = {
  feedbackId?: string;
  releaseId?: string;
  siteTour?: boolean;
  autoPlay?: boolean;
  speed?: number;
  /** 0-based index to start the tour at (used by SiteTourInspector "Play from step N"). */
  startIndex?: number;
  /**
   * Pre-built step list from the SiteTourInspector editor.
   * When provided the API fetch is skipped entirely — these steps are used as-is.
   */
  stepsOverride?: TourStep[];
};

function buildApiUrl(pending: TourPayload): string | null {
  if (pending.siteTour) return "/api/site-tour";
  if (pending.releaseId) return `/api/releases/${pending.releaseId}/tour`;
  if (pending.feedbackId) return `/api/feedback/${pending.feedbackId}/tour`;
  return null;
}

/** Maps a tour step pageUrl to the sidebar data-tour nav attribute selector. */
export function getNavSelectorForPath(path: string): string {
  const normalized = new URL(path, "http://x").pathname;
  if (normalized === "/" || normalized === "") return '[data-tour="nav-dashboard"]';
  if (normalized.startsWith("/projects")) return '[data-tour="nav-projects"]';
  if (normalized.startsWith("/users")) return '[data-tour="nav-users"]';
  return '[data-tour="nav-dashboard"]';
}

/**
 * Resolve a step text field to the requested language.
 * Accepts either a plain string (TourBuilder-created tours) or a LocalizedString
 * object `{ en, es }` (site tour — arrives via the /api/site-tour JSON response
 * where SITE_TOUR_STEPS fields are serialised as objects at runtime even though
 * TourStep types them as `string` for backward compat with TourBuilder).
 */
function localize(s: unknown, lang: "en" | "es"): string {
  if (typeof s === "string") return s;
  if (s !== null && typeof s === "object") {
    const obj = s as Record<string, string>;
    return obj[lang] ?? obj.en ?? "";
  }
  return "";
}

export function TourPlayer() {
  const t = useTranslations("tour");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [tourState, setTourState] = useState<ActiveTourState | null>(null);
  const [muted, setMuted] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [speed, setSpeed] = useState<SpeedOption>(1);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [pendingNavStep, setPendingNavStep] = useState<PendingNavStep | null>(null);
  // Tour narration language — starts from site locale, can be toggled independently.
  const [tourLang, setTourLang] = useState<"en" | "es">(locale.startsWith("es") ? "es" : "en");

  // Backdrop nudge: briefly pulses the card's glow when the user clicks outside it.
  const [nudge, setNudge] = useState(false);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBackdropClick = useCallback(() => {
    if (nudgeTimerRef.current !== null) clearTimeout(nudgeTimerRef.current);
    // Reset the state to false first so rapid clicks restart the animation.
    setNudge(false);
    requestAnimationFrame(() => {
      setNudge(true);
      nudgeTimerRef.current = setTimeout(() => setNudge(false), 420);
    });
  }, []);
  /** Incrementing this re-triggers the speak effect for the current step (used by Resume). */
  const [speakTrigger, setSpeakTrigger] = useState(0);

  const highlightInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * Ref-tracked autoPlay so the speak onEnd callback always reads the current
   * value without becoming a stale closure and without being in speak's deps.
   */
  const autoPlayRef = useRef(autoPlay);
  useEffect(() => { autoPlayRef.current = autoPlay; }, [autoPlay]);

  const currentStep = tourState ? tourState.steps[tourState.currentIndex] : null;

  // Keep highlight synced on scroll/resize
  const computeHighlight = useCallback((selector: string) => {
    if (!selector) { setHighlightRect(null); return; }
    const el = document.querySelector(selector);
    setHighlightRect(el ? el.getBoundingClientRect() : null);
  }, []);

  useEffect(() => {
    // Pause highlight tracking while cursor is animating to a nav link —
    // prevents setHighlightRect from re-rendering TourPlayer every 500ms,
    // which would create a new cursorPendingNav object and cancel the nav timer.
    if (pendingNavStep) { setHighlightRect(null); return; }
    if (!currentStep?.elementSelector) { setHighlightRect(null); return; }
    computeHighlight(currentStep.elementSelector);
    const handler = () => computeHighlight(currentStep.elementSelector);
    window.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    highlightInterval.current = setInterval(handler, 500);
    return () => {
      window.removeEventListener("scroll", handler);
      window.removeEventListener("resize", handler);
      if (highlightInterval.current) clearInterval(highlightInterval.current);
    };
  }, [currentStep, computeHighlight, pendingNavStep]);

  /**
   * Speak current step voiceText.
   * autoPlay is intentionally NOT in deps — changing autoPlay (Pause/Resume)
   * must not restart speech. The onEnd callback reads autoPlayRef.current at
   * call time so auto-advance still works correctly.
   * speakTrigger IS in deps so Resume can explicitly replay the current step.
   *
   * The cancel function returned by speak() is used as the useEffect cleanup so
   * that stale muted-mode timers and speech utterances are cancelled immediately
   * when the step changes. Without this, a timer queued for step N-1 could fire
   * after the user has already advanced to step N, causing the tour to jump past
   * the last step into an invalid index (the restart-loop bug).
   */
  useEffect(() => {
    if (!currentStep) return;
    const isLast = tourState ? tourState.currentIndex >= tourState.steps.length - 1 : true;
    return speak(
      localize(currentStep.voiceText, tourLang),
      muted,
      speed,
      tourLang,
      () => {
        if (autoPlayRef.current && !isLast) {
          setTourState((s) => s ? { ...s, currentIndex: s.currentIndex + 1 } : s);
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, muted, speed, speakTrigger, tourLang]);

  /**
   * Auto-interaction effect: after the cursor animation settles (~700ms), fire
   * the step's autoInteract action so the tour demos real app behaviour.
   * Only fires for same-page steps (pendingNavStep means we're mid-navigation).
   *
   * `cancelled` is set to true in the cleanup function so that any in-flight
   * simulateTyping loop stops immediately when the user advances to the next step.
   */
  useEffect(() => {
    if (!currentStep?.autoInteract) return;
    if (pendingNavStep) return;

    const { type, text } = currentStep.autoInteract;
    const selector = currentStep.elementSelector;
    let cancelled = false;

    // Wait for cursor to arrive before interacting
    const timer = setTimeout(() => {
      if (type === "click") {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) el.click();
      } else if (type === "type" && text) {
        void simulateTyping(selector, text, () => cancelled);
      } else if (type === "dispatch" && currentStep.autoInteract?.eventName) {
        window.dispatchEvent(new CustomEvent(currentStep.autoInteract.eventName, { detail: { lang: tourLang } }));
      }
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentStep, pendingNavStep, tourLang]);

  const loadAndStartTour = useCallback(async (pending: TourPayload) => {
    let sorted: TourStep[];

    if (pending.stepsOverride && pending.stepsOverride.length > 0) {
      // Inspector editor supplied steps directly — skip the API fetch.
      sorted = [...pending.stepsOverride].sort((a, b) => a.order - b.order);
    } else {
      const apiUrl = buildApiUrl(pending);
      if (!apiUrl) return;
      try {
        const res = await fetch(apiUrl);
        if (!res.ok) return;
        const tour = await res.json() as { steps: TourStep[] };
        sorted = [...tour.steps].sort((a, b) => a.order - b.order);
      } catch {
        return;
      }
    }

    // For site tours, merge any text edits saved by the Site Tour Inspector.
    // This means Inspector edits apply to every tour launch, not just "Play from here".
    if (pending.siteTour) {
      try {
        const editsRaw = localStorage.getItem("cc-tour-step-edits");
        if (editsRaw) {
          type StepEdits = { titleEn: string; titleEs: string; descEn: string; descEs: string; voiceEn: string; voiceEs: string };
          const editsMap = JSON.parse(editsRaw) as Record<string | number, StepEdits>;
          sorted = sorted.map((step) => {
            const ov = editsMap[step.order] ?? editsMap[String(step.order)];
            if (!ov) return step;
            return {
              ...step,
              title: { en: ov.titleEn, es: ov.titleEs },
              description: { en: ov.descEn, es: ov.descEs },
              voiceText: { en: ov.voiceEn, es: ov.voiceEs },
            };
          });
        }
      } catch {
        // Edits are optional — silently ignore parse errors
      }
    }

    if (sorted.length === 0) return;

    try {

      const startIndex = Math.min(pending.startIndex ?? 0, sorted.length - 1);
      const firstStep = sorted[startIndex];
      const sourceId = pending.siteTour
        ? { siteTour: true as const }
        : pending.releaseId
        ? { releaseId: pending.releaseId }
        : { feedbackId: pending.feedbackId };

      const state: ActiveTourState = {
        ...sourceId,
        steps: sorted,
        currentIndex: startIndex,
        autoPlay: pending.autoPlay ?? false,
        speed: pending.speed ?? 1,
      };

      // Release tours are informational overlays — they should start on the
      // current page regardless of what pageUrl Gemini generated. Only site
      // tours (manual walkthroughs) navigate to their first step's page.
      const firstPath = new URL(firstStep.pageUrl, window.location.origin).pathname;
      const isReleaseTour = !!pending.releaseId;
      if (!isReleaseTour && firstPath !== pathname) {
        sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(state));
        router.push(firstStep.pageUrl as Parameters<typeof router.push>[0]);
        return;
      }

      setTourState(state);
      setAutoPlay(!!pending.autoPlay);
      setSpeed((pending.speed as SpeedOption) ?? 1);
    } catch {
      // Tour load failures are non-critical
    }
  }, [pathname, router]);

  /**
   * Mount effect: check for a PENDING_KEY (initial tour start from TourPicker/SiteTourLauncher).
   * Runs once on mount only. Cross-page ACTIVE_KEY restoration is handled below.
   */
  useEffect(() => {
    const pendingRaw = sessionStorage.getItem(PENDING_KEY);
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw) as TourPayload;
        sessionStorage.removeItem(PENDING_KEY);
        void loadAndStartTour(pending);
      } catch {
        sessionStorage.removeItem(PENDING_KEY);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Pathname-watching effect: restore cross-page tour state when the route changes.
   * TourPlayer lives in the shared layout and never remounts between routes, so we
   * watch pathname instead of relying on mount to read sessionStorage.
   */
  useEffect(() => {
    // Don't clobber an already-running tour
    if (tourState !== null) return;
    const activeRaw = sessionStorage.getItem(ACTIVE_KEY);
    if (!activeRaw) return;
    try {
      const state = JSON.parse(activeRaw) as ActiveTourState;
      sessionStorage.removeItem(ACTIVE_KEY);
      setTourState(state);
      if (state.autoPlay) setAutoPlay(true);
      if (state.speed) setSpeed(state.speed as SpeedOption);
      if (state.tourLang) setTourLang(state.tourLang);
    } catch {
      sessionStorage.removeItem(ACTIVE_KEY);
    }
    // tourState intentionally omitted — we only want this to run on route changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Listen for "tour:request" CustomEvent — dispatched by TourPicker and other launchers
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TourPayload>).detail;
      void loadAndStartTour(detail);
    };
    window.addEventListener("tour:request", handler);
    return () => window.removeEventListener("tour:request", handler);
  }, [loadAndStartTour]);

  function endTour() {
    if (currentStep?.autoInteract) {
      cleanupAutoInteract(currentStep);
    }
    stopSpeech();
    if (nudgeTimerRef.current !== null) clearTimeout(nudgeTimerRef.current);
    sessionStorage.removeItem(ACTIVE_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    setTourState(null);
    setHighlightRect(null);
    setPendingNavStep(null);
    setNudge(false);
  }

  /**
   * Navigate to a specific step index.
   * For same-page steps: updates tourState directly.
   * For cross-page steps: sets pendingNavStep — TourCursor animates to the
   * sidebar nav link, then calls handleNavAnimationComplete to execute the push.
   */
  function goToStep(index: number) {
    if (!tourState) return;
    const target = tourState.steps[index];
    if (!target) return;

    // Clean up any active auto-interaction before leaving the current step
    if (currentStep?.autoInteract) {
      cleanupAutoInteract(currentStep);
    }

    stopSpeech();
    const targetPath = new URL(target.pageUrl, window.location.origin).pathname;
    if (targetPath !== pathname) {
      const newState: ActiveTourState = { ...tourState, currentIndex: index, autoPlay, speed, tourLang };
      setPendingNavStep({ targetPath: target.pageUrl, state: newState });
      return;
    }

    setTourState((s) => s ? { ...s, currentIndex: index } : s);
  }

  /**
   * Called by TourCursor after it has finished animating to the sidebar nav link
   * and showing the click pulse. At this point it's safe to navigate.
   */
  const handleNavAnimationComplete = useCallback(() => {
    if (!pendingNavStep) return;
    const { targetPath, state } = pendingNavStep;
    // flushSync ensures both state updates are committed to the DOM before
    // router.push fires. Without this, React's concurrent batching can leave
    // tourState !== null when the pathname-watching effect runs on the new
    // route, causing the guard `if (tourState !== null) return` to short-circuit
    // and skip restoring the tour from sessionStorage.
    flushSync(() => {
      setPendingNavStep(null);
      setTourState(null);
    });
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(state));
    router.push(targetPath as Parameters<typeof router.push>[0]);
  }, [pendingNavStep, router]);

  function handleNext() {
    if (!tourState) return;
    const nextIndex = tourState.currentIndex + 1;
    if (nextIndex >= tourState.steps.length) {
      endTour();
    } else {
      goToStep(nextIndex);
    }
  }

  function handlePrev() {
    if (!tourState || tourState.currentIndex === 0) return;
    goToStep(tourState.currentIndex - 1);
  }

  /** Pause: stop voice immediately, disable auto-advance. Does NOT restart speech. */
  const handlePause = useCallback(() => {
    stopSpeech();
    setAutoPlay(false);
  }, []);

  /** Resume: re-trigger current step's voice from beginning, enable auto-advance. */
  const handleResume = useCallback(() => {
    setAutoPlay(true);
    setSpeakTrigger((n) => n + 1);
  }, []);

  /**
   * Memoized so the object reference is stable across re-renders — prevents
   * TourCursor's useEffect from seeing a new dep and cancelling its nav timer.
   */
  const cursorPendingNav = useMemo(
    () =>
      pendingNavStep
        ? {
            targetPath: pendingNavStep.targetPath,
            navSelector: getNavSelectorForPath(pendingNavStep.targetPath),
          }
        : null,
    [pendingNavStep]
  );

  if (!tourState && !pendingNavStep) return null;

  // While pending nav is in progress, tourState may be null (card hidden) but
  // we still render TourCursor so the animation plays out.
  const isFirst = tourState ? tourState.currentIndex === 0 : true;
  const isLast = tourState ? tourState.currentIndex === tourState.steps.length - 1 : false;

  return (
    <>
      {/* Keyframe for tour-card nudge animation */}
      <style>{`
        @keyframes tour-card-nudge {
          0%   { box-shadow: 0 8px 40px rgba(0,0,0,0.28); }
          25%  { box-shadow: 0 8px 40px rgba(0,0,0,0.28), 0 0 0 4px rgba(59,130,246,0.55); }
          75%  { box-shadow: 0 8px 40px rgba(0,0,0,0.28), 0 0 0 4px rgba(59,130,246,0.2); }
          100% { box-shadow: 0 8px 40px rgba(0,0,0,0.28); }
        }
      `}</style>

      {/* Animated agent cursor — always rendered while tour is active */}
      <TourCursor
        currentStep={currentStep}
        pendingNavStep={cursorPendingNav}
        onNavAnimationComplete={handleNavAnimationComplete}
      />

      {/* Full-screen dim overlay — intercepts all background clicks to lock the UI
          during the tour. Clicking the backdrop nudges the tour card rather than
          dismissing the tour. */}
      <div
        aria-hidden="true"
        onClick={handleBackdropClick}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          pointerEvents: "auto",
          cursor: "default",
        }}
      >
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <mask id="tour-cutout">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {highlightRect && (
                <rect
                  x={highlightRect.left - 8}
                  y={highlightRect.top - 8}
                  width={highlightRect.width + 16}
                  height={highlightRect.height + 16}
                  rx="6"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.55)"
            mask="url(#tour-cutout)"
          />
          {/* Highlight ring */}
          {highlightRect && (
            <rect
              x={highlightRect.left - 8}
              y={highlightRect.top - 8}
              width={highlightRect.width + 16}
              height={highlightRect.height + 16}
              rx="6"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
            />
          )}
        </svg>
      </div>

      {/* Tour card — hidden while page transition is in progress */}
      {tourState && currentStep && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={t("title")}
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1001,
            width: "min(460px, calc(100vw - 32px))",
            backgroundColor: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 8px 40px rgba(0,0,0,0.28)",
            overflow: "hidden",
            borderTop: "3px solid #3b82f6",
            animation: nudge ? "tour-card-nudge 0.42s ease" : undefined,
          }}
        >
          {/* Progress bar */}
          <div style={{ height: 3, backgroundColor: "#e5e7eb" }}>
            <div
              style={{
                height: "100%",
                width: `${((tourState.currentIndex + 1) / tourState.steps.length) * 100}%`,
                backgroundColor: "#3b82f6",
                transition: "width 0.3s ease",
              }}
            />
          </div>

          <div style={{ padding: "14px 18px" }}>
            {/* Header: step badge + title + icon controls */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 8px",
                    borderRadius: 100,
                    backgroundColor: "#dbeafe",
                    color: "#1d4ed8",
                    fontSize: 11,
                    fontWeight: 600,
                    marginBottom: 4,
                    letterSpacing: "0.02em",
                  }}
                >
                  {t("step", {
                    current: tourState.currentIndex + 1,
                    total: tourState.steps.length,
                  })}
                </span>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
                  {localize(currentStep.title, tourLang)}
                </h4>
              </div>

              {/* Icon controls: EN/ES toggle, mute, close */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8, alignItems: "center" }}>
                {/* EN / ES language pill toggle */}
                <div
                  role="group"
                  aria-label="Tour language"
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {(["en", "es"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setTourLang(l)}
                      aria-pressed={tourLang === l}
                      aria-label={l === "en" ? "English narration" : "Narración en español"}
                      style={{
                        padding: "2px 7px",
                        fontSize: 11,
                        fontWeight: tourLang === l ? 700 : 400,
                        lineHeight: "18px",
                        border: "none",
                        backgroundColor: tourLang === l ? "#1d4ed8" : "transparent",
                        color: tourLang === l ? "#ffffff" : "#6b7280",
                        cursor: "pointer",
                        transition: "background-color 0.12s, color 0.12s",
                      }}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? t("unmute") : t("mute")}
                  aria-pressed={muted}
                  title={muted ? t("unmute") : t("mute")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    border: "none",
                    borderRadius: 6,
                    backgroundColor: muted ? "#f3f4f6" : "transparent",
                    cursor: "pointer",
                    color: muted ? "#9ca3af" : "#6b7280",
                  }}
                >
                  {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>

                <button
                  type="button"
                  onClick={endTour}
                  aria-label={t("skip")}
                  title={t("skip")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    border: "none",
                    borderRadius: 6,
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    color: "#9ca3af",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Description */}
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#374151", lineHeight: 1.55 }}>
              {localize(currentStep.description, tourLang)}
            </p>

            {/* Navigation row: Back | Pause/Resume | Speed | Next */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={handlePrev}
                disabled={isFirst}
                aria-label={t("prev")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  backgroundColor: "transparent",
                  color: isFirst ? "#d1d5db" : "#374151",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: isFirst ? "not-allowed" : "pointer",
                  flexShrink: 0,
                }}
              >
                <ChevronLeft size={14} />
                {t("prev")}
              </button>

              {/* Pause / Resume — does NOT restart voice on toggle */}
              <button
                type="button"
                onClick={autoPlay ? handlePause : handleResume}
                aria-pressed={autoPlay}
                aria-label={autoPlay ? t("pause") : t("resume")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 12px",
                  border: "1px solid",
                  borderColor: autoPlay ? "#93c5fd" : "#d1d5db",
                  borderRadius: 6,
                  backgroundColor: autoPlay ? "#dbeafe" : "transparent",
                  color: autoPlay ? "#1d4ed8" : "#374151",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {autoPlay ? <Pause size={13} /> : <Play size={13} />}
                {autoPlay ? t("pause") : t("resume")}
              </button>

              {/* Speed selector */}
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value) as SpeedOption)}
                aria-label="Playback speed"
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  backgroundColor: "transparent",
                  color: "#374151",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>

              {/* Next / Finish */}
              <button
                type="button"
                onClick={handleNext}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 16px",
                  border: "none",
                  borderRadius: 6,
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {isLast ? t("finish") : t("next")}
                {!isLast && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
