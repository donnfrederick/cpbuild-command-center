import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Module-level mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/devtools-env", () => ({
  isDevToolsAllowed: vi.fn(),
  DEVTOOLS_BLOCKED_MESSAGE: "DevTools are disabled in this environment.",
}));

vi.mock("@/lib/devtools-auth", () => ({
  requireDevToolsAdmin: vi.fn(),
}));

vi.mock("@/lib/ai/gemini", () => ({
  isAIEnabled: vi.fn(),
  analyzeUnifierTable: vi.fn(),
}));

import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";
import { isAIEnabled, analyzeUnifierTable } from "@/lib/ai/gemini";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/devtools/unifier-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validTableDef = {
  tableName: "UNIFIER_UXPSR",
  displayName: "Project Status Reports",
  description: "G/Y/R health indicators",
  columns: [
    { code: "STATUS_SCHEDULE", label: "Schedule Status" },
    { code: "STATUS_COST", label: "Cost Status" },
  ],
};

const mockAnalysis = {
  summary: "Project Status Reports track G/Y/R health indicators.",
  integrationStatus: "not-yet-integrated",
  relatedDashboardFeatures: [],
  suggestedIntegrations: [],
  newFeatureIdeas: [],
  dataQualityNotes: [],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/devtools/unifier-analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isDevToolsAllowed).mockReturnValue(true);
    vi.mocked(requireDevToolsAdmin).mockResolvedValue(null);
    vi.mocked(isAIEnabled).mockReturnValue(true);
    vi.mocked(analyzeUnifierTable).mockResolvedValue(mockAnalysis);
    // Ensure we're in non-production so requireDevToolsAdmin is skipped for prod-path
    vi.stubEnv("NODE_ENV", "test");
  });

  it("returns 403 when DevTools are disabled", async () => {
    vi.mocked(isDevToolsAllowed).mockReturnValue(false);
    const { POST } = await import("@/app/api/devtools/unifier-analyze/route");
    const res = await POST(makeRequest({ tableDef: validTableDef }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe(DEVTOOLS_BLOCKED_MESSAGE);
  });

  it("returns 503 when GEMINI_API_KEY is not set", async () => {
    vi.mocked(isAIEnabled).mockReturnValue(false);
    const { POST } = await import("@/app/api/devtools/unifier-analyze/route");
    const res = await POST(makeRequest({ tableDef: validTableDef }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("GEMINI_API_KEY");
  });

  it("returns 400 for invalid JSON body", async () => {
    const { POST } = await import("@/app/api/devtools/unifier-analyze/route");
    const req = new NextRequest("http://localhost/api/devtools/unifier-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 400 when tableDef.tableName is missing", async () => {
    const { POST } = await import("@/app/api/devtools/unifier-analyze/route");
    const res = await POST(makeRequest({ tableDef: { displayName: "Test", columns: [] } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("tableDef.tableName");
  });

  it("returns 400 when tableDef.columns is missing", async () => {
    const { POST } = await import("@/app/api/devtools/unifier-analyze/route");
    const res = await POST(makeRequest({ tableDef: { tableName: "UNIFIER_UXPSR" } }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with analysis on a valid request (happy path)", async () => {
    const { POST } = await import("@/app/api/devtools/unifier-analyze/route");
    const res = await POST(makeRequest({
      tableDef: validTableDef,
      sampleRows: [{ STATUS_SCHEDULE: "G", STATUS_COST: "Y" }],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe(mockAnalysis.summary);
    expect(body.integrationStatus).toBe("not-yet-integrated");
  });

  it("defaults sampleRows to empty array when omitted", async () => {
    const { POST } = await import("@/app/api/devtools/unifier-analyze/route");
    await POST(makeRequest({ tableDef: validTableDef }));
    expect(analyzeUnifierTable).toHaveBeenCalledWith(validTableDef, []);
  });

  it("accepts a request where all nullable Unifier fields in sampleRows are null", async () => {
    const { POST } = await import("@/app/api/devtools/unifier-analyze/route");
    const res = await POST(makeRequest({
      tableDef: validTableDef,
      sampleRows: [{
        STATUS_SCHEDULE: null,
        STATUS_COST: null,
        PROJECT_ID: null,
      }],
      columns: [],
    }));
    expect(res.status).toBe(200);
  });

  it("returns 500 when analyzeUnifierTable throws", async () => {
    vi.mocked(analyzeUnifierTable).mockRejectedValue(new Error("Gemini quota exceeded"));
    const { POST } = await import("@/app/api/devtools/unifier-analyze/route");
    const res = await POST(makeRequest({ tableDef: validTableDef }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Gemini quota exceeded");
  });
});
