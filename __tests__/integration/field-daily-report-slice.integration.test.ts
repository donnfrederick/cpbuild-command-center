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
}));

vi.mock("@/lib/field-daily-report/project-scope", () => ({
  userCanAccessProjectFieldDaily: vi.fn(async () => true),
}));

vi.mock("@/lib/field-daily-report/project-hub-service", () => ({
  fetchProjectFieldDailySliceByDate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    project: {
      findFirst: vi.fn(async () => ({ id: "p1", installManagerId: "im-1" })),
    },
  },
}));

import { getEffectiveSession } from "@/lib/masquerade";
import { fetchProjectFieldDailySliceByDate } from "@/lib/field-daily-report/project-hub-service";
import { GET } from "@/app/api/projects/[id]/field-daily/slice/route";

describe("GET /api/projects/[id]/field-daily/slice", () => {
  beforeEach(() => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN", email: "admin@test.com" },
    } as never);
    vi.mocked(fetchProjectFieldDailySliceByDate).mockResolvedValue({
      projectId: "p1",
      projectName: "Marina Bay Condos",
      snapshot: { progress: { statusChangeCount: 0, installCompleteCount: 0, installCompleteQtyToday: 0, inspectionSubmittedCount: 0, issuesCreatedCount: 0, issuesResolvedCount: 0, observationsCreatedCount: 0 }, statusUpdates: { summaryGroups: [], sourceEvents: [] }, subcontractors: { summaryGroups: [] }, teamsOnSite: { summaryGroups: [] }, inspections: { summaryGroups: [] }, issues: { items: [] }, observations: { items: [] } },
      comments: [{ sectionKey: "progress", itemKey: "", body: "Saved note", updatedAt: "2026-07-14T12:00:00.000Z" }],
      sectionNotes: [
        {
          id: "note-1",
          sectionKey: "progress",
          itemKey: "",
          body: "Saved note",
          author: { id: "im-1", name: "IM", roleCode: "INSTALL_MANAGER", isInstallManager: true },
          createdAt: "2026-07-14T12:00:00.000Z",
          editedAt: null,
          replies: [],
        },
      ],
    });
  });

  it("returns slice with persisted section comments for the report owner", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/projects/p1/field-daily/slice?date=2026-07-14"),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { slice: { comments: { body: string }[] } };
    expect(fetchProjectFieldDailySliceByDate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        reportDate: "2026-07-14",
        reportOwnerUserId: "im-1",
      }),
    );
    expect(json.slice.comments[0].body).toBe("Saved note");
  });
});
