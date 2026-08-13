import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(() => true),
  PERMISSIONS: { VIEW_DASHBOARD: "view:dashboard" },
}));

vi.mock("@/lib/field-daily-report/service", () => ({
  fetchFieldDailyReport: vi.fn(),
  generateFieldDailyReport: vi.fn(),
  resolveReportDateParam: vi.fn((d: string | null) => d ?? "2026-07-10"),
}));

import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission } from "@/lib/permissions";
import {
  fetchFieldDailyReport,
  generateFieldDailyReport,
} from "@/lib/field-daily-report/service";
import { GET } from "@/app/api/reports/field-daily/route";
import { POST } from "@/app/api/reports/field-daily/generate/route";

describe("field daily report API", () => {
  beforeEach(() => {
    vi.mocked(generateFieldDailyReport).mockClear();
    vi.mocked(fetchFieldDailyReport).mockClear();
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "im-1", role: "INSTALL_MANAGER", email: "im@test.com" },
    } as never);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(fetchFieldDailyReport).mockResolvedValue(null);
    vi.mocked(generateFieldDailyReport).mockResolvedValue({
      id: "r1",
      reportDate: "2026-07-10",
      projects: [],
    } as never);
  });

  describe("GET /api/reports/field-daily", () => {
    it("returns 401 without session", async () => {
      vi.mocked(getEffectiveSession).mockResolvedValue(null);
      const res = await GET(new NextRequest("http://localhost/api/reports/field-daily"));
      expect(res.status).toBe(401);
    });

    it("returns 403 when user lacks dashboard permission", async () => {
      vi.mocked(hasPermission).mockReturnValue(false);
      const res = await GET(new NextRequest("http://localhost/api/reports/field-daily"));
      expect(res.status).toBe(403);
    });

    it("returns 403 for MEMBER role", async () => {
      vi.mocked(getEffectiveSession).mockResolvedValue({
        user: { id: "m1", role: "MEMBER", email: "m@test.com" },
      } as never);
      const res = await GET(new NextRequest("http://localhost/api/reports/field-daily"));
      expect(res.status).toBe(403);
    });

    it("returns report payload on happy path", async () => {
      vi.mocked(fetchFieldDailyReport).mockResolvedValue({
        id: "r1",
        reportDate: "2026-07-10",
        projects: [],
      } as never);
      const res = await GET(
        new NextRequest("http://localhost/api/reports/field-daily?date=2026-07-10"),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { reportDate: string; report: { id: string } };
      expect(json.reportDate).toBe("2026-07-10");
      expect(json.report.id).toBe("r1");
      expect(fetchFieldDailyReport).toHaveBeenCalledWith(
        expect.objectContaining({
          installManagerUserId: "im-1",
          reportDate: "2026-07-10",
        }),
      );
    });
  });

  describe("POST /api/reports/field-daily/generate", () => {
    it("returns 401 without session", async () => {
      vi.mocked(getEffectiveSession).mockResolvedValue(null);
      const res = await POST(
        new NextRequest("http://localhost/api/reports/field-daily/generate", { method: "POST" }),
      );
      expect(res.status).toBe(401);
    });

    it("generates report for install manager", async () => {
      const res = await POST(
        new NextRequest("http://localhost/api/reports/field-daily/generate", {
          method: "POST",
          body: JSON.stringify({ date: "2026-07-10" }),
        }),
      );
      expect(res.status).toBe(200);
      expect(generateFieldDailyReport).toHaveBeenCalledWith(
        expect.objectContaining({
          installManagerUserId: "im-1",
          reportDate: "2026-07-10",
          generatedByUserId: "im-1",
        }),
      );
    });

    it("returns 403 for PROJECT_MANAGER on generate", async () => {
      vi.mocked(getEffectiveSession).mockResolvedValue({
        user: { id: "pm-1", role: "PROJECT_MANAGER", email: "pm@test.com" },
      } as never);
      vi.mocked(hasPermission).mockReturnValue(true);
      const res = await POST(
        new NextRequest("http://localhost/api/reports/field-daily/generate", {
          method: "POST",
          body: JSON.stringify({ date: "2026-07-10" }),
        }),
      );
      expect(res.status).toBe(403);
      expect(generateFieldDailyReport).not.toHaveBeenCalled();
    });

    it("passes projectIds for selective backfill", async () => {
      const res = await POST(
        new NextRequest("http://localhost/api/reports/field-daily/generate", {
          method: "POST",
          body: JSON.stringify({ date: "2026-07-08", projectIds: ["p-1", "p-2"] }),
        }),
      );
      expect(res.status).toBe(200);
      expect(generateFieldDailyReport).toHaveBeenCalledWith(
        expect.objectContaining({
          reportDate: "2026-07-08",
          projectIds: ["p-1", "p-2"],
        }),
      );
    });

    it("returns 422 when projectIds is an empty array", async () => {
      const res = await POST(
        new NextRequest("http://localhost/api/reports/field-daily/generate", {
          method: "POST",
          body: JSON.stringify({ date: "2026-07-08", projectIds: [] }),
        }),
      );
      expect(res.status).toBe(422);
      expect(generateFieldDailyReport).not.toHaveBeenCalled();
    });
  });
});
