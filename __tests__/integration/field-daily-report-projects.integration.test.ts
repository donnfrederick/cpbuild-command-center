import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(() => true),
  PERMISSIONS: { VIEW_DASHBOARD: "view:dashboard" },
}));

vi.mock("@/lib/field-daily-report/project-scope", () => ({
  loadBackfillProjects: vi.fn(),
}));

vi.mock("@/lib/field-daily-report/service", () => ({
  resolveReportDateParam: vi.fn((d: string | null) => d ?? "2026-07-10"),
}));

import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission } from "@/lib/permissions";
import { loadBackfillProjects } from "@/lib/field-daily-report/project-scope";
import { GET } from "@/app/api/reports/field-daily/projects/route";

describe("GET /api/reports/field-daily/projects", () => {
  beforeEach(() => {
    vi.mocked(loadBackfillProjects).mockClear();
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "im-1", role: "INSTALL_MANAGER", email: "im@test.com" },
    } as never);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(loadBackfillProjects).mockResolvedValue([
      { id: "p-1", projectName: "Alpha Tower" },
      { id: "p-2", projectName: "Beta Site" },
    ] as never);
  });

  it("returns 401 without session", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/reports/field-daily/projects"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks field-daily access", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "m1", role: "MEMBER", email: "m@test.com" },
    } as never);
    const res = await GET(new NextRequest("http://localhost/api/reports/field-daily/projects"));
    expect(res.status).toBe(403);
  });

  it("returns portfolio projects for backfill picker", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/reports/field-daily/projects?date=2026-07-08"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      reportDate: string;
      projects: { id: string; projectName: string }[];
    };
    expect(json.reportDate).toBe("2026-07-08");
    expect(json.projects).toHaveLength(2);
    expect(loadBackfillProjects).toHaveBeenCalledWith("im-1", "INSTALL_MANAGER");
  });
});
