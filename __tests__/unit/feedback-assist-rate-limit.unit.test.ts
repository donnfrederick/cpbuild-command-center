import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkFeedbackAssistRateLimit,
  _resetFeedbackAssistRateLimit,
  FEEDBACK_ASSIST_RATE_LIMIT_MS,
  checkFeedbackAssistVideoRateLimit,
  _resetFeedbackAssistVideoRateLimit,
  FEEDBACK_ASSIST_VIDEO_MAX_PER_HOUR,
  FEEDBACK_ASSIST_VIDEO_WINDOW_MS,
} from "@/lib/feedback-assist-rate-limit";

describe("checkFeedbackAssistRateLimit", () => {
  beforeEach(() => {
    _resetFeedbackAssistRateLimit();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first call for a user", () => {
    expect(checkFeedbackAssistRateLimit("user-a")).toBe(true);
  });

  it("blocks a second call within the cooldown window", () => {
    expect(checkFeedbackAssistRateLimit("user-a")).toBe(true);
    vi.advanceTimersByTime(FEEDBACK_ASSIST_RATE_LIMIT_MS - 10);
    expect(checkFeedbackAssistRateLimit("user-a")).toBe(false);
  });

  it("allows another call once the cooldown elapses", () => {
    expect(checkFeedbackAssistRateLimit("user-a")).toBe(true);
    vi.advanceTimersByTime(FEEDBACK_ASSIST_RATE_LIMIT_MS + 1);
    expect(checkFeedbackAssistRateLimit("user-a")).toBe(true);
  });

  it("tracks users independently", () => {
    expect(checkFeedbackAssistRateLimit("user-a")).toBe(true);
    expect(checkFeedbackAssistRateLimit("user-b")).toBe(true);
    expect(checkFeedbackAssistRateLimit("user-a")).toBe(false);
  });
});

describe("checkFeedbackAssistVideoRateLimit", () => {
  beforeEach(() => {
    _resetFeedbackAssistVideoRateLimit();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the hourly cap, then blocks further calls", () => {
    for (let i = 0; i < FEEDBACK_ASSIST_VIDEO_MAX_PER_HOUR; i++) {
      expect(checkFeedbackAssistVideoRateLimit("user-a")).toBe(true);
      vi.advanceTimersByTime(1_000);
    }
    expect(checkFeedbackAssistVideoRateLimit("user-a")).toBe(false);
  });

  it("frees up the quota after the window rolls past the oldest call", () => {
    for (let i = 0; i < FEEDBACK_ASSIST_VIDEO_MAX_PER_HOUR; i++) {
      expect(checkFeedbackAssistVideoRateLimit("user-a")).toBe(true);
      vi.advanceTimersByTime(1_000);
    }
    expect(checkFeedbackAssistVideoRateLimit("user-a")).toBe(false);
    vi.advanceTimersByTime(FEEDBACK_ASSIST_VIDEO_WINDOW_MS);
    expect(checkFeedbackAssistVideoRateLimit("user-a")).toBe(true);
  });

  it("tracks users independently", () => {
    for (let i = 0; i < FEEDBACK_ASSIST_VIDEO_MAX_PER_HOUR; i++) {
      expect(checkFeedbackAssistVideoRateLimit("user-a")).toBe(true);
    }
    expect(checkFeedbackAssistVideoRateLimit("user-a")).toBe(false);
    expect(checkFeedbackAssistVideoRateLimit("user-b")).toBe(true);
  });

  it("is independent of the text-turn cooldown", () => {
    // Exhausting the text cooldown has no effect on the video quota.
    checkFeedbackAssistRateLimit("user-a");
    expect(checkFeedbackAssistRateLimit("user-a")).toBe(false);
    expect(checkFeedbackAssistVideoRateLimit("user-a")).toBe(true);
  });
});
