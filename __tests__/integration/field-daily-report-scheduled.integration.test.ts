import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/field-daily-report/cron-auth", () => ({
  verifyFieldDailyCronBearer: vi.fn(),
}));

vi.mock("@/lib/field-daily-report/scheduled-generate", () => ({
  runScheduledFieldDailyReports: vi.fn(),
}));

import { verifyFieldDailyCronBearer } from "@/lib/field-daily-report/cron-auth";
import { runScheduledFieldDailyReports } from "@/lib/field-daily-report/scheduled-generate";
import { POST } from "@/app/api/internal/field-daily/scheduled-generate/route";

describe("POST /api/internal/field-daily/scheduled-generate", () => {
  beforeEach(() => {
    vi.mocked(verifyFieldDailyCronBearer).mockReturnValue(true);
    vi.mocked(runScheduledFieldDailyReports).mockResolvedValue({
      reportDate: "2026-07-16",
      installManagersProcessed: 2,
      installManagersWithReports: 1,
      projectsWritten: 3,
      skipped: false,
      errors: [],
    });
  });

  it("returns 401 without bearer auth", async () => {
    vi.mocked(verifyFieldDailyCronBearer).mockReturnValue(false);
    const res = await POST(
      new NextRequest("http://localhost/api/internal/field-daily/scheduled-generate", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("runs scheduled generate on happy path", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/internal/field-daily/scheduled-generate", {
        method: "POST",
        body: JSON.stringify({ force: true }),
      }),
    );
    expect(res.status).toBe(200);
    expect(runScheduledFieldDailyReports).toHaveBeenCalledWith({ reportDate: undefined, force: true });
    const json = (await res.json()) as { projectsWritten: number };
    expect(json.projectsWritten).toBe(3);
  });

  it("returns 422 for invalid date", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/internal/field-daily/scheduled-generate", {
        method: "POST",
        body: JSON.stringify({ date: "not-a-date", force: true }),
      }),
    );
    expect(res.status).toBe(422);
  });
});
