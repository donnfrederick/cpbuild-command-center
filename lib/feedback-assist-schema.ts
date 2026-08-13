/**
 * Shared contract between the AI-assisted feedback API route
 * (`/api/feedback/assist`), the `FeedbackAssistChat` client component,
 * and the persisted `aiAssistMetadata` JSON column on `FeedbackReport`.
 *
 * Shapes are defined in one place so server validation, client rendering,
 * and database introspection cannot drift apart.
 */

import { z } from "zod";

// ── Conversation transcript ───────────────────────────────────────────────────

/** A single predefined answer option that the AI offers the user. */
export const assistOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
});
export type AssistOption = z.infer<typeof assistOptionSchema>;

/** A question posed by the AI assistant on one turn. */
export const assistQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(400),
  helpText: z.string().max(300).optional(),
  options: z.array(assistOptionSchema).max(6),
  allowCustom: z.boolean(),
});
export type AssistQuestion = z.infer<typeof assistQuestionSchema>;

/** A single message in the conversation history sent back to the server. */
export const assistTranscriptEntrySchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("assistant"),
    question: assistQuestionSchema,
  }),
  z.object({
    role: z.literal("user"),
    questionId: z.string().min(1).max(64),
    selectedOptionIds: z.array(z.string().min(1).max(64)).max(6).default([]),
    text: z.string().max(2000).default(""),
  }),
]);
export type AssistTranscriptEntry = z.infer<typeof assistTranscriptEntrySchema>;

// ── Final structured report produced by the AI ────────────────────────────────

export const bugDetailsSchema = z.object({
  stepsToReproduce: z.array(z.string().max(400)).max(10).default([]),
  expectedBehavior: z.string().max(600).default(""),
  actualBehavior: z.string().max(600).default(""),
});
export type BugDetails = z.infer<typeof bugDetailsSchema>;

export const featureDetailsSchema = z.object({
  problemSolved: z.string().max(600).default(""),
  suggestedAcceptance: z.array(z.string().max(400)).max(10).default([]),
});
export type FeatureDetails = z.infer<typeof featureDetailsSchema>;

export const assistFinalReportSchema = z.object({
  kind: z.enum(["BUG", "FEATURE_REQUEST"]),
  suggestedTitle: z.string().min(1).max(120),
  suggestedDescription: z.string().min(1).max(4000),
  summary: z.string().max(400).default(""),
  bugDetails: bugDetailsSchema.optional(),
  featureDetails: featureDetailsSchema.optional(),
  /**
   * Short suggestions for details the user could still add before submitting.
   * Shown as chips in the draft preview — not auto-merged into the description.
   */
  proactivePrompts: z.array(z.string().max(120)).max(5).default([]),
  /**
   * When set, the draft preview prompts the user to attach a screenshot with
   * this contextual message from the AI.
   */
  imagePrompt: z
    .string()
    .max(300)
    .nullish()
    .transform((v) => v ?? null),
});
export type AssistFinalReport = z.infer<typeof assistFinalReportSchema>;

// ── Video reference (Gemini Files API) ────────────────────────────────────────

/**
 * Reference to a video uploaded to the Gemini Files API. Present only when
 * the user invoked the screen-recording analysis path. Kept in the metadata
 * so triage can see that the AI grounded on a recording, and re-used across
 * subsequent text turns in the same session so Gemini stays grounded.
 *
 * Files API URIs expire ~48h after upload. Consumers must tolerate a 404
 * when replaying a stale `fileUri` (handled in the gemini client with a
 * try/catch fallback to text-only).
 */
export const assistVideoRefSchema = z.object({
  fileUri: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(64),
  expiresAt: z.string().datetime(),
  /** Optional duration hint for triage display — Gemini does not require it. */
  durationSec: z.number().int().positive().max(3_600).optional(),
});
export type AssistVideoRef = z.infer<typeof assistVideoRefSchema>;

/**
 * Reference to an image uploaded to the Gemini Files API (screenshot for
 * vision grounding). Same TTL semantics as `assistVideoRefSchema`.
 */
