import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

const mockIsAIEnabled = vi.fn();
const mockGenerateFeedbackAssistVideoTurn = vi.fn();
vi.mock("@/lib/ai/gemini", () => ({
  isAIEnabled: () => mockIsAIEnabled(),
  generateFeedbackAssistVideoTurn: (...args: unknown[]) =>
    mockGenerateFeedbackAssistVideoTurn(...args),
}));

const mockUploadVideoForFeedback = vi.fn();
vi.mock("@/lib/ai/gemini-files", () => ({
  uploadVideoForFeedback: (...args: unknown[]) =>
    mockUploadVideoForFeedback(...args),
}));

vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));

const { POST } = await import("@/app/api/feedback/assist/video/route");
const { _resetFeedbackAssistVideoRateLimit } = await import(
  "@/lib/feedback-assist-rate-limit"
);
const { getEffectiveSession } = await import("@/lib/masquerade");
const { FEEDBACK_ASSIST_VIDEO_MAX_BYTES } = await import("@/lib/ai/types");

// ── Helpers ───────────────────────────────────────────────────────────────────

type Session = Awaited<ReturnType<typeof getEffectiveSession>>;

function memberSession(id = "user-1"): Session {
  return { user: { id, role: "MEMBER" } } as unknown as Session;
}

function makeForm({
  recording,
  metadata,
  omitRecording = false,
  omitMetadata = false,
}: {
  recording?: Blob;
  metadata?: unknown;
  omitRecording?: boolean;
  omitMetadata?: boolean;
}): FormData {
  const form = new FormData();
  if (!omitRecording) {
    form.append(
      "recording",
      recording ?? new Blob([new Uint8Array(1024)], { type: "video/webm" }),
    );
  }
  if (!omitMetadata) {
    form.append(
      "metadata",
      typeof metadata === "string"
        ? metadata
        : JSON.stringify(
            metadata ?? {
              sessionId: "sess-1",
              feedbackType: "BUG",
              pageUrl: "/en/projects",
            },
          ),
    );
  }
  return form;
}

function postReq(form: FormData): Request {
  return new Request("http://localhost/api/feedback/assist/video", {
    method: "POST",
    body: form,
  });
}

