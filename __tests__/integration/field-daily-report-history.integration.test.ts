import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));
vi.mock("@/lib/field-daily-report/auth", () => ({
  canUseFieldDailyReport: vi.fn(() => true),
  resolveFieldDailyReportOwnerId: vi.fn((_im: string | null, userId: string) => _im ?? userId),
}));

vi.mock("@/lib/field-daily-report/project-hub-service", () => ({
  fetchProjectFieldDailyHistory: vi.fn(),
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
import { fetchProjectFieldDailyHistory } from "@/lib/field-daily-report/project-hub-service";
import { GET } from "@/app/api/projects/[id]/field-daily/history/route";

describe("project field daily history API", () => {
  beforeEach(() => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "im-1", role: "INSTALL_MANAGER", email: "im@test.com" },
    } as never);
    vi.mocked(fetchProjectFieldDailyHistory).mockResolvedValue({
      entries: [{
        reportDate: "2026-07-14",
        generatedAt: "2026-07-14T18:00:00.000Z",
        hasActivity: true,
        activityPreview: {
          statusChanges: 1,
          inspections: 0,
          issuesReported: 0,
          otherActivity: 0,
        },
      }],
      nextCursor: null,
      totalInRange: 1,
    });
  });

  it("GET history returns paginated payload", async () => {
    const res = await GET(
      new NextRequest(
        "http://localhost/api/projects/p1/field-daily/history?from=2026-07-01&to=2026-07-14&limit=10",
      ),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      history: { entries: { reportDate: string }[] };
      fromDate: string;
      toDate: string;
    };
    expect(json.history.entries[0]?.reportDate).toBe("2026-07-14");
    expect(fetchProjectFieldDailyHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        reportOwnerUserId: "im-1",
        fromDate: "2026-07-01",
        toDate: "2026-07-14",
        limit: 10,
      }),
    );
  });

  it("GET history returns 400 for invalid range", async () => {
    const res = await GET(
      new NextRequest(
        "http://localhost/api/projects/p1/field-daily/history?from=2026-07-20&to=2026-07-01",
      ),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(400);
  });
});
