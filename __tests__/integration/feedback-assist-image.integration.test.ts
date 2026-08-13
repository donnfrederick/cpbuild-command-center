import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/ai/gemini-files", () => ({
  uploadImageForFeedback: vi.fn(),
}));

const mockUploadImageForFeedback = vi.mocked(
  (await import("@/lib/ai/gemini-files")).uploadImageForFeedback,
);

const mockIsAIEnabled = vi.fn();
vi.mock("@/lib/ai/gemini", () => ({
  isAIEnabled: () => mockIsAIEnabled(),
}));

vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));

const { POST } = await import("@/app/api/feedback/assist/image/route");
const { _resetFeedbackAssistRateLimit } = await import(
  "@/lib/feedback-assist-rate-limit"
);
const { getEffectiveSession } = await import("@/lib/masquerade");

function memberSession(id = "user-1") {
  return { user: { id, role: "MEMBER" } } as Awaited<
    ReturnType<typeof getEffectiveSession>
  >;
}

function multipartImageRequest(sessionId = "sess-1"): Request {
  const form = new FormData();
  const blob = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], {
    type: "image/png",
  });
  form.append("image", blob, "t.png");
  form.append(
    "metadata",
    JSON.stringify({
      sessionId,
      feedbackType: "BUG",
      pageUrl: "/en",
    }),
  );
  return new Request("http://localhost/api/feedback/assist/image", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/feedback/assist/image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetFeedbackAssistRateLimit();
    vi.mocked(getEffectiveSession).mockResolvedValue(memberSession());
    mockIsAIEnabled.mockReturnValue(true);
    mockUploadImageForFeedback.mockResolvedValue({
      fileUri: "files/abc123",
      name: "files/abc123",
      mimeType: "image/png",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
  });

  it("returns imageRef JSON when authenticated and upload succeeds", async () => {
    const res = await POST(multipartImageRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { imageRef?: { fileUri: string } };
    expect(body.imageRef?.fileUri).toBe("files/abc123");
    expect(mockUploadImageForFeedback).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when spamming within the 5s cooldown window", async () => {
    const first = await POST(multipartImageRequest("sess-a"));
    expect(first.status).toBe(200);

    const second = await POST(multipartImageRequest("sess-b"));
    expect(second.status).toBe(429);

    expect(mockUploadImageForFeedback).toHaveBeenCalledTimes(1);
  });
});
