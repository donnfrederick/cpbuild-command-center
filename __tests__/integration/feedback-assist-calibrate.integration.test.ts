import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

const mockIsAIEnabled = vi.fn();
const mockGenerateFeedbackAssistCalibrate = vi.fn();
vi.mock("@/lib/ai/gemini", () => ({
  isAIEnabled: () => mockIsAIEnabled(),
  generateFeedbackAssistCalibrate: (...args: unknown[]) =>
    mockGenerateFeedbackAssistCalibrate(...args),
}));

vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));

const { POST } = await import("@/app/api/feedback/assist/calibrate/route");
const { _resetFeedbackAssistRateLimit } = await import(
  "@/lib/feedback-assist-rate-limit"
);
const { getEffectiveSession } = await import("@/lib/masquerade");

type Session = Awaited<ReturnType<typeof getEffectiveSession>>;

function memberSession(id = "user-1"): Session {
  return { user: { id, role: "MEMBER" } } as unknown as Session;
}

const BASE_REPORT = {
  kind: "BUG" as const,
  suggestedTitle: "Save crashes",
  suggestedDescription: "It breaks",
  summary: "Crash",
  proactivePrompts: [] as string[],
  imagePrompt: null as string | null,
};

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/feedback/assist/calibrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/feedback/assist/calibrate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetFeedbackAssistRateLimit();
    vi.mocked(getEffectiveSession).mockResolvedValue(memberSession());
    mockIsAIEnabled.mockReturnValue(true);
    mockGenerateFeedbackAssistCalibrate.mockResolvedValue({
      ...BASE_REPORT,
      suggestedDescription: "Safari only — it breaks",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await POST(postReq({}));
    expect(res.status).toBe(401);
  });

  it("returns 503 when AI is disabled", async () => {
    mockIsAIEnabled.mockReturnValue(false);
    const res = await POST(
      postReq({
        sessionId: "sess-1",
        currentReport: BASE_REPORT,
        instruction: "Shorten",
        feedbackType: "BUG",
      }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI_DISABLED");
  });

  it("returns revised report when Gemini succeeds", async () => {
    const res = await POST(
      postReq({
        sessionId: "sess-1",
        currentReport: BASE_REPORT,
        instruction: "Mention Safari only.",
        feedbackType: "BUG",
        pageUrl: "/en/projects",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; report: { suggestedDescription: string } };
    expect(body.kind).toBe("final_report");
    expect(body.report.suggestedDescription).toContain("Safari");
    expect(mockGenerateFeedbackAssistCalibrate).toHaveBeenCalledWith(
      expect.objectContaining({
        calibrationInstructions: "Mention Safari only.",
      }),
    );
  });

  it("accepts calibrationInstructions as an alternate to instruction", async () => {
    const res = await POST(
      postReq({
        sessionId: "sess-1",
        currentReport: BASE_REPORT,
        calibrationInstructions: "Mention Safari only.",
        feedbackType: "BUG",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockGenerateFeedbackAssistCalibrate).toHaveBeenCalledWith(
      expect.objectContaining({
        calibrationInstructions: "Mention Safari only.",
      }),
    );
  });

  it("returns 400 when instruction and calibrationInstructions are both missing", async () => {
    const res = await POST(
      postReq({
        sessionId: "sess-1",
        currentReport: BASE_REPORT,
        feedbackType: "BUG",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when instruction is empty", async () => {
    const res = await POST(
      postReq({
        sessionId: "sess-1",
        currentReport: BASE_REPORT,
        instruction: "",
        feedbackType: "BUG",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when feedbackType does not match the current report kind", async () => {
    const res = await POST(
      postReq({
        sessionId: "sess-1",
        currentReport: BASE_REPORT,
        instruction: "Make it clearer",
        feedbackType: "FEATURE_REQUEST",
      }),
    );

    expect(res.status).toBe(400);
    expect(mockGenerateFeedbackAssistCalibrate).not.toHaveBeenCalled();
  });

  it("returns 429 on back-to-back requests", async () => {
    await POST(
      postReq({
        sessionId: "sess-1",
        currentReport: BASE_REPORT,
        instruction: "First",
        feedbackType: "BUG",
      }),
    );
    const second = await POST(
      postReq({
        sessionId: "sess-2",
        currentReport: BASE_REPORT,
        instruction: "Second",
        feedbackType: "BUG",
      }),
    );
    expect(second.status).toBe(429);
  });
});
