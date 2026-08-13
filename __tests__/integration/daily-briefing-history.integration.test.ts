import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks must be defined before imports ──────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockGetSession() }));

const mockFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    dailyBriefing: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: vi.fn(),
    },
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { GET as historyGET } from "@/app/api/daily-briefing/history/route";
import { GET as briefingGET } from "@/app/api/daily-briefing/route";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

// ── Auth fixtures ─────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { id: "u1", role: "ADMIN", email: "phil@cpbuild.com", name: "Phil" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(url = "http://localhost/api/daily-briefing/history") {
  return new Request(url);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/daily-briefing/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await historyGET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks VIEW_MORNING_BRIEFING permission", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u2", role: "MEMBER", email: "member@cpbuild.com", name: "Member" },
    });
    const res = await historyGET();
    expect(res.status).toBe(403);
  });

  it("returns empty items array when no briefings exist", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([]);

    const res = await historyGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });

  it("returns summarized history items with extracted fields", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockFindMany.mockResolvedValue([
      {
        id: "b1",
        dateFor: new Date("2026-03-10T00:00:00Z"),
        generatedAt: new Date("2026-03-11T08:00:00Z"),
        report: {
          roiAnalysis: {
            summary: "Good ROI day",
            items: [{ area: "Dev", value: "2h saved", reasoning: "Faster deploys" }],
            totalEstimatedValue: "~2h saved",
          },
          optimizationsRecognized: [{ title: "A" }, { title: "B" }],
          issuesAndChallenges: [{ description: "Flaky test" }],
          yesterdaysWork: { shipped: [{ title: "PR 1" }, { title: "PR 2" }, { title: "PR 3" }] },
        },
      },
    ]);

    const res = await historyGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(item.id).toBe("b1");
    expect(item.dateFor).toBe("2026-03-10");
    expect(item.totalEstimatedValue).toBe("~2h saved");
    expect(item.optimizationCount).toBe(2);
    expect(item.issueCount).toBe(1);
    expect(item.shippedCount).toBe(3);
  });
});

describe("GET /api/daily-briefing?date=", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for malformed date param", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const req = new Request("http://localhost/api/daily-briefing?date=not-a-date");
    const res = await briefingGET(req);
    expect(res.status).toBe(400);
  });

  it("returns the briefing for a valid date param", async () => {
    const { db } = await import("@/lib/db");
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    vi.mocked(db.dailyBriefing.findUnique).mockResolvedValue({
      id: "b1",
      dateFor: new Date("2026-03-10T00:00:00Z"),
      generatedAt: new Date("2026-03-11T08:00:00Z"),
      generatedBy: "u1",
      report: { generatedAt: "2026-03-11T08:00:00Z", dateFor: "2026-03-10" },
    });

    const req = new Request("http://localhost/api/daily-briefing?date=2026-03-10");
    const res = await briefingGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dateFor).toBe("2026-03-10");
    expect(body.id).toBe("b1");
  });
});

// Verify the permission check is wired correctly
describe("Permission check sanity", () => {
  it("ADMIN has VIEW_MORNING_BRIEFING permission", () => {
    expect(hasPermission("ADMIN", PERMISSIONS.VIEW_MORNING_BRIEFING)).toBe(true);
  });

  it("MEMBER does not have VIEW_MORNING_BRIEFING permission", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.VIEW_MORNING_BRIEFING)).toBe(false);
  });
});
