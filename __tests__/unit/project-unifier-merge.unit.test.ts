import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enrichProjectListResilient,
  getProjectDisplayNameForMetadata,
  mergeProjectWithShell,
  resolveShellUnifierPid,
} from "@/lib/project-unifier-merge";
import { db } from "@/lib/db";

vi.mock("@/lib/unifier/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/unifier/service")>();
  return {
    ...actual,
    getProjects: vi.fn(),
    getSysProjectStartDateByPidMap: vi.fn(),
    getProjectTeams: vi.fn(),
    getProjectByPid: vi.fn(),
  };
});
vi.mock("@/lib/db", () => ({
  db: {
    project: {
      findFirst: vi.fn(),
    },
  },
}));
import type { UnifierProject } from "@/lib/unifier/types";

const row = {
  id: "proj-1",
  unifierPid: "PID-9",
  installManagerId: null,
  installManagerName: "Local IM",
  projectManagerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  isTestProject: false,
};

const shell: UnifierProject = {
  pid: "PID-9",
  projectNumber: "CP-1",
  projectName: "Tower A",
  status: "Construction",
  shellStatus: "Active",
  location: "100 Main St",
  address: "100 Main St",
  state: "TX",
  clientName: "ACME",
  projectType: "Commercial",
  projectPhase: "Construction",
  stage: null,
  estimatingStage: null,
  projectManagerName: "Pat Lee",
  estimatorName: null,
  fieldDueDate: "2026-06-15T00:00:00.000Z",
  sageProjectId: null,
  rfmsProjectId: null,
  projectTrack: null,
};

describe("mergeProjectWithShell()", () => {
  it("maps shell fields to API Project and uses the Unifier team install manager", () => {
    const p = mergeProjectWithShell(row, shell, undefined, "Irene Installer");
    expect(p.projectName).toBe("Tower A");
    expect(p.siteLocation).toBe("100 Main St, TX");
    expect(p.status).toBe("Construction");
    expect(p.lifecycleStatus).toBe("Active");
    expect(p.unifierProjectNumber).toBe("CP-1");
    expect(p.projectManagerName).toBe("Pat Lee");
    expect(p.startDate).toBe("2026-06-15");
    expect(p.installManagerName).toBe("Irene Installer");
    expect(p.isTestProject).toBe(false);
  });

  it("keeps the local install manager when no Unifier team override is provided", () => {
    const p = mergeProjectWithShell(row, shell);
    expect(p.installManagerName).toBe("Local IM");
  });

  it("uses null when the Unifier team install manager is explicitly missing", () => {
    const p = mergeProjectWithShell(row, shell, undefined, null);
    expect(p.installManagerName).toBeNull();
  });

  it("does not duplicate state when address line already ends with it", () => {
    const p = mergeProjectWithShell(row, {
      ...shell,
      location: "100 Main St, TX",
      address: "100 Main St, TX",
      state: "TX",
    });
    expect(p.siteLocation).toBe("100 Main St, TX");
  });

  it("prefers UNIFIER_SYS_PROJECT_INFO STARTDATE over shell field due date", () => {
    const p = mergeProjectWithShell(row, shell, "2024-03-01");
    expect(p.startDate).toBe("2024-03-01");
  });

  it("falls back to shell field due date when sys start date is missing", () => {
    const p = mergeProjectWithShell(row, shell, null);
    expect(p.startDate).toBe("2026-06-15");
  });

  it("uses fallbacks when shell is missing (non-test project → Unnamed project)", () => {
    const p = mergeProjectWithShell(row, null);
    expect(p.projectName).toBe("Unnamed project");
    expect(p.siteLocation).toBe("");
    expect(p.status).toBe("");
    expect(p.lifecycleStatus).toBe("Planning");
    expect(p.unifierProjectNumber).toBeNull();
    expect(p.projectManagerName).toBe("");
    expect(p.startDate).toBeNull();
  });

  it("uses 'Unnamed Test Project' fallback name when shell is missing and isTestProject=true", () => {
    const testRow = { ...row, isTestProject: true };
    const p = mergeProjectWithShell(testRow, null);
    expect(p.projectName).toBe("Unnamed Test Project");
  });

  it("appends (TEST) to the real Unifier name when isTestProject=true and a shell is present", () => {
    const testRow = { ...row, isTestProject: true };
    const p = mergeProjectWithShell(testRow, shell);
    expect(p.projectName).toBe("Tower A (TEST)");
  });

  it("uses sys start date when shell is missing", () => {
    const p = mergeProjectWithShell(row, null, "2025-11-01");
    expect(p.startDate).toBe("2025-11-01");
  });

  it("uses sourceUnifierPid for shell merge on test clones and appends (TEST) suffix", () => {
    const cloneRow = {
      ...row,
      isTestProject: true,
      unifierPid: "__TEST_CLONE_proj-clone__",
      sourceUnifierPid: "PID-9",
    };
    const p = mergeProjectWithShell(cloneRow, shell);
    expect(p.projectName).toBe("Tower A (TEST)");
    expect(p.unifierProjectNumber).toBe("CP-1");
    expect(p.unifierPid).toBe("PID-9");
  });

  it("does not double-append (TEST) when shell name already ends with suffix", () => {
    const cloneRow = {
      ...row,
      isTestProject: true,
      sourceUnifierPid: "PID-9",
    };
    const p = mergeProjectWithShell(cloneRow, { ...shell, projectName: "Tower A (TEST)" });
    expect(p.projectName).toBe("Tower A (TEST)");
  });
});

describe("enrichProjectListResilient()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns DB-only projects when Unifier getProjects throws (prod SSR must not crash)", async () => {
    const { getProjects, getSysProjectStartDateByPidMap, getProjectTeams } =
      await import("@/lib/unifier/service");
    vi.mocked(getProjects).mockRejectedValueOnce(new Error("circuit breaker open"));
    vi.mocked(getSysProjectStartDateByPidMap).mockResolvedValue(new Map());
    vi.mocked(getProjectTeams).mockResolvedValue([]);

    const row = {
      id: "proj-db-1",
      unifierPid: "PID-42",
      installManagerId: null,
      installManagerName: "Local IM",
      projectManagerId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      isTestProject: false,
      scopeTypes: ["Tile"],
    };

    const result = await enrichProjectListResilient([row]);
    expect(result.unifierAvailable).toBe(false);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].id).toBe("proj-db-1");
    expect(result.projects[0].projectName).toBe("Unnamed project");
    expect(result.projects[0].scopeTypes).toEqual(["Tile"]);
    expect(result.projects[0].installManagerName).toBe("Local IM");
  });
});

describe("getProjectDisplayNameForMetadata()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the database lookup fails instead of throwing", async () => {
    vi.mocked(db.project.findFirst).mockRejectedValueOnce(
      new Error("(EAUTHTIMEOUT) timeout while waiting for message"),
    );

    await expect(getProjectDisplayNameForMetadata("proj-1")).resolves.toBeNull();
  });
});

describe("resolveShellUnifierPid()", () => {
  it("returns sourceUnifierPid for nested test clones instead of synthetic PID", () => {
    expect(
      resolveShellUnifierPid({
        isTestProject: true,
        unifierPid: "__TEST_CLONE_child__",
        sourceUnifierPid: "PID-REAL",
      })
    ).toBe("PID-REAL");
  });

  it("returns unifierPid for non-test projects", () => {
    expect(
      resolveShellUnifierPid({
        isTestProject: false,
        unifierPid: "PID-REAL",
        sourceUnifierPid: null,
      })
    ).toBe("PID-REAL");
  });
});
