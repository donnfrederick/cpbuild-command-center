import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(),
  PERMISSIONS: { VIEW_DASHBOARD: "view:dashboard" },
}));

import { hasPermission } from "@/lib/permissions";
import { canGenerateFieldDailyReport, canGenerateProjectFieldDailyReport, canUseFieldDailyReport } from "@/lib/field-daily-report/auth";
import {
  clampReportDateToToday,
  formatFieldDailyReportDateLabel,
  todayReportDateInOrgTz,
} from "@/lib/field-daily-report/timezone";

describe("canUseFieldDailyReport", () => {
  it("returns false when VIEW_DASHBOARD is denied", () => {
    vi.mocked(hasPermission).mockReturnValue(false);
    expect(canUseFieldDailyReport("INSTALL_MANAGER")).toBe(false);
  });

  it("returns true for INSTALL_MANAGER with dashboard access", () => {
    vi.mocked(hasPermission).mockReturnValue(true);
    expect(canUseFieldDailyReport("INSTALL_MANAGER")).toBe(true);
  });

  it("returns false for MEMBER even with dashboard access", () => {
    vi.mocked(hasPermission).mockReturnValue(true);
    expect(canUseFieldDailyReport("MEMBER")).toBe(false);
  });
});

describe("canGenerateFieldDailyReport", () => {
  it("allows install manager to generate", () => {
    vi.mocked(hasPermission).mockReturnValue(true);
    expect(canGenerateFieldDailyReport("INSTALL_MANAGER")).toBe(true);
  });

  it("denies project manager from generating", () => {
    vi.mocked(hasPermission).mockReturnValue(true);
    expect(canGenerateFieldDailyReport("PROJECT_MANAGER")).toBe(false);
  });

  it("still allows project manager to use view-only APIs via canUseFieldDailyReport", () => {
    vi.mocked(hasPermission).mockReturnValue(true);
    expect(canUseFieldDailyReport("PROJECT_MANAGER")).toBe(true);
  });
});

describe("canGenerateProjectFieldDailyReport", () => {
  it("allows admin on unassigned projects", () => {
    vi.mocked(hasPermission).mockReturnValue(true);
    expect(canGenerateProjectFieldDailyReport("ADMIN", "admin-1", null)).toBe(true);
  });

  it("allows install manager when project IM is unassigned", () => {
    vi.mocked(hasPermission).mockReturnValue(true);
    expect(canGenerateProjectFieldDailyReport("INSTALL_MANAGER", "im-1", null)).toBe(true);
  });

  it("denies install manager when another IM is assigned", () => {
    vi.mocked(hasPermission).mockReturnValue(true);
    expect(canGenerateProjectFieldDailyReport("INSTALL_MANAGER", "im-1", "im-2")).toBe(false);
  });
});

describe("todayReportDateInOrgTz", () => {
  it("returns YYYY-MM-DD format", () => {
    const d = todayReportDateInOrgTz(new Date("2026-07-10T06:00:00.000Z"));
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("clampReportDateToToday", () => {
  it("returns today when date is in the future", () => {
    const now = new Date("2026-07-10T18:00:00.000Z");
    expect(clampReportDateToToday("2026-07-11", now)).toBe(todayReportDateInOrgTz(now));
  });

  it("keeps past and today dates unchanged", () => {
    const now = new Date("2026-07-10T18:00:00.000Z");
    expect(clampReportDateToToday("2026-07-09", now)).toBe("2026-07-09");
    expect(clampReportDateToToday(todayReportDateInOrgTz(now), now)).toBe(
      todayReportDateInOrgTz(now),
    );
  });
});

describe("formatFieldDailyReportDateLabel", () => {
  it("formats YYYY-MM-DD as month, day, year in en-US", () => {
    expect(formatFieldDailyReportDateLabel("2026-07-16", "en-US")).toBe("Jul 16, 2026");
  });

  it("formats YYYY-MM-DD for Spanish locale", () => {
    const label = formatFieldDailyReportDateLabel("2026-07-16", "es");
    expect(label).toMatch(/16/);
    expect(label).toMatch(/2026/);
  });
});
