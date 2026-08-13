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
  resolveReportDateParam: vi.fn((d: string | null | undefined) => d ?? "2026-07-14"),
  SECTION_KEYS: [
    "progress",
    "statusUpdates",
    "subcontractors",
    "teamsOnSite",
    "inspections",
    "issues",
    "observations",
    "other",
  ],
}));

vi.mock("@/lib/field-daily-report/project-scope", () => ({
  userCanAccessProjectFieldDaily: vi.fn(async () => true),
}));

vi.mock("@/lib/field-daily-report/report-project-row", () => ({
  findFieldDailyReportProjectRow: vi.fn(async () => ({ id: "row-1" })),
}));

vi.mock("@/lib/field-daily-report/section-notes-service", () => ({
  createFieldDailySectionNote: vi.fn(),
  listFieldDailySectionNotesForProjectRow: vi.fn(async () => []),
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
import { createFieldDailySectionNote } from "@/lib/field-daily-report/section-notes-service";
import { POST } from "@/app/api/projects/[id]/field-daily/section-notes/route";

describe("POST /api/projects/[id]/field-daily/section-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN", email: "admin@test.com" },
    } as never);
    vi.mocked(createFieldDailySectionNote).mockResolvedValue({
      id: "note-1",
      sectionKey: "progress",
      itemKey: "",
      body: "End of day note",
      author: {
        id: "admin-1",
        name: "Admin",
        roleCode: "ADMIN",
        isInstallManager: false,
      },
      createdAt: "2026-07-14T12:00:00.000Z",
      editedAt: null,
      replies: [],
    });
  });

  it("accepts sectionKey progress and uses report owner ids", async () => {
    const res = await POST(
      new Request("http://localhost/api/projects/p1/field-daily/section-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate: "2026-07-14",
          sectionKey: "progress",
          body: "End of day note",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(201);
    expect(resolveFieldDailyReportOwnerUserIds).toHaveBeenCalledWith("im-1", "admin-1");
    expect(createFieldDailySectionNote).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserIds: ["im-1", "admin-1"],
        sectionKey: "progress",
        body: "End of day note",
        authorUserId: "admin-1",
      }),
    );
  });
});
