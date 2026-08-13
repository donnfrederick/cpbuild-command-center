import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// requireDevToolsAdmin returns null when authorized, or a NextResponse when not
const mockRequireDevToolsAdmin = vi.fn();
vi.mock("@/lib/devtools-auth", () => ({
  requireDevToolsAdmin: () => mockRequireDevToolsAdmin(),
}));

const mockIsAIEnabled = vi.fn();
const mockGenerateTourFromDescription = vi.fn();
vi.mock("@/lib/ai/gemini", () => ({
  isAIEnabled: () => mockIsAIEnabled(),
  generateTourFromDescription: (...args: unknown[]) => mockGenerateTourFromDescription(...args),
}));

// ── Import handler after mocks ─────────────────────────────────────────────────

import { NextRequest } from "next/server";
const { POST } = await import("@/app/api/tour/generate/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/tour/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  tourName: "Intro Tour",
  tourGoal: "Show new users how to create a project",
  targetRole: "MEMBER",
  targetSection: "Projects",
};

const MOCK_STEPS = [
  { id: "step-1", title: "Welcome", body: "Let us begin", action: { type: "click", selector: "#cta" } },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/tour/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAIEnabled.mockReturnValue(true);
    mockRequireDevToolsAdmin.mockResolvedValue(null); // authorized
  });

  it("returns 401/403 when DevTools admin check fails", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireDevToolsAdmin.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 503 when AI is disabled", async () => {
    mockIsAIEnabled.mockReturnValue(false);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("AI not configured");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/tour/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({ tourName: "Intro" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with steps on successful generation", async () => {
    mockGenerateTourFromDescription.mockResolvedValue(MOCK_STEPS);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json() as { steps: unknown[] };
    expect(body.steps).toEqual(MOCK_STEPS);
    expect(mockGenerateTourFromDescription).toHaveBeenCalledWith(VALID_BODY);
  });

  it("returns 500 when Gemini throws an error", async () => {
    mockGenerateTourFromDescription.mockRejectedValue(new Error("Gemini unavailable"));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Tour generation failed");
  });
});
