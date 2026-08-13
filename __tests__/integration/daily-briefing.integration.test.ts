import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks must be defined before any imports that use them ─────────────────────

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockCount = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    dailyBriefing: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    project: {
      count: (...args: unknown[]) => mockCount(...args),
    },
    projectRow: {
      count: (...args: unknown[]) => mockCount(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const mockFetchYesterday = vi.fn();
vi.mock("@/lib/github-activity", () => ({
  fetchYesterdayActivity: (...args: unknown[]) => mockFetchYesterday(...args),
}));

const mockGenerateBriefing = vi.fn();
const mockIsAIEnabled = vi.fn();
vi.mock("@/lib/ai/gemini", () => ({
  generateDailyBriefingReport: (...args: unknown[]) => mockGenerateBriefing(...args),
  isAIEnabled: () => mockIsAIEnabled(),
}));

// ── Import handlers after mocks ────────────────────────────────────────────────

const { GET, POST } = await import("@/app/api/daily-briefing/route");

// ── Fixtures ───────────────────────────────────────────────────────────────────

function adminSession() {
  return {
    user: { id: "admin-1", email: "phil@cpbuild.com", name: "Phil", role: "ADMIN" },
  };
}

function memberSession() {
  return {
    user: { id: "member-1", email: "user@cpbuild.com", name: "User", role: "MEMBER" },
  };
}

function makeReport() {
  return {
    generatedAt: "2026-03-05T08:00:00.000Z",
    dateFor: "2026-03-04",
    yesterdaysWork: { narrative: "Good progress.", shipped: [], dbHighlights: "Nothing changed." },
    optimizationsRecognized: [],
    issuesAndChallenges: [],
    roiAnalysis: { summary: "Good ROI.", items: [], totalEstimatedValue: "$0" },
    techPulse: { summary: "Lots happening.", items: [] },
    todaysSprint: { theme: "Ship it.", items: [] },
    morningInsight: "Interesting cross-domain insight.",
  };
}

function makeRequest(method = "GET") {
  return new Request("http://localhost/api/daily-briefing", { method });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/daily-briefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/daily-briefing"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockAuth.mockResolvedValue(memberSession());
    const res = await GET(new Request("http://localhost/api/daily-briefing"));
    expect(res.status).toBe(403);
  });

  it("returns { briefing: null } when no cached row exists", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockFindUnique.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/daily-briefing"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.briefing).toBeNull();
    expect(typeof body.dateFor).toBe("string");
  });

  it("returns cached briefing when row exists", async () => {
    mockAuth.mockResolvedValue(adminSession());
    const report = makeReport();

    mockFindUnique.mockResolvedValue({
      report,
      generatedAt: new Date("2026-03-05T08:00:00.000Z"),
    });

    const res = await GET(new Request("http://localhost/api/daily-briefing"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.briefing).toBeDefined();
    expect(body.briefing.morningInsight).toBe("Interesting cross-domain insight.");
    expect(body.generatedAt).toBe("2026-03-05T08:00:00.000Z");
  });
});

describe("POST /api/daily-briefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 400 for a syntactically valid but calendar-impossible date", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockIsAIEnabled.mockReturnValue(true);

    const res = await POST(
      new Request("http://localhost/api/daily-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-13-99" }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid date/i);
  });

  it("returns 503 when GEMINI_API_KEY is not configured", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockIsAIEnabled.mockReturnValue(false);

    const res = await POST();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toMatch(/GEMINI_API_KEY/);
  });

  it("returns 502 when Gemini pipeline throws", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockIsAIEnabled.mockReturnValue(true);
    mockFetchYesterday.mockResolvedValue({ mergedPRs: [], recentCommits: [] });
    mockTransaction.mockResolvedValue([0, 0, 0, 0, 0]);
    mockGenerateBriefing.mockRejectedValue(new Error("Gemini rate limit"));

    const res = await POST();
    expect(res.status).toBe(502);

    const body = await res.json();
    expect(body.error).toMatch(/AI generation failed/);
  });

  it("generates a briefing, upserts to DB, and returns 200 with report", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockIsAIEnabled.mockReturnValue(true);
    mockFetchYesterday.mockResolvedValue({
      mergedPRs: [
        {
          number: 99,
          title: "feat: morning briefing",
          url: "https://github.com/cp-build-dev-ops/command-center-reboot/pull/99",
          mergedAt: "2026-03-04T15:00:00Z",
          author: "cp-build-dev",
          body: "Adds the daily briefing page.",
        },
      ],
      recentCommits: [],
    });

    // DB stats: [projectsCreated, projectsUpdated, rowsUpdated, totalActive, blockedRows]
    mockTransaction.mockResolvedValue([1, 2, 14, 5, 3]);

    const report = makeReport();
    mockGenerateBriefing.mockResolvedValue(report);
    mockUpsert.mockResolvedValue({ id: "briefing-1", ...report, generatedAt: new Date("2026-03-05T08:00:00.000Z") });

    const res = await POST();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.briefing.morningInsight).toBe("Interesting cross-domain insight.");
    expect(body.dateFor).toBeDefined();
    expect(body.generatedAt).toBeDefined();

    // Verify Gemini was called with the context
    expect(mockGenerateBriefing).toHaveBeenCalledOnce();
    const ctx = mockGenerateBriefing.mock.calls[0][0];
    expect(ctx.mergedPRs).toHaveLength(1);
    expect(ctx.dbStats.projectsCreated).toBe(1);
    expect(ctx.dbStats.blockedRowCount).toBe(3);

    // Verify upsert was called
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it("passes empty PR/commit arrays to Gemini when GitHub token is missing", async () => {
    mockAuth.mockResolvedValue(adminSession());
    mockIsAIEnabled.mockReturnValue(true);
    // Simulate GITHUB_TOKEN absent — fetchYesterdayActivity returns empty arrays
    mockFetchYesterday.mockResolvedValue({ mergedPRs: [], recentCommits: [] });
    mockTransaction.mockResolvedValue([0, 0, 0, 3, 0]);

    const report = makeReport();
    mockGenerateBriefing.mockResolvedValue(report);
    mockUpsert.mockResolvedValue({ id: "briefing-2", ...report, generatedAt: new Date("2026-03-05T08:00:00.000Z") });

    const res = await POST();
    expect(res.status).toBe(200);

    const ctx = mockGenerateBriefing.mock.calls[0][0];
    expect(ctx.mergedPRs).toEqual([]);
    expect(ctx.recentCommits).toEqual([]);
  });
});
