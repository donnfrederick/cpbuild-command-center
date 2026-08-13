import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(() => true),
  PERMISSIONS: { VIEW_DASHBOARD: "view:dashboard" },
}));

vi.mock("@/lib/inspections/fetch-global-inspections-report", () => ({
  fetchGlobalInspectionsReport: vi.fn(),
  parseInspectionReportDateParam: vi.fn((value: string) => {
    if (value === "2026-99-99") return null;
    return new Date(`${value}T00:00:00.000Z`);
  }),
}));

import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission } from "@/lib/permissions";
import { fetchGlobalInspectionsReport } from "@/lib/inspections/fetch-global-inspections-report";
import { GET } from "@/app/api/reports/global-inspections/route";

describe("GET /api/reports/global-inspections", () => {
  beforeEach(() => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "ADMIN", email: "a@test.com" },
    } as never);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(fetchGlobalInspectionsReport).mockResolvedValue({ submissions: [] });
  });

  it("returns 401 without session", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/reports/global-inspections"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks permission", async () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    const res = await GET(new NextRequest("http://localhost/api/reports/global-inspections"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid from date", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/reports/global-inspections?from=2026-99-99")
    );
    expect(res.status).toBe(400);
  });

  it("returns submissions on happy path", async () => {
    vi.mocked(fetchGlobalInspectionsReport).mockResolvedValue({
      submissions: [
        {
          submissionId: "s1",
          projectId: "p1",
          projectName: "Alpha",
          scopeTypeCode: "CABIU",
          scopeTypeName: "Cabinets",
          sections: [],
        },
      ],
    } as never);

    const res = await GET(
      new NextRequest(
        "http://localhost/api/reports/global-inspections?from=2026-01-01&to=2026-01-31"
      )
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { submissions: unknown[] };
    expect(body.submissions).toHaveLength(1);
    expect(fetchGlobalInspectionsReport).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "ADMIN",
        fromDate: expect.any(Date),
        toDate: expect.any(Date),
      })
    );
  });
});