export const assistImageRefSchema = z.object({
  fileUri: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(64),
  expiresAt: z.string().datetime(),
});
export type AssistImageRef = z.infer<typeof assistImageRefSchema>;

/** Which input modes the user exercised during the session. */
export const assistInputModeSchema = z.enum(["text", "video", "image"]);
export type AssistInputMode = z.infer<typeof assistInputModeSchema>;

// ── Request body (client → /api/feedback/assist) ──────────────────────────────

/** Max turns (assistant questions) before we force the AI to finalize. */
export const ASSIST_MAX_TURNS = 5;

export const assistTurnRequestSchema = z.object({
  /** Stable conversation identifier generated on the client. */
  sessionId: z.string().min(1).max(64),
  /** User's initial inputs before the conversation started. */
  initial: z.object({
    feedbackType: z.enum(["BUG", "FEATURE_REQUEST"]),
    title: z.string().max(120).default(""),
    description: z.string().max(4000).default(""),
    pageUrl: z.string().max(500).nullish().transform((v) => v ?? null),
  }),
  /** All prior assistant questions + user answers in chronological order. */
  transcript: z.array(assistTranscriptEntrySchema).max(ASSIST_MAX_TURNS * 2).default([]),
  /**
   * When true, the client is asking the AI to finalize now regardless of
   * remaining turns (e.g. user clicked "Draft my report").
   */
  finalize: z.boolean().default(false),
  /**
   * Optional reference to a recording previously uploaded via
   * `/api/feedback/assist/video`. When present, the server re-attaches the
   * video to this turn so Gemini stays grounded in what it saw.
   */
  videoRef: assistVideoRefSchema.nullish().transform((v) => v ?? null),
});
export type AssistTurnRequest = z.infer<typeof assistTurnRequestSchema>;

// ── Request body (client → /api/feedback/assist/video) ───────────────────────
// The actual recording blob travels as multipart/form-data; this schema
// validates the JSON side-channel fields that accompany it.

export const assistVideoRequestMetadataSchema = z.object({
  sessionId: z.string().min(1).max(64),
  feedbackType: z.enum(["BUG", "FEATURE_REQUEST"]),
  /** Initial title the user typed before clicking Analyze (optional). */
  initialTitle: z.string().max(120).default(""),
  /** Any free-text notes the user added alongside the recording (optional). */
  initialUserText: z.string().max(500).default(""),
  /** Page URL captured by the modal (for grounding). */
  pageUrl: z.string().max(500).nullish().transform((v) => v ?? null),
  /** Optional duration hint in seconds, derived from MediaRecorder timing. */
  durationSec: z.number().int().positive().max(3_600).optional(),
});
export type AssistVideoRequestMetadata = z.infer<typeof assistVideoRequestMetadataSchema>;

// ── Request metadata (client → /api/feedback/assist/image) ────────────────────

export const assistImageRequestMetadataSchema = z.object({
  sessionId: z.string().min(1).max(64),
  feedbackType: z.enum(["BUG", "FEATURE_REQUEST"]),
  initialTitle: z.string().max(120).default(""),
  initialUserText: z.string().max(500).default(""),
  pageUrl: z.string().max(500).nullish().transform((v) => v ?? null),
});
export type AssistImageRequestMetadata = z.infer<typeof assistImageRequestMetadataSchema>;

// ── Request body (client → /api/feedback/assist/calibrate) ────────────────────
// `instruction` is what FeedbackModal sends; `calibrationInstructions` is an alternate key.
// Optional `initial` + `transcript` + media refs support richer multimodal calibration.

