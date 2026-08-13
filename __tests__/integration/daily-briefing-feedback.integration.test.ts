import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks must be defined before imports ──────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockGetSession() }));

const mockCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    briefingFeedback: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

const mockJustify = vi.fn();
const mockRevise = vi.fn();
const mockIsAIEnabled = vi.fn().mockReturnValue(true);
vi.mock("@/lib/ai/gemini", () => ({
  justifyBriefingCard: (...args: unknown[]) => mockJustify(...args),
  reviseBriefingCard: (...args: unknown[]) => mockRevise(...args),
  isAIEnabled: () => mockIsAIEnabled(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { POST as feedbackPOST } from "@/app/api/daily-briefing/feedback/route";
import { POST as justifyPOST } from "@/app/api/daily-briefing/feedback/justify/route";
import { POST as revisePOST } from "@/app/api/daily-briefing/feedback/revise/route";

// ── Auth fixtures ─────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { id: "u1", role: "ADMIN", email: "phil@cpbuild.com", name: "Phil" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/daily-briefing/feedback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await feedbackPOST(jsonRequest("http://localhost/api/daily-briefing/feedback", {}));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const res = await feedbackPOST(jsonRequest("http://localhost/api/daily-briefing/feedback", {
      briefingId: "b1",
      section: "INVALID_SECTION",
      itemKey: "roi-0",
      feedbackType: "CHALLENGE",
    }));
    expect(res.status).toBe(400);
  });

  it("saves APPROVE feedback and returns 201", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockCreate.mockResolvedValue({ id: "fb1" });

    const res = await feedbackPOST(jsonRequest("http://localhost/api/daily-briefing/feedback", {
      briefingId: "b1",
      section: "ROI_ITEM",
      itemKey: "roi-0",
      feedbackType: "APPROVE",
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("fb1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ feedbackType: "APPROVE" }) })
    );
  });

  it("saves CHALLENGE feedback with reason and note", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockCreate.mockResolvedValue({ id: "fb2" });

    const res = await feedbackPOST(jsonRequest("http://localhost/api/daily-briefing/feedback", {
      briefingId: "b1",
      section: "OPTIMIZATION",
      itemKey: "opt-0",
      feedbackType: "CHALLENGE",
      challengeReason: "INFLATED_NUMBER",
      userNote: "This is not $5000, it's an internal tool",
    }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          challengeReason: "INFLATED_NUMBER",
          userNote: "This is not $5000, it's an internal tool",
        }),
      })
    );
  });
});

describe("POST /api/daily-briefing/feedback/justify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await justifyPOST(jsonRequest("http://localhost/api/daily-briefing/feedback/justify", {}));
    expect(res.status).toBe(401);
  });

  it("returns 503 when AI is not enabled", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockIsAIEnabled.mockReturnValueOnce(false);
    const res = await justifyPOST(jsonRequest("http://localhost/api/daily-briefing/feedback/justify", {
      briefingId: "b1",
      section: "ROI_ITEM",
      itemKey: "roi-0",
      itemData: { area: "Dev", value: "$500" },
      briefingContext: { dateFor: "2026-03-10" },
    }));
    expect(res.status).toBe(503);
  });

  it("calls justifyBriefingCard and returns justification text", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockIsAIEnabled.mockReturnValue(true);
    mockJustify.mockResolvedValue("I derived this from the 2h/week saving figure.");
    mockCreate.mockResolvedValue({ id: "fb3" });

    const res = await justifyPOST(jsonRequest("http://localhost/api/daily-briefing/feedback/justify", {
      briefingId: "b1",
      section: "ROI_ITEM",
      itemKey: "roi-0",
      itemData: { area: "Dev", value: "$500", reasoning: "Saves 2h" },
      briefingContext: { dateFor: "2026-03-10" },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.justification).toBe("I derived this from the 2h/week saving figure.");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          feedbackType: "JUSTIFY",
          aiJustification: "I derived this from the 2h/week saving figure.",
        }),
      })
    );
  });
});

describe("POST /api/daily-briefing/feedback/revise", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await revisePOST(jsonRequest("http://localhost/api/daily-briefing/feedback/revise", {}));
    expect(res.status).toBe(401);
  });

  it("calls reviseBriefingCard and returns revised item", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockIsAIEnabled.mockReturnValue(true);
    const revisedItem = { area: "Dev", value: "N/A — infrastructure fix", reasoning: "No consumer impact" };
    mockRevise.mockResolvedValue(revisedItem);
    mockCreate.mockResolvedValue({ id: "fb4" });

    const res = await revisePOST(jsonRequest("http://localhost/api/daily-briefing/feedback/revise", {
      briefingId: "b1",
      section: "ROI_ITEM",
      itemKey: "roi-0",
      itemData: { area: "Dev", value: "$5000", reasoning: "User acquisition" },
      challengeReason: "WRONG_CONTEXT",
      userNote: "This is an internal tool",
      briefingContext: { dateFor: "2026-03-10" },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revisedItem).toEqual(revisedItem);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          feedbackType: "CHALLENGE",
          challengeReason: "WRONG_CONTEXT",
          userNote: "This is an internal tool",
        }),
      })
    );
  });
});
