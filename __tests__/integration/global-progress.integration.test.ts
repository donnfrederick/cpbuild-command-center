import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(() => true),
  PERMISSIONS: { VIEW_DASHBOARD: "view:dashboard" },
}));

vi.mock("@/lib/reports/portfolio-progress-service", () => ({
  computePortfolioProgressList: vi.fn(),
  computePortfolioProgressDetail: vi.fn(),
}));

import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { hasPermission } from "@/lib/permissions";
import {
  computePortfolioProgressDetail,
  computePortfolioProgressList,
} from "@/lib/reports/portfolio-progress-service";
import { GET as listGET } from "@/app/api/reports/global-progress/route";
import { GET as detailGET } from "@/app/api/reports/global-progress/[projectId]/route";

describe("GET /api/reports/global-progress", () => {
  beforeEach(() => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "ADMIN", email: "a@test.com" },
    } as never);
    vi.mocked(hasPermission).mockReturnValue(true);
  });

  it("returns 401 without session", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await listGET(new NextRequest("http://localhost/api/reports/global-progress"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks permission", async () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    const res = await listGET(new NextRequest("http://localhost/api/reports/global-progress"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid custom range", async () => {
    const res = await listGET(
      new NextRequest(
        "http://localhost/api/reports/global-progress?preset=custom&from=2025-06-10&to=2025-06-01",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when custom preset omits dates", async () => {
    const res = await listGET(
      new NextRequest("http://localhost/api/reports/global-progress?preset=custom"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid calendar custom dates", async () => {
    const res = await listGET(
      new NextRequest(
        "http://localhost/api/reports/global-progress?preset=custom&from=2026-99-99&to=2026-06-01",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns portfolio list on happy path", async () => {
    vi.mocked(computePortfolioProgressList).mockResolvedValue({
      comparePeriod: { preset: "1w", from: "2025-05-25", to: "2025-06-01" },
      projects: [
        {
          id: "p1",
          name: "Alpha",
          unifierPid: null,
          hasChangesInPeriod: false,
          scopeSummaries: [],
        },
      ],
    });
    const res = await listGET(
      new NextRequest("http://localhost/api/reports/global-progress?preset=1w"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    expect(computePortfolioProgressList).toHaveBeenCalledWith("ADMIN", expect.any(Object));
  });
});

describe("GET /api/reports/global-progress/[projectId]", () => {
  beforeEach(() => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "ADMIN", email: "a@test.com" },
    } as never);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(enforceProjectReadVisibility).mockResolvedValue(null);
  });

  it("returns 401 without session", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await detailGET(
      new NextRequest("http://localhost/api/reports/global-progress/p1?preset=1w"),
      { params: Promise.resolve({ projectId: "p1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks permission", async () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    const res = await detailGET(
      new NextRequest("http://localhost/api/reports/global-progress/p1?preset=1w"),
      { params: Promise.resolve({ projectId: "p1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when project is not visible", async () => {
    vi.mocked(enforceProjectReadVisibility).mockResolvedValue(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 }) as never,
    );
    const res = await detailGET(
      new NextRequest("http://localhost/api/reports/global-progress/p1?preset=1w"),
      { params: Promise.resolve({ projectId: "p1" }) },
    );
    expect(res.status).toBe(404);
    expect(computePortfolioProgressDetail).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid query params", async () => {
    const res = await detailGET(
      new NextRequest(
        "http://localhost/api/reports/global-progress/p1?preset=custom&from=bad&to=2025-06-01",
      ),
      { params: Promise.resolve({ projectId: "p1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when project missing", async () => {
    vi.mocked(computePortfolioProgressDetail).mockResolvedValue(null);
    const res = await detailGET(
      new NextRequest("http://localhost/api/reports/global-progress/p1?preset=1w"),
      { params: Promise.resolve({ projectId: "p1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns project detail on happy path", async () => {
    vi.mocked(computePortfolioProgressDetail).mockResolvedValue({
      comparePeriod: { preset: "1w", from: "2025-05-25", to: "2025-06-01" },
      project: {
        id: "p1",
        name: "Alpha",
        unifierPid: null,
        hasChangesInPeriod: false,
        scopeSummaries: [],
        buildings: [],
      },
    });
    const res = await detailGET(
      new NextRequest("http://localhost/api/reports/global-progress/p1?preset=1w"),
      { params: Promise.resolve({ projectId: "p1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.id).toBe("p1");
    expect(enforceProjectReadVisibility).toHaveBeenCalledWith("p1", expect.any(Object));
  });
});