export const assistCalibrateRequestSchema = z
  .object({
    sessionId: z.string().min(1).max(64),
    currentReport: assistFinalReportSchema,
    feedbackType: z.enum(["BUG", "FEATURE_REQUEST"]),
    pageUrl: z.string().max(500).nullish().transform((v) => v ?? null),
    instruction: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .optional(),
    calibrationInstructions: z
      .string()
      .trim()
      .min(1, "calibration instructions are required")
      .max(4000)
      .optional(),
    initial: z
      .object({
        feedbackType: z.enum(["BUG", "FEATURE_REQUEST"]),
        title: z.string().max(120).default(""),
        description: z.string().max(4000).default(""),
        pageUrl: z.string().max(500).nullish().transform((v) => v ?? null),
      })
      .optional(),
    transcript: z.array(assistTranscriptEntrySchema).max(ASSIST_MAX_TURNS * 2).default([]),
    videoRef: assistVideoRefSchema.nullish().transform((v) => v ?? null),
    imageRef: assistImageRefSchema.nullish().transform((v) => v ?? null),
  })
  .superRefine((data, ctx) => {
    const cal =
      data.instruction?.trim() ||
      data.calibrationInstructions?.trim() ||
      "";
    if (!cal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide instruction or calibrationInstructions",
        path: ["instruction"],
      });
    }
  });
export type AssistCalibrateRequest = z.infer<typeof assistCalibrateRequestSchema>;

// ── Response body ─────────────────────────────────────────────────────────────

/** The AI either asks another question or returns a final structured report. */
export const assistTurnResponseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    question: assistQuestionSchema,
    turnNumber: z.number().int().nonnegative(),
    remainingTurns: z.number().int().nonnegative(),
    /**
     * Present only on the first turn of a video-seeded session so the client
     * can forward it back on subsequent text turns. Never set for plain text
     * sessions.
     */
    videoRef: assistVideoRefSchema.nullish().transform((v) => v ?? null),
  }),
  z.object({
    kind: z.literal("final_report"),
    report: assistFinalReportSchema,
    turnNumber: z.number().int().nonnegative(),
    videoRef: assistVideoRefSchema.nullish().transform((v) => v ?? null),
  }),
]);
export type AssistTurnResponse = z.infer<typeof assistTurnResponseSchema>;

/** Calibrate always returns an updated final report (client expects this shape). */
export const assistCalibrateResponseSchema = z.object({
  kind: z.literal("final_report"),
  report: assistFinalReportSchema,
});
export type AssistCalibrateResponse = z.infer<typeof assistCalibrateResponseSchema>;

// ── Persisted metadata on FeedbackReport.aiAssistMetadata ─────────────────────

/**
 * Shape stored verbatim in the `aiAssistMetadata` JSON column for every
 * AI-assisted submission. Persisted for auditability so reviewers can see
 * exactly what the assistant produced and what the user supplied.
 */
export const feedbackAssistMetadataSchema = z.object({
  /** Metadata shape version — bump when making breaking changes. */
  version: z.literal(1),
  aiModel: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(64),
  transcript: z.array(assistTranscriptEntrySchema).max(ASSIST_MAX_TURNS * 2),
  finalReport: assistFinalReportSchema,
  generatedAt: z.string().datetime(),
  /**
   * Which input modalities the user exercised. Always includes at least
   * one entry. Older rows (pre-video) have this defaulted to `["text"]`.
   */
  inputModes: z.array(assistInputModeSchema).min(1).max(3).default(["text"]),
  /**
   * Video reference if a recording seeded the session. Null/absent for
   * pure-text sessions. We persist the metadata (not the bytes) so triage
   * can see that the AI grounded on video.
   */
  videoRef: assistVideoRefSchema.nullish().transform((v) => v ?? null),
  /**
   * How many times the user revised the draft via natural-language calibration
   * after the initial AI final report.
   */
  calibrationRounds: z.number().int().nonnegative().max(20).default(0),
});
export type FeedbackAssistMetadata = z.infer<typeof feedbackAssistMetadataSchema>;

/**
 * Safe runtime parser for metadata loaded out of the Prisma JSON column.
 * Returns `null` when the blob does not match the expected shape — we never
 * want a triage viewer to crash because an older/malformed metadata row is
 * still in the database.
 */
export function parseFeedbackAssistMetadata(
  value: unknown
): FeedbackAssistMetadata | null {
  const parsed = feedbackAssistMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
