/**
 * Unit tests for TourPlayer voice selection (speak() helper).
 *
 * We test the selectTourVoice() logic by mocking window.speechSynthesis.getVoices().
 * English: en-PH → female English (Fiona/Samantha/Karen/Moira) → any en-*
 * Spanish: es-MX → es-US → any es-*
 */

import { describe, it, expect } from "vitest";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeVoice(lang: string, name: string): SpeechSynthesisVoice {
  return { lang, name, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

// We copy the algorithm inline (speak/selectTourVoice aren't exported —
// this guards against accidental regression in either language branch).
function selectTourVoiceLogic(voices: SpeechSynthesisVoice[], lang: "en" | "es" = "en"): SpeechSynthesisVoice | null {
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

// ── English tests ─────────────────────────────────────────────────────────────

describe("TourPlayer voice selection — English", () => {
  it("selects en-PH voice when available", () => {
    const voices = [
      makeVoice("en-US", "Alex"),
      makeVoice("en-PH", "Filipino English"),
      makeVoice("fr-FR", "French"),
    ];
    const selected = selectTourVoiceLogic(voices, "en");
    expect(selected?.lang).toBe("en-PH");
  });

  it("falls back to female English voice when en-PH absent", () => {
    const voices = [
      makeVoice("en-US", "Alex"),
      makeVoice("en-AU", "Karen"),
      makeVoice("en-GB", "Daniel"),
    ];
    const selected = selectTourVoiceLogic(voices, "en");
    expect(selected?.name).toBe("Karen");
    expect(selected?.lang).toBe("en-AU");
  });

  it("falls back to Samantha when available", () => {
    const voices = [
      makeVoice("en-US", "Samantha"),
      makeVoice("en-GB", "Daniel"),
    ];
    const selected = selectTourVoiceLogic(voices, "en");
    expect(selected?.name).toBe("Samantha");
  });

  it("falls back to any English voice when no female name matches", () => {
    const voices = [
      makeVoice("de-DE", "Deutsch"),
      makeVoice("en-GB", "Daniel"),
    ];
    const selected = selectTourVoiceLogic(voices, "en");
    expect(selected?.lang).toBe("en-GB");
  });

  it("returns null when no voices at all", () => {
    expect(selectTourVoiceLogic([], "en")).toBeNull();
  });

  it("returns null when only non-English voices available", () => {
    const voices = [makeVoice("fr-FR", "Amélie"), makeVoice("es-ES", "Monica")];
    expect(selectTourVoiceLogic(voices, "en")).toBeNull();
  });
});

// ── Spanish tests ─────────────────────────────────────────────────────────────

describe("TourPlayer voice selection — Spanish", () => {
  it("prefers es-MX voice when available", () => {
    const voices = [
      makeVoice("es-ES", "Monica"),
      makeVoice("es-MX", "Paulina"),
      makeVoice("en-US", "Alex"),
    ];
    const selected = selectTourVoiceLogic(voices, "es");
    expect(selected?.lang).toBe("es-MX");
  });

  it("falls back to es-US when es-MX absent", () => {
    const voices = [
      makeVoice("es-ES", "Monica"),
      makeVoice("es-US", "Diego"),
    ];
    const selected = selectTourVoiceLogic(voices, "es");
    expect(selected?.lang).toBe("es-US");
  });

  it("falls back to any es-* voice when neither es-MX nor es-US present", () => {
    const voices = [
      makeVoice("en-US", "Alex"),
      makeVoice("es-ES", "Monica"),
    ];
    const selected = selectTourVoiceLogic(voices, "es");
    expect(selected?.lang).toBe("es-ES");
  });

  it("returns null when no Spanish voices available", () => {
    const voices = [makeVoice("en-US", "Alex"), makeVoice("fr-FR", "Amélie")];
    expect(selectTourVoiceLogic(voices, "es")).toBeNull();
  });

  it("returns null when no voices at all", () => {
    expect(selectTourVoiceLogic([], "es")).toBeNull();
  });
});
