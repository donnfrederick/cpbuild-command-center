import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/field-daily-report/auth", () => ({
  canUseFieldDailyReport: vi.fn(() => true),
  resolveFieldDailyReportOwnerUserIds: vi.fn((im: string | null, userId: string) =>
    im && im !== userId ? [im, userId] : [userId],
  ),
}));

vi.mock("@/lib/field-daily-report/service", () => ({
  resolveReportDateParam: vi.fn((d: string | null) => d ?? "2026-07-14"),
  upsertFieldDailyReportDailyManpower: vi.fn(),
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
import { resolveFieldDailyReportOwnerUserIds } from "@/lib/field-daily-report/auth";
import { upsertFieldDailyReportDailyManpower } from "@/lib/field-daily-report/service";
import { PUT } from "@/app/api/projects/[id]/field-daily/workforce/route";

describe("PUT /api/projects/[id]/field-daily/workforce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN", email: "admin@test.com" },
    } as never);
    vi.mocked(upsertFieldDailyReportDailyManpower).mockResolvedValue({
      dailyManpower: 12,
      dailyManpowerMeta: {
        setAt: "2026-07-14T12:00:00.000Z",
        setBy: {
          id: "admin-1",
          name: "Admin User",
          roleCode: "ADMIN",
          isInstallManager: false,
        },
      },
    });
  });

  it("accepts dailyManpower and uses report owner id", async () => {
    const res = await PUT(
      new NextRequest("http://localhost/api/projects/p1/field-daily/workforce", {
        method: "PUT",
        body: JSON.stringify({
          reportDate: "2026-07-14",
          dailyManpower: 12,
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    expect(resolveFieldDailyReportOwnerUserIds).toHaveBeenCalledWith("im-1", "admin-1");
    expect(upsertFieldDailyReportDailyManpower).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserIds: ["im-1", "admin-1"],
        dailyManpower: 12,
        setByUserId: "admin-1",
      }),
    );
    const body = (await res.json()) as {
      dailyManpower: number;
      dailyManpowerMeta: { setAt: string; setBy: { id: string } };
    };
    expect(body.dailyManpowerMeta.setBy.id).toBe("admin-1");
  });

  it("rejects non-integer dailyManpower", async () => {
    const res = await PUT(
      new NextRequest("http://localhost/api/projects/p1/field-daily/workforce", {
        method: "PUT",
        body: JSON.stringify({
          reportDate: "2026-07-14",
          dailyManpower: 12.5,
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(400);
    expect(upsertFieldDailyReportDailyManpower).not.toHaveBeenCalled();
  });
});
