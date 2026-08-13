import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  makeFeedbackAssistSessionId,
  MAX_FEEDBACK_RECORDING_SECONDS,
  isFeedbackScreenRecordingSupported,
} from "@/lib/feedback/assist-session";

describe("lib/feedback/assist-session", () => {
  it("exports a 120-second recording limit", () => {
    expect(MAX_FEEDBACK_RECORDING_SECONDS).toBe(120);
  });

  it("isFeedbackScreenRecordingSupported requires getDisplayMedia and MediaRecorder", () => {
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: vi.fn() } });
    vi.stubGlobal("MediaRecorder", class MediaRecorder {});
    expect(isFeedbackScreenRecordingSupported()).toBe(true);
    vi.unstubAllGlobals();
  });

  describe("makeFeedbackAssistSessionId()", () => {
    beforeEach(() => {
      vi.stubGlobal("crypto", {
        randomUUID: vi.fn(() => "11111111-2222-4333-8444-555555555555"),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("returns a UUID from crypto.randomUUID when available", () => {
      expect(makeFeedbackAssistSessionId()).toBe("11111111-2222-4333-8444-555555555555");
    });
  });
});