const DEFAULT_FILE_REF = {
  fileUri: "https://g/files/abc",
  name: "files/abc",
  mimeType: "video/webm",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/feedback/assist/video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetFeedbackAssistVideoRateLimit();
    vi.mocked(getEffectiveSession).mockResolvedValue(memberSession());
    mockIsAIEnabled.mockReturnValue(true);
    mockUploadVideoForFeedback.mockResolvedValue(DEFAULT_FILE_REF);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await POST(postReq(makeForm({})));
    expect(res.status).toBe(401);
    expect(mockUploadVideoForFeedback).not.toHaveBeenCalled();
  });

  it("returns 503 when AI is disabled", async () => {
    mockIsAIEnabled.mockReturnValue(false);
    const res = await POST(postReq(makeForm({})));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI_DISABLED");
    expect(mockUploadVideoForFeedback).not.toHaveBeenCalled();
  });

  it("returns 400 when the recording field is missing", async () => {
    const res = await POST(postReq(makeForm({ omitRecording: true })));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_FORM");
  });

  it("returns 400 when the recording blob is empty", async () => {
    const res = await POST(
      postReq(
        makeForm({
          recording: new Blob([], { type: "video/webm" }),
        }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the recording exceeds the size cap", async () => {
    // Must allocate a real oversize blob: Request.formData() re-parses the
    // body bytes on the server, so a Blob whose `size` is overridden on the
    // client side would be re-read as its actual byte length. 50 MB + 1 byte
    // is acceptable for a single test run.
    const bigArray = new Uint8Array(FEEDBACK_ASSIST_VIDEO_MAX_BYTES + 1);
    const bigBlob = new Blob([bigArray], { type: "video/webm" });
    const res = await POST(postReq(makeForm({ recording: bigBlob })));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("VIDEO_TOO_LARGE");
  });

  it("returns 400 when the recording MIME type is not in the allowlist", async () => {
    const res = await POST(
      postReq(
        makeForm({
          recording: new Blob([new Uint8Array(1024)], { type: "video/quicktime" }),
        }),
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("UNSUPPORTED_VIDEO_TYPE");
  });

  // Regression: Chrome/Firefox MediaRecorder emit MIME types with codec
  // parameters (e.g. `video/webm;codecs=vp9,opus`). The route must strip
  // codec params before matching the allowlist or we 400 every real browser
  // recording.
  it("accepts recordings with codec-suffixed MIME types (video/webm;codecs=vp9)", async () => {
    mockGenerateFeedbackAssistVideoTurn.mockResolvedValue({
      kind: "question",
      question: {
        id: "q1",
        text: "What did you expect?",
        options: [],
        allowCustom: true,
      },
      turnNumber: 1,
      remainingTurns: 4,
      videoRef: DEFAULT_FILE_REF,
    });

    const res = await POST(
      postReq(
        makeForm({
          recording: new Blob([new Uint8Array(1024)], {
            type: "video/webm;codecs=vp9,opus",
          }),
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(mockUploadVideoForFeedback).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when the metadata field is not valid JSON", async () => {
    const res = await POST(postReq(makeForm({ metadata: "not json" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the metadata fails schema validation", async () => {
    const res = await POST(
      postReq(
        makeForm({ metadata: { feedbackType: "BUG" } /* sessionId missing */ }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns the first-turn question when Gemini asks one", async () => {
    mockGenerateFeedbackAssistVideoTurn.mockResolvedValue({
      kind: "question",
      question: {
        id: "what-did-you-expect",
        text: "What did you expect to happen instead?",
        options: [
          { id: "success", label: "A success message" },
          { id: "redirect", label: "Redirect to dashboard" },
        ],
        allowCustom: true,
      },
      turnNumber: 1,
      remainingTurns: 4,
      videoRef: {
        fileUri: DEFAULT_FILE_REF.fileUri,
        mimeType: DEFAULT_FILE_REF.mimeType,
        expiresAt: DEFAULT_FILE_REF.expiresAt,
      },
    });

    const res = await POST(postReq(makeForm({})));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kind: string;
      question: { id: string };
      videoRef: { fileUri: string };
    };
    expect(body.kind).toBe("question");
    expect(body.question.id).toBe("what-did-you-expect");
    expect(body.videoRef.fileUri).toBe(DEFAULT_FILE_REF.fileUri);
    expect(mockUploadVideoForFeedback).toHaveBeenCalledTimes(1);
    expect(mockGenerateFeedbackAssistVideoTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        feedbackType: "BUG",
        videoRef: expect.objectContaining({
          fileUri: DEFAULT_FILE_REF.fileUri,
        }),
      }),
    );
  });

  it("returns the final report when Gemini finalizes from the video alone", async () => {
    mockGenerateFeedbackAssistVideoTurn.mockResolvedValue({
      kind: "final_report",
      report: {
        kind: "BUG",
        suggestedTitle: "Save button is unresponsive on Projects page",
        suggestedDescription:
          "Steps: 1. Open Projects. 2. Click Save. Nothing happens.",
        summary: "Save button does nothing on Projects.",
        bugDetails: {
          stepsToReproduce: ["Open Projects", "Click Save"],
          expectedBehavior: "Record is saved",
          actualBehavior: "Nothing happens",
        },
      },
      turnNumber: 1,
      remainingTurns: 4,
      videoRef: {
        fileUri: DEFAULT_FILE_REF.fileUri,
        mimeType: DEFAULT_FILE_REF.mimeType,
        expiresAt: DEFAULT_FILE_REF.expiresAt,
      },
    });

    const res = await POST(postReq(makeForm({})));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; report: { kind: string } };
    expect(body.kind).toBe("final_report");
    expect(body.report.kind).toBe("BUG");
  });

  it("returns 429 after the hourly cap is exhausted", async () => {
    mockGenerateFeedbackAssistVideoTurn.mockResolvedValue({
      kind: "final_report",
      report: {
        kind: "BUG",
        suggestedTitle: "T",
        suggestedDescription: "D",
        summary: "S",
      },
      turnNumber: 1,
      remainingTurns: 4,
      videoRef: {
        fileUri: DEFAULT_FILE_REF.fileUri,
        mimeType: DEFAULT_FILE_REF.mimeType,
        expiresAt: DEFAULT_FILE_REF.expiresAt,
      },
    });

    for (let i = 0; i < 5; i++) {
      const res = await POST(postReq(makeForm({})));
      expect(res.status).toBe(200);
    }
    const blocked = await POST(postReq(makeForm({})));
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("RATE_LIMITED");
  });

  it("returns 500 when the Files API upload throws", async () => {
    mockUploadVideoForFeedback.mockRejectedValue(new Error("Files API boom"));
    const res = await POST(postReq(makeForm({})));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI_UPSTREAM_FAILED");
    expect(mockGenerateFeedbackAssistVideoTurn).not.toHaveBeenCalled();
  });

  it("returns 500 when Gemini throws after upload succeeds", async () => {
    mockGenerateFeedbackAssistVideoTurn.mockRejectedValue(
      new Error("Gemini unavailable"),
    );
    const res = await POST(postReq(makeForm({})));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI_UPSTREAM_FAILED");
  });
});
