import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/dev-session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/level-scope-report", () => ({
  computeLevelScopeReport: vi.fn(),
}));

vi.mock("@/lib/pdf/level-scope-report-pdf", () => ({
  buildLevelScopeReportPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-test")),
}));

const REPORT = {
  levels: ["1"],
  scopes: ["Cabinets"],
  data: {
    "1": {
      Cabinets: {
        pct: 100,
        installedQty: 1,
        totalQty: 1,
        notStartedQty: 0,
        stagingQty: 0,
        assemblyQty: 0,
        installInProgressQty: 0,
      },
    },
  },
  overallByLevel: { "1": 100 },
  overallByScope: { Cabinets: 100 },
  grandTotalPct: 100,
  levelOverallUnits: { "1": { installedQty: 1, totalQty: 1 } },
  buildings: ["A"],
  levelToBuilding: { "1": "A" },
};

describe("POST /api/projects/[id]/level-scope-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/projects/[id]/level-scope-report/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }) as never,
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot manage projects", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { POST } = await import("@/app/api/projects/[id]/level-scope-report/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }) as never,
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when report has no location data", async () => {
    const { getSession } = await import("@/lib/dev-session");
    const { computeLevelScopeReport } = await import("@/lib/level-scope-report");
    vi.mocked(getSession).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(computeLevelScopeReport).mockResolvedValueOnce({
      ...REPORT,
      levels: [],
      scopes: [],
    } as never);

    const { POST } = await import("@/app/api/projects/[id]/level-scope-report/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }) as never,
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns a PDF attachment when report data exists", async () => {
    const { getSession } = await import("@/lib/dev-session");
    const { computeLevelScopeReport } = await import("@/lib/level-scope-report");
    const { buildLevelScopeReportPdf } = await import("@/lib/pdf/level-scope-report-pdf");
    vi.mocked(getSession).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(computeLevelScopeReport).mockResolvedValueOnce(REPORT as never);

    const { POST } = await import("@/app/api/projects/[id]/level-scope-report/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ projectName: "Project A" }),
      }) as never,
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("progress-report-p1");
    expect(buildLevelScopeReportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        report: REPORT,
        projectName: "Project A",
      })
    );
  });
});
