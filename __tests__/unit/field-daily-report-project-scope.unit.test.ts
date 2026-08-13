import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    project: { findMany: vi.fn(), findFirst: vi.fn() },
    activityLog: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectListResilient: vi.fn(async (rows: { id: string }[]) => ({
    projects: rows.map((row) => ({ id: row.id, projectName: `Project ${row.id}` })),
  })),
}));

vi.mock("@/lib/production-project-access", () => ({
  isTestProjectSquadRole: vi.fn(() => false),
  checkProjectVisibleInApi: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/field-daily-report/auth", () => ({
  canUseFieldDailyReport: vi.fn(() => true),
}));

import { db } from "@/lib/db";
import { checkProjectVisibleInApi } from "@/lib/production-project-access";
import { canUseFieldDailyReport } from "@/lib/field-daily-report/auth";
import {
  loadReportProjects,
  loadBackfillProjects,
  userCanAccessProjectFieldDaily,
} from "@/lib/field-daily-report/project-scope";

describe("loadReportProjects", () => {
  beforeEach(() => {
    vi.mocked(db.project.findMany).mockReset();
    vi.mocked(db.activityLog.findMany).mockReset();
  });

  it("scopes INSTALL_MANAGER to installManagerId", async () => {
    vi.mocked(db.project.findMany).mockResolvedValue([{ id: "p1" }] as never);
    const projects = await loadReportProjects("im-1", "INSTALL_MANAGER", "2026-07-10");
    expect(projects).toHaveLength(1);
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ installManagerId: "im-1" }),
      }),
    );
  });

  it("includes projects with field activity today for ADMIN", async () => {
    vi.mocked(db.activityLog.findMany).mockResolvedValue([{ projectId: "active-1" }] as never);
    vi.mocked(db.project.findMany).mockResolvedValue([{ id: "active-1" }] as never);

    const projects = await loadReportProjects("admin-1", "ADMIN", "2026-07-10");

    expect(projects.map((p) => p.id)).toEqual(["active-1"]);
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ id: { in: ["active-1"] } }]),
        }),
      }),
    );
  });
});

describe("loadBackfillProjects", () => {
  beforeEach(() => {
    vi.mocked(db.project.findMany).mockReset();
    vi.mocked(db.activityLog.findMany).mockReset();
  });

  it("returns all active projects for ADMIN without querying activity logs", async () => {
    vi.mocked(db.project.findMany).mockResolvedValue([
      { id: "p1" },
      { id: "p2" },
    ] as never);

    const projects = await loadBackfillProjects("admin-1", "ADMIN");

    expect(projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(db.activityLog.findMany).not.toHaveBeenCalled();
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null, isTestProject: false }),
      }),
    );
  });

  it("scopes INSTALL_MANAGER to assigned active projects", async () => {
    vi.mocked(db.project.findMany).mockResolvedValue([{ id: "p1" }] as never);

    await loadBackfillProjects("im-1", "INSTALL_MANAGER");

    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ installManagerId: "im-1" }),
      }),
    );
  });
});

describe("userCanAccessProjectFieldDaily", () => {
  beforeEach(() => {
    vi.mocked(db.project.findMany).mockReset();
    vi.mocked(db.activityLog.findMany).mockReset();
    vi.mocked(db.project.findFirst).mockReset();
    vi.mocked(canUseFieldDailyReport).mockReturnValue(true);
    vi.mocked(checkProjectVisibleInApi).mockReturnValue({ allowed: true });
  });

  it("allows ADMIN to read hub on a visible project outside today's portfolio scope", async () => {
    vi.mocked(db.activityLog.findMany).mockResolvedValue([] as never);
    vi.mocked(db.project.findMany).mockResolvedValue([] as never);
    vi.mocked(db.project.findFirst).mockResolvedValue({
      id: "legacy-heights",
      deletedAt: null,
      isTestProject: false,
    } as never);

    const allowed = await userCanAccessProjectFieldDaily(
      "admin-1",
      "ADMIN",
      "legacy-heights",
      "2026-07-23",
    );

    expect(allowed).toBe(true);
    expect(checkProjectVisibleInApi).toHaveBeenCalled();
  });

  it("returns false when field daily role is not permitted", async () => {
    vi.mocked(canUseFieldDailyReport).mockReturnValue(false);

    const allowed = await userCanAccessProjectFieldDaily(
      "user-1",
      "MEMBER",
      "legacy-heights",
      "2026-07-23",
    );

    expect(allowed).toBe(false);
    expect(db.project.findMany).not.toHaveBeenCalled();
  });
});
