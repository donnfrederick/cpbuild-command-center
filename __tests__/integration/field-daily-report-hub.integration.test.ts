import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));
vi.mock("@/lib/field-daily-report/auth", () => ({
  canUseFieldDailyReport: vi.fn(() => true),
  canGenerateProjectFieldDailyReport: vi.fn(() => true),
  resolveFieldDailyReportOwnerId: vi.fn((_im: string | null, userId: string) => _im ?? userId),
}));

vi.mock("@/lib/field-daily-report/project-hub-service", () => ({
  fetchProjectFieldDailyHub: vi.fn(),
  fetchProjectFieldDailyHistory: vi.fn(),
  generateProjectFieldDailySlice: vi.fn(),
}));

vi.mock("@/lib/field-daily-report/service", () => ({
  resolveReportDateParam: vi.fn((d: string | null) => d ?? "2026-07-14"),
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
import {
  fetchProjectFieldDailyHub,
  generateProjectFieldDailySlice,
} from "@/lib/field-daily-report/project-hub-service";
import { GET } from "@/app/api/projects/[id]/field-daily/hub/route";
import { POST } from "@/app/api/projects/[id]/field-daily/generate/route";

describe("project field daily hub API", () => {
  beforeEach(() => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "im-1", role: "INSTALL_MANAGER", email: "im@test.com" },
    } as never);
    vi.mocked(fetchProjectFieldDailyHub).mockResolvedValue({
      todayDate: "2026-07-14",
      todayReport: null,
      recentWithActivity: null,
      historyCount: 0,
    });
    vi.mocked(generateProjectFieldDailySlice).mockResolvedValue({
      slice: {
        projectId: "p1",
        projectName: "Test",
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
      },
      contentChanged: true,
      hadExisting: false,
    });
  });

  it("GET hub returns payload", async () => {
    const res = await GET(new NextRequest("http://localhost/api/projects/p1/field-daily/hub"), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { hub: { todayDate: string } };
    expect(json.hub.todayDate).toBe("2026-07-14");
    expect(fetchProjectFieldDailyHub).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", reportOwnerUserId: "im-1" }),
    );
  });

  it("POST generate returns slice for assigned install manager", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/projects/p1/field-daily/generate", {
        method: "POST",
        body: JSON.stringify({ date: "2026-07-14" }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    expect(generateProjectFieldDailySlice).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", reportOwnerUserId: "im-1" }),
    );
  });

  it("POST generate returns 403 when generate is denied", async () => {
    const { canGenerateProjectFieldDailyReport } = await import("@/lib/field-daily-report/auth");
    vi.mocked(canGenerateProjectFieldDailyReport).mockReturnValue(false);
    const res = await POST(
      new NextRequest("http://localhost/api/projects/p1/field-daily/generate", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(403);
  });
});
