import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/field-daily-report/auth", () => ({
  canUseFieldDailyReport: vi.fn(() => true),
  resolveFieldDailyReportOwnerId: vi.fn((im: string | null, userId: string) => im ?? userId),
}));

vi.mock("@/lib/field-daily-report/service", () => ({
  resolveReportDateParam: vi.fn((d: string | null) => d ?? "2026-07-14"),
  fetchProjectFieldDailySlice: vi.fn(),
}));

vi.mock("@/lib/field-daily-report/project-scope", () => ({
  userCanAccessProjectFieldDaily: vi.fn(async () => true),
}));

vi.mock("@/lib/db", () => ({
  db: {
    project: {
      findFirst: vi.fn(async () => ({ id: "p1", installManagerId: "im-1" })),
    },
  },
}));

import { getEffectiveSession } from "@/lib/masquerade";
import { fetchProjectFieldDailySlice } from "@/lib/field-daily-report/service";
import { GET } from "@/app/api/projects/[id]/field-daily/route";

describe("GET /api/projects/[id]/field-daily", () => {
  beforeEach(() => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN", email: "admin@test.com" },
    } as never);
    vi.mocked(fetchProjectFieldDailySlice).mockResolvedValue({
      projectId: "p1",
      projectName: "Marina Bay Condos",
      snapshot: {
        progress: {
          statusChangeCount: 0,
          installCompleteCount: 0,
          installCompleteQtyToday: 0,
          inspectionSubmittedCount: 0,
          issuesCreatedCount: 0,
          issuesResolvedCount: 0,
          observationsCreatedCount: 0,
        },
        statusUpdates: { summaryGroups: [], sourceEvents: [] },
        subcontractors: { summaryGroups: [] },
        teamsOnSite: { summaryGroups: [] },
        inspections: { summaryGroups: [] },
        issues: { items: [] },
        observations: { items: [] },
      },
      sectionNotes: [],
      comments: [],
    });
  });

  it("loads slice for the assigned install manager, not the session user", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/projects/p1/field-daily?date=2026-07-14"),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    expect(fetchProjectFieldDailySlice).toHaveBeenCalledWith(
      expect.objectContaining({
        installManagerUserId: "im-1",
        projectId: "p1",
        reportDate: "2026-07-14",
      }),
    );
  });
});
