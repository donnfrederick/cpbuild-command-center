import { describe, it, expect } from "vitest";
import {
  assistCalibrateRequestSchema,
  assistCalibrateResponseSchema,
  assistFinalReportSchema,
  assistTurnRequestSchema,
  assistTurnResponseSchema,
  assistVideoRefSchema,
  assistVideoRequestMetadataSchema,
  feedbackAssistMetadataSchema,
  parseFeedbackAssistMetadata,
  ASSIST_MAX_TURNS,
} from "@/lib/feedback-assist-schema";

describe("assistFinalReportSchema", () => {
  it("defaults proactivePrompts to [] and imagePrompt to null", () => {
    const parsed = assistFinalReportSchema.safeParse({
      kind: "BUG",
      suggestedTitle: "T",
      suggestedDescription: "D",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.proactivePrompts).toEqual([]);
      expect(parsed.data.imagePrompt).toBeNull();
    }
  });

  it("accepts proactivePrompts and imagePrompt", () => {
    const parsed = assistFinalReportSchema.safeParse({
      kind: "FEATURE_REQUEST",
      suggestedTitle: "T",
      suggestedDescription: "D",
      proactivePrompts: ["Add who benefits"],
      imagePrompt: "Attach a screenshot of the error",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.proactivePrompts).toHaveLength(1);
      expect(parsed.data.imagePrompt).toBe("Attach a screenshot of the error");
    }
  });
});

