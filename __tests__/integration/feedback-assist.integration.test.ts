import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

const mockIsAIEnabled = vi.fn();
const mockGenerateFeedbackAssistTurn = vi.fn();
vi.mock("@/lib/ai/gemini", () => ({
  isAIEnabled: () => mockIsAIEnabled(),
  generateFeedbackAssistTurn: (...args: unknown[]) =>
    mockGenerateFeedbackAssistTurn(...args),
}));

vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));

// Import after mocks — route reads from the mocked modules.
const { GET, POST } = await import("@/app/api/feedback/assist/route");
const { _resetFeedbackAssistRateLimit } = await import(
  "@/lib/feedback-assist-rate-limit"
);
const { getEffectiveSession } = await import("@/lib/masquerade");

// ── Helpers ───────────────────────────────────────────────────────────────────

type Session = Awaited<ReturnType<typeof getEffectiveSession>>;

function memberSession(id = "user-1"): Session {
  return { user: { id, role: "MEMBER" } } as unknown as Session;
}

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/feedback/assist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = {
  sessionId: "sess-1",
  initial: {
    feedbackType: "BUG" as const,
    title: "",
    description: "The projects page crashes when I click Filter.",
    pageUrl: "/en/projects",
  },
  transcript: [],
  finalize: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/feedback/assist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetFeedbackAssistRateLimit();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns enabled=true when AI key present", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(memberSession());
    mockIsAIEnabled.mockReturnValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean; maxTurns: number };
    expect(body.enabled).toBe(true);
    expect(body.maxTurns).toBeGreaterThan(0);
  });

  it("returns enabled=false when AI key absent", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(memberSession());
    mockIsAIEnabled.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enabled: boolean };
    expect(body.enabled).toBe(false);
  });
});

describe("POST /api/feedback/assist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetFeedbackAssistRateLimit();
    vi.mocked(getEffectiveSession).mockResolvedValue(memberSession());
    mockIsAIEnabled.mockReturnValue(true);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await POST(postReq(BASE_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 503 when AI is disabled", async () => {
    mockIsAIEnabled.mockReturnValue(false);
    const res = await POST(postReq(BASE_BODY));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI_DISABLED");
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/feedback/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts empty description — AI assist can start without pre-filled text", async () => {
    mockGenerateFeedbackAssistTurn.mockResolvedValue({
      kind: "question",
      question: {
        id: "q1",
        text: "What happened?",
        options: [],
        allowCustom: true,
      },
      turnNumber: 0,
      remainingTurns: 4,
    });
    const res = await POST(
      postReq({
        ...BASE_BODY,
        initial: { ...BASE_BODY.initial, description: "" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("returns a question turn when Gemini asks one", async () => {
    mockGenerateFeedbackAssistTurn.mockResolvedValue({
      kind: "question",
      question: {
        id: "when-did-this-happen",
        text: "When did this first start happening?",
        options: [
          { id: "today", label: "Today" },
          { id: "yesterday", label: "Yesterday" },
        ],
        allowCustom: true,
      },
      turnNumber: 1,
      remainingTurns: 4,
    });

    const res = await POST(postReq(BASE_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kind: string;
      question: { id: string; options: Array<{ id: string }> };
    };
    expect(body.kind).toBe("question");
    expect(body.question.id).toBe("when-did-this-happen");
    expect(body.question.options).toHaveLength(2);
    expect(mockGenerateFeedbackAssistTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        feedbackType: "BUG",
        initialDescription: BASE_BODY.initial.description,
        forceFinalize: false,
      })
    );
  });

  it("returns a final_report when Gemini finalizes", async () => {
    mockGenerateFeedbackAssistTurn.mockResolvedValue({
      kind: "final_report",
      report: {
        kind: "BUG",
        suggestedTitle: "Filter button crashes Projects page",
        suggestedDescription: "Steps: 1. Open Projects. 2. Click Filter.",
        summary: "Filter button crashes the page.",
        bugDetails: {
          stepsToReproduce: ["Open Projects", "Click Filter"],
          expectedBehavior: "Filter drawer opens",
          actualBehavior: "Page crashes",
        },
      },
      turnNumber: 3,
      remainingTurns: 2,
    });

    const res = await POST(postReq({ ...BASE_BODY, finalize: true }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; report: { kind: string } };
    expect(body.kind).toBe("final_report");
    expect(body.report.kind).toBe("BUG");
    expect(mockGenerateFeedbackAssistTurn).toHaveBeenCalledWith(
      expect.objectContaining({ forceFinalize: true })
    );
  });

  it("returns 429 when the same user calls twice in quick succession", async () => {
    mockGenerateFeedbackAssistTurn.mockResolvedValue({
      kind: "final_report",
      report: {
        kind: "BUG",
        suggestedTitle: "X",
        suggestedDescription: "Y",
        summary: "Z",
      },
    });

    const first = await POST(postReq(BASE_BODY));
    expect(first.status).toBe(200);

    const second = await POST(postReq(BASE_BODY));
    expect(second.status).toBe(429);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe("RATE_LIMITED");
  });

  it("returns 500 when Gemini throws", async () => {
    mockGenerateFeedbackAssistTurn.mockRejectedValue(new Error("upstream boom"));
    const res = await POST(postReq(BASE_BODY));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("AI_UPSTREAM_FAILED");
  });

  it("forwards videoRef to generateFeedbackAssistTurn when present", async () => {
    mockGenerateFeedbackAssistTurn.mockResolvedValue({
      kind: "question",
      question: {
        id: "q",
        text: "Any more detail?",
        options: [{ id: "n", label: "No" }],
        allowCustom: true,
      },
      turnNumber: 2,
      remainingTurns: 3,
    });

    const videoRef = {
      fileUri: "https://g/files/abc",
      mimeType: "video/webm",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    const res = await POST(postReq({ ...BASE_BODY, videoRef }));
    expect(res.status).toBe(200);
    expect(mockGenerateFeedbackAssistTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        videoRef: expect.objectContaining({ fileUri: videoRef.fileUri }),
      }),
    );
  });

  it("forwards videoRef as null when omitted", async () => {
    mockGenerateFeedbackAssistTurn.mockResolvedValue({
      kind: "final_report",
      report: {
        kind: "BUG",
        suggestedTitle: "T",
        suggestedDescription: "D",
        summary: "S",
      },
      turnNumber: 1,
      remainingTurns: 4,
    });
    await POST(postReq(BASE_BODY));
    expect(mockGenerateFeedbackAssistTurn).toHaveBeenCalledWith(
      expect.objectContaining({ videoRef: null }),
    );
  });
});
