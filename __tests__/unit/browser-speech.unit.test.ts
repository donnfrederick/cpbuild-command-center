import { describe, it, expect } from "vitest";
import {
  appendTranscriptSegment,
  localeToSpeechRecognitionLang,
  getSpeechRecognitionConstructor,
} from "@/lib/browser-speech";

describe("appendTranscriptSegment()", () => {
  it("appends trimmed segment with leading space when needed", () => {
    expect(appendTranscriptSegment("hello", "world")).toBe("hello world");
  });

  it("does not double space when current ends with space", () => {
    expect(appendTranscriptSegment("hello ", "world")).toBe("hello world");
  });

  it("returns current when segment is empty or whitespace", () => {
    expect(appendTranscriptSegment("hello", "")).toBe("hello");
    expect(appendTranscriptSegment("hello", "   ")).toBe("hello");
  });

  it("respects maxLength", () => {
    expect(appendTranscriptSegment("ab", "cde", 4)).toBe("ab c");
  });
});

describe("localeToSpeechRecognitionLang()", () => {
  it("maps Spanish locales to es-ES", () => {
    expect(localeToSpeechRecognitionLang("es")).toBe("es-ES");
    expect(localeToSpeechRecognitionLang("es-MX")).toBe("es-ES");
  });

  it("defaults non-Spanish to en-US", () => {
    expect(localeToSpeechRecognitionLang("en")).toBe("en-US");
    expect(localeToSpeechRecognitionLang("")).toBe("en-US");
  });
});

describe("getSpeechRecognitionConstructor()", () => {
  it("returns null in non-browser test environment", () => {
    expect(getSpeechRecognitionConstructor()).toBeNull();
  });
});