describe("assistCalibrateRequestSchema", () => {
  const baseReport = {
    kind: "BUG" as const,
    suggestedTitle: "Title",
    suggestedDescription: "Description",
  };

  it("accepts a valid calibrate request", () => {
    const parsed = assistCalibrateRequestSchema.safeParse({
      sessionId: "sess-1",
      currentReport: baseReport,
      instruction: "Make it shorter",
      feedbackType: "BUG",
      pageUrl: "/en/projects",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty instruction", () => {
    const parsed = assistCalibrateRequestSchema.safeParse({
      sessionId: "sess-1",
      currentReport: baseReport,
      instruction: "",
      feedbackType: "BUG",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("assistCalibrateResponseSchema", () => {
  it("accepts final_report shape", () => {
    const parsed = assistCalibrateResponseSchema.safeParse({
      kind: "final_report",
      report: {
        kind: "BUG",
        suggestedTitle: "T",
        suggestedDescription: "D",
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("assistTurnRequestSchema", () => {
  it("accepts a minimal valid initial turn with empty transcript", () => {
    const parsed = assistTurnRequestSchema.safeParse({
      sessionId: "s1",
      initial: {
        feedbackType: "BUG",
        title: "",
        description: "Something broke when I clicked Save.",
        pageUrl: "/en/projects",
      },
      transcript: [],
      finalize: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts null pageUrl and coerces missing pageUrl to null", () => {
    const parsed = assistTurnRequestSchema.safeParse({
      sessionId: "s1",
      initial: {
        feedbackType: "FEATURE_REQUEST",
        description: "Would like bulk edit.",
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.initial.pageUrl).toBeNull();
      expect(parsed.data.transcript).toEqual([]);
      expect(parsed.data.finalize).toBe(false);
    }
  });

  it("accepts empty description (description is optional when starting AI Assist)", () => {
    const parsed = assistTurnRequestSchema.safeParse({
      sessionId: "s1",
      initial: { feedbackType: "BUG", description: "" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.initial.description).toBe("");
    }
  });

  it("accepts missing description and defaults to empty string", () => {
    const parsed = assistTurnRequestSchema.safeParse({
      sessionId: "s1",
      initial: { feedbackType: "BUG" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.initial.description).toBe("");
    }
  });

  it("rejects transcript entries that exceed maxSelectedOptionIds", () => {
    const tooManyOptions = Array.from({ length: 7 }, (_, i) => `opt-${i}`);
    const parsed = assistTurnRequestSchema.safeParse({
      sessionId: "s1",
      initial: { feedbackType: "BUG", description: "desc" },
      transcript: [
        {
          role: "user",
          questionId: "q1",
          selectedOptionIds: tooManyOptions,
          text: "",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("assistTurnResponseSchema", () => {
  it("accepts a question turn", () => {
    const res = assistTurnResponseSchema.safeParse({
      kind: "question",
      question: {
        id: "q1",
        text: "What happened?",
        options: [{ id: "a", label: "A" }],
        allowCustom: true,
      },
      turnNumber: 1,
      remainingTurns: 3,
    });
    expect(res.success).toBe(true);
  });

  it("accepts a final_report turn", () => {
    const res = assistTurnResponseSchema.safeParse({
      kind: "final_report",
      report: {
        kind: "BUG",
        suggestedTitle: "T",
        suggestedDescription: "D",
      },
      turnNumber: 4,
    });
    expect(res.success).toBe(true);
  });

  it("rejects a response missing discriminator", () => {
    const res = assistTurnResponseSchema.safeParse({ question: {} });
    expect(res.success).toBe(false);
  });
});

describe("feedbackAssistMetadataSchema + parseFeedbackAssistMetadata", () => {
  const VALID = {
    version: 1,
    aiModel: "gemini-2.5-flash",
    sessionId: "sess-1",
    transcript: [],
    finalReport: {
      kind: "BUG",
      suggestedTitle: "T",
      suggestedDescription: "D",
    },
    generatedAt: new Date().toISOString(),
  };

  it("accepts a valid metadata shape", () => {
    expect(feedbackAssistMetadataSchema.safeParse(VALID).success).toBe(true);
    expect(parseFeedbackAssistMetadata(VALID)).not.toBeNull();
  });

  it("returns null for malformed/legacy JSON instead of throwing", () => {
    expect(parseFeedbackAssistMetadata(null)).toBeNull();
    expect(parseFeedbackAssistMetadata({ version: 99 })).toBeNull();
    expect(parseFeedbackAssistMetadata("not an object")).toBeNull();
  });

  it("exposes a finite turn budget", () => {
    expect(ASSIST_MAX_TURNS).toBeGreaterThan(0);
    expect(ASSIST_MAX_TURNS).toBeLessThanOrEqual(10);
  });

  it("accepts optional videoRef + inputModes on persisted metadata", () => {
    const withVideo = {
      ...VALID,
      inputModes: ["text", "video"],
      videoRef: {
        fileUri: "files/abc123",
        mimeType: "video/webm",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        durationSec: 42,
      },
    };
    const parsed = feedbackAssistMetadataSchema.safeParse(withVideo);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.inputModes).toEqual(["text", "video"]);
      expect(parsed.data.videoRef?.fileUri).toBe("files/abc123");
    }
  });

  it("defaults inputModes to ['text'] and videoRef to null when absent", () => {
    const parsed = feedbackAssistMetadataSchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.inputModes).toEqual(["text"]);
      expect(parsed.data.videoRef).toBeNull();
    }
  });

  it("accepts calibrationRounds and defaults to 0", () => {
    const withRounds = { ...VALID, calibrationRounds: 2 };
    const parsed = feedbackAssistMetadataSchema.safeParse(withRounds);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.calibrationRounds).toBe(2);
    }
    const defaulted = feedbackAssistMetadataSchema.safeParse(VALID);
    expect(defaulted.success).toBe(true);
    if (defaulted.success) {
      expect(defaulted.data.calibrationRounds).toBe(0);
    }
  });
});

describe("assistVideoRefSchema", () => {
  it("accepts a well-formed reference", () => {
    const parsed = assistVideoRefSchema.safeParse({
      fileUri: "files/abc",
      mimeType: "video/webm",
      expiresAt: new Date().toISOString(),
      durationSec: 60,
    });
    expect(parsed.success).toBe(true);
  });

  it("allows durationSec to be omitted", () => {
    const parsed = assistVideoRefSchema.safeParse({
      fileUri: "files/abc",
      mimeType: "video/webm",
      expiresAt: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-datetime expiresAt", () => {
    const parsed = assistVideoRefSchema.safeParse({
      fileUri: "files/abc",
      mimeType: "video/webm",
      expiresAt: "not a date",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("assistVideoRequestMetadataSchema", () => {
  it("accepts minimal metadata", () => {
    const parsed = assistVideoRequestMetadataSchema.safeParse({
      sessionId: "sess-1",
      feedbackType: "BUG",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.initialTitle).toBe("");
      expect(parsed.data.initialUserText).toBe("");
      expect(parsed.data.pageUrl).toBeNull();
    }
  });

  it("rejects an overly long initialUserText", () => {
    const parsed = assistVideoRequestMetadataSchema.safeParse({
      sessionId: "sess-1",
      feedbackType: "BUG",
      initialUserText: "x".repeat(501),
    });
    expect(parsed.success).toBe(false);
  });
});
