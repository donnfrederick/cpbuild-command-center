import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

const mockAnalyzeProjectUnits = vi.fn();
const mockGenerateBriefing = vi.fn();
const mockAnalyzePortfolio = vi.fn();
const mockFreeformPrompt = vi.fn();
const mockIsAIEnabled = vi.fn();

vi.mock("@/lib/ai/gemini", () => ({
  isAIEnabled: () => mockIsAIEnabled(),
  analyzeProjectUnits: (...args: unknown[]) => mockAnalyzeProjectUnits(...args),
  generateBriefing: (...args: unknown[]) => mockGenerateBriefing(...args),
  analyzePortfolio: (...args: unknown[]) => mockAnalyzePortfolio(...args),
  freeformPrompt: (...args: unknown[]) => mockFreeformPrompt(...args),
}));

const mockProjectFindMany = vi.fn();
const mockProjectRowFindMany = vi.fn();
const mockEnrichProjectById = vi.fn();
const mockEnrichProjectList = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    project: {
      findMany: (...args: unknown[]) => mockProjectFindMany(...args),
    },
    projectRow: {
      findMany: (...args: unknown[]) => mockProjectRowFindMany(...args),
    },
  },
}));

vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectById: (...args: unknown[]) => mockEnrichProjectById(...args),
  enrichProjectList: (...args: unknown[]) => mockEnrichProjectList(...args),
}));

vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));

vi.mock("@/lib/devtools-env", () => ({
  isDevToolsAllowed: () => false,
}));

// ── Import handler after mocks ─────────────────────────────────────────────────

const { POST } = await import("@/app/api/ai/analyze/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
  return { user: { id: "admin-1", role: "ADMIN" } };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FIXTURE_ROW = {
  building: "A", level: "1", unit: "101", unitType: "1BR",
  description: "Flooring", scopeType: { name: "Flooring" },
  scopeStage: "ROUGH", scopeStatus: "IN_PROGRESS", percentComplete: 50,
  installer: { name: "ABC Inc" }, shipPhase: "P1", buildPhase: "B1",
};

const FIXTURE_ENRICHED_PROJECT = {
  id: "p-fixture",
  projectName: "Tower A",
  siteLocation: "Downtown",
  status: "Construction",
  lifecycleStatus: "Active" as const,
  startDate: null as string | null,
  installManagerId: null as string | null,
  installManagerName: "Jane",
  projectManagerId: null as string | null,
  projectManagerName: "Bob",
  unifierPid: "uni-1",
  unifierProjectNumber: "CP-001",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/ai/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAIEnabled.mockReturnValue(true);
    mockAuth.mockResolvedValue(adminSession());
    mockEnrichProjectList.mockImplementation(async (rows: { id: string; unifierPid?: string | null }[]) =>
      rows.map((r) => ({
        id: r.id,
        projectName: "T1",
        siteLocation: "L1",
        status: "Construction",
        lifecycleStatus: "Active" as const,
        startDate: null,
        installManagerId: null,
        installManagerName: null,
        projectManagerId: null,
        projectManagerName: "",
        unifierPid: r.unifierPid ?? null,
        unifierProjectNumber: null,
      }))
    );
  });

  it("returns 503 when AI is disabled", async () => {
    mockIsAIEnabled.mockReturnValue(false);
    const res = await POST(makeRequest({ type: "units", projectId: "p1" }));
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("AI_DISABLED");
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ type: "units", projectId: "p1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid type", async () => {
    const res = await POST(makeRequest({ type: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when projectId is missing for type=units", async () => {
    const res = await POST(makeRequest({ type: "units" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when project does not exist", async () => {
    mockEnrichProjectById.mockResolvedValue(null);
    const res = await POST(makeRequest({ type: "units", projectId: "p-404" }));
    expect(res.status).toBe(404);
  });

  it("returns 422 when project has no rows", async () => {
    mockEnrichProjectById.mockResolvedValue({ ...FIXTURE_ENRICHED_PROJECT, id: "p-422" });
    mockProjectRowFindMany.mockResolvedValue([]);
    const res = await POST(makeRequest({ type: "units", projectId: "p-422" }));
    expect(res.status).toBe(422);
  });

  it("returns 200 with insights for type=units", async () => {
    mockEnrichProjectById.mockResolvedValue({ ...FIXTURE_ENRICHED_PROJECT, id: "p-units-200" });
    mockProjectRowFindMany.mockResolvedValue([FIXTURE_ROW]);
    mockAnalyzeProjectUnits.mockResolvedValue({ summary: "All good" });

    const res = await POST(makeRequest({ type: "units", projectId: "p-units-200" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { insights: { summary: string } };
    expect(body.insights.summary).toBe("All good");
  });

  it("returns 200 with briefing for type=briefing", async () => {
    mockEnrichProjectById.mockResolvedValue({ ...FIXTURE_ENRICHED_PROJECT, id: "p-briefing-200" });
    mockProjectRowFindMany.mockResolvedValue([FIXTURE_ROW]);
    mockGenerateBriefing.mockResolvedValue({ text: "Morning briefing text" });

    const res = await POST(makeRequest({ type: "briefing", projectId: "p-briefing-200" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { briefing: { text: string } };
    expect(body.briefing.text).toBe("Morning briefing text");
  });

  it("returns 200 with portfolio analysis for type=portfolio", async () => {
    mockProjectFindMany.mockResolvedValue([
      {
        id: "pr-portfolio",
        unifierPid: "u1",
        installManagerId: null,
        installManagerName: null,
        projectManagerId: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        projectRows: [],
      },
    ]);
    mockAnalyzePortfolio.mockResolvedValue({ health: "good" });

    const res = await POST(makeRequest({ type: "portfolio" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { portfolio: { health: string } };
    expect(body.portfolio.health).toBe("good");
  });

  it("returns 429 when Gemini throws a quota error", async () => {
    mockEnrichProjectById.mockResolvedValue({ ...FIXTURE_ENRICHED_PROJECT, id: "p-quota-unique" });
    mockProjectRowFindMany.mockResolvedValue([FIXTURE_ROW]);
    mockAnalyzeProjectUnits.mockRejectedValue(new Error("429 quota exceeded"));

    const res = await POST(makeRequest({ type: "units", projectId: "p-quota-unique" }));
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("QUOTA_EXCEEDED");
  });
});
