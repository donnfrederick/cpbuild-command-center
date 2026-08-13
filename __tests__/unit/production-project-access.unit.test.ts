import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as prodDep from "@/lib/production-deployment";
import {
  checkProductionProjectCreateAllowed,
  checkProductionProjectMutationAllowed,
  checkProductionFieldNotesMutationAllowed,
  checkProductionTestProjectFlagPatchAllowed,
  checkProjectVisibleInApi,
  enforceProjectReadVisibility,
  filterProjectIdsHiddenFromRole,
  isDesignerOrDeveloperRole,
  isTestProjectSquadRole,
  masqueradeTargetCanEditProductionProjectData,
  normalizeRoleCode,
} from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";

vi.mock("@/lib/db", () => ({
  db: {
    project: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

describe("isTestProjectSquadRole()", () => {
  it("returns true for ADMIN, DEVELOPER, DESIGNER, and SUPER_ADMIN alias", () => {
    expect(isTestProjectSquadRole("ADMIN")).toBe(true);
    expect(isTestProjectSquadRole("DEVELOPER")).toBe(true);
    expect(isTestProjectSquadRole("DESIGNER")).toBe(true);
    expect(isTestProjectSquadRole("SUPER_ADMIN")).toBe(true);
  });

  it("returns false for operational roles", () => {
    expect(isTestProjectSquadRole("INSTALL_MANAGER")).toBe(false);
    expect(isTestProjectSquadRole("MEMBER")).toBe(false);
  });
});

describe("isDesignerOrDeveloperRole()", () => {
  it("identifies DESIGNER and DEVELOPER", () => {
    expect(isDesignerOrDeveloperRole("DESIGNER")).toBe(true);
    expect(isDesignerOrDeveloperRole("DEVELOPER")).toBe(true);
    expect(isDesignerOrDeveloperRole("ADMIN")).toBe(false);
  });
});

describe("masqueradeTargetCanEditProductionProjectData()", () => {
  it("returns false for Designer/Developer targets", () => {
    expect(masqueradeTargetCanEditProductionProjectData("DESIGNER")).toBe(false);
    expect(masqueradeTargetCanEditProductionProjectData("DEVELOPER")).toBe(false);
  });

  it("returns true for Install Manager", () => {
    expect(masqueradeTargetCanEditProductionProjectData("INSTALL_MANAGER")).toBe(true);
  });
});

describe("checkProjectVisibleInApi()", () => {
  it("hides test projects from non-squad viewers", () => {
    const r = checkProjectVisibleInApi({ deletedAt: null, isTestProject: true }, "MEMBER");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.status).toBe(404);
  });

  it("shows test projects to squad", () => {
    expect(checkProjectVisibleInApi({ deletedAt: null, isTestProject: true }, "DEVELOPER").allowed).toBe(true);
  });
});

describe("checkProductionProjectMutationAllowed() in strict production", () => {
  beforeEach(() => {
    vi.spyOn(prodDep, "isStrictProductionDeployment").mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows squad to mutate test projects", () => {
    const r = checkProductionProjectMutationAllowed({ isTestProject: true }, "DESIGNER", null);
    expect(r.allowed).toBe(true);
  });

  it("blocks Designer on non-test projects", () => {
    const r = checkProductionProjectMutationAllowed({ isTestProject: false }, "DESIGNER", null);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.status).toBe(403);
  });

  it("allows Admin without masquerade on non-test projects (FT-0052)", () => {
    const r = checkProductionProjectMutationAllowed({ isTestProject: false }, "ADMIN", null);
    expect(r.allowed).toBe(true);
  });

  it("allows Admin with masquerade as Install Manager", () => {
    const r = checkProductionProjectMutationAllowed(
      { isTestProject: false },
      "ADMIN",
      {
        actorId: "a",
        actorEmail: "a@x.com",
        actorName: null,
        actorRole: "ADMIN",
        targetUserId: "t",
        targetUserName: null,
        targetUserEmail: "t@x.com",
        targetUserRole: "INSTALL_MANAGER",
        logId: "log",
      }
    );
    expect(r.allowed).toBe(true);
  });

  it("blocks Admin masquerading as Developer", () => {
    const r = checkProductionProjectMutationAllowed(
      { isTestProject: false },
      "ADMIN",
      {
        actorId: "a",
        actorEmail: "a@x.com",
        actorName: null,
        actorRole: "ADMIN",
        targetUserId: "t",
        targetUserName: null,
        targetUserEmail: "t@x.com",
        targetUserRole: "DEVELOPER",
        logId: "log",
      }
    );
    expect(r.allowed).toBe(false);
  });

  it("blocks Admin masquerading as Designer", () => {
    const r = checkProductionProjectMutationAllowed(
      { isTestProject: false },
      "ADMIN",
      {
        actorId: "a",
        actorEmail: "a@x.com",
        actorName: null,
        actorRole: "ADMIN",
        targetUserId: "t",
        targetUserName: null,
        targetUserEmail: "t@x.com",
        targetUserRole: "DESIGNER",
        logId: "log",
      }
    );
    expect(r.allowed).toBe(false);
  });

  it("allows Install Manager without masquerade on non-test projects", () => {
    const r = checkProductionProjectMutationAllowed({ isTestProject: false }, "INSTALL_MANAGER", null);
    expect(r.allowed).toBe(true);
  });
});

describe("checkProductionFieldNotesMutationAllowed() in strict production", () => {
  beforeEach(() => {
    vi.spyOn(prodDep, "isStrictProductionDeployment").mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows Admin without masquerade on non-test projects", () => {
    const r = checkProductionFieldNotesMutationAllowed({ isTestProject: false }, "ADMIN", null);
    expect(r.allowed).toBe(true);
  });

  it("blocks Admin masquerading as Developer on non-test projects", () => {
    const r = checkProductionFieldNotesMutationAllowed(
      { isTestProject: false },
      "ADMIN",
      {
        actorId: "a",
        actorEmail: "a@x.com",
        actorName: null,
        actorRole: "ADMIN",
        targetUserId: "t",
        targetUserName: null,
        targetUserEmail: "t@x.com",
        targetUserRole: "DEVELOPER",
        logId: "log",
      },
    );
    expect(r.allowed).toBe(false);
  });

  it("allows Install Manager on non-test projects", () => {
    const r = checkProductionFieldNotesMutationAllowed({ isTestProject: false }, "INSTALL_MANAGER", null);
    expect(r.allowed).toBe(true);
  });

  it("blocks Designer on non-test projects", () => {
    const r = checkProductionFieldNotesMutationAllowed({ isTestProject: false }, "DESIGNER", null);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.status).toBe(403);
  });

  it("allows squad on test projects", () => {
    expect(checkProductionFieldNotesMutationAllowed({ isTestProject: true }, "ADMIN", null).allowed).toBe(true);
  });

  it("hides test projects from non-squad roles", () => {
    const r = checkProductionFieldNotesMutationAllowed({ isTestProject: true }, "INSTALL_MANAGER", null);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.status).toBe(404);
  });
});

describe("checkProductionProjectCreateAllowed() in strict production", () => {
  beforeEach(() => {
    vi.spyOn(prodDep, "isStrictProductionDeployment").mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires Developer to create test-only projects", () => {
    expect(checkProductionProjectCreateAllowed("DEVELOPER", false).allowed).toBe(false);
    expect(checkProductionProjectCreateAllowed("DEVELOPER", true).allowed).toBe(true);
  });

  it("allows Admin to create normal projects", () => {
    expect(checkProductionProjectCreateAllowed("ADMIN", undefined).allowed).toBe(true);
  });
});

describe("normalizeRoleCode()", () => {
  it("maps SUPER_ADMIN to ADMIN", () => {
    expect(normalizeRoleCode("SUPER_ADMIN")).toBe("ADMIN");
  });

  it("passes other codes through unchanged", () => {
    expect(normalizeRoleCode("ADMIN")).toBe("ADMIN");
    expect(normalizeRoleCode("INSTALL_MANAGER")).toBe("INSTALL_MANAGER");
    expect(normalizeRoleCode("MEMBER")).toBe("MEMBER");
  });
});

describe("checkProductionTestProjectFlagPatchAllowed() in strict production", () => {
  beforeEach(() => {
    vi.spyOn(prodDep, "isStrictProductionDeployment").mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows any role when not changing the flag", () => {
    const r = checkProductionTestProjectFlagPatchAllowed("MEMBER", false);
    expect(r.allowed).toBe(true);
  });

  it("blocks non-squad roles from toggling the test flag", () => {
    const r = checkProductionTestProjectFlagPatchAllowed("MEMBER", true);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.status).toBe(403);
  });

  it("allows ADMIN to toggle the test flag", () => {
    const r = checkProductionTestProjectFlagPatchAllowed("ADMIN", true);
    expect(r.allowed).toBe(true);
  });

  it("allows DEVELOPER to toggle the test flag", () => {
    const r = checkProductionTestProjectFlagPatchAllowed("DEVELOPER", true);
    expect(r.allowed).toBe(true);
  });
});

describe("filterProjectIdsHiddenFromRole()", () => {
  beforeEach(() => {
    vi.mocked(db.project.findMany).mockReset();
  });

  it("returns empty array when given no IDs", async () => {
    const result = await filterProjectIdsHiddenFromRole([], "MEMBER");
    expect(result).toEqual([]);
    expect(vi.mocked(db.project.findMany)).not.toHaveBeenCalled();
  });

  it("returns all IDs for squad roles without a DB query", async () => {
    const result = await filterProjectIdsHiddenFromRole(["p1", "p2"], "ADMIN");
    expect(result).toEqual(["p1", "p2"]);
    expect(vi.mocked(db.project.findMany)).not.toHaveBeenCalled();
  });

  it("strips test project IDs from non-squad roles", async () => {
    vi.mocked(db.project.findMany).mockResolvedValueOnce([
      { id: "test-p1" },
    ] as never);
    const result = await filterProjectIdsHiddenFromRole(["p1", "test-p1", "p2"], "MEMBER");
    expect(result).toEqual(["p1", "p2"]);
  });

  it("returns all IDs when none are test projects", async () => {
    vi.mocked(db.project.findMany).mockResolvedValueOnce([] as never);
    const result = await filterProjectIdsHiddenFromRole(["p1", "p2"], "INSTALL_MANAGER");
    expect(result).toEqual(["p1", "p2"]);
  });
});

describe("enforceProjectReadVisibility()", () => {
  beforeEach(() => {
    vi.mocked(db.project.findFirst).mockReset();
    vi.mocked(getEffectiveSession).mockReset();
  });

  it("returns 404 when project does not exist in DB", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValueOnce(null);
    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null);

    const res = await enforceProjectReadVisibility("proj-1", { user: { role: "ADMIN" } });
    expect(res?.status).toBe(404);
  });

  it("returns 404 when project is soft-deleted", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValueOnce({
      id: "p1",
      deletedAt: new Date(),
      isTestProject: false,
    } as never);
    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null);

    const res = await enforceProjectReadVisibility("p1", { user: { role: "ADMIN" } });
    expect(res?.status).toBe(404);
  });

  it("returns null when a normal project is visible to the viewer", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValueOnce({
      id: "p1",
      deletedAt: null,
      isTestProject: false,
    } as never);
    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "u1", role: "MEMBER", email: "m@x.com", name: null },
      masquerade: null,
      rolePreview: null,
    } as never);

    const res = await enforceProjectReadVisibility("p1", { user: { role: "MEMBER" } });
    expect(res).toBeNull();
  });

  it("returns null when squad role views a test project", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValueOnce({
      id: "test-p1",
      deletedAt: null,
      isTestProject: true,
    } as never);
    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN", email: "a@x.com", name: null },
      masquerade: null,
      rolePreview: null,
    } as never);

    const res = await enforceProjectReadVisibility("test-p1", { user: { role: "ADMIN" } });
    expect(res).toBeNull();
  });

  it("returns 404 when non-squad role requests a test project", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValueOnce({
      id: "test-p1",
      deletedAt: null,
      isTestProject: true,
    } as never);
    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "u1", role: "INSTALL_MANAGER", email: "im@x.com", name: null },
      masquerade: null,
      rolePreview: null,
    } as never);

    const res = await enforceProjectReadVisibility("test-p1", { user: { role: "INSTALL_MANAGER" } });
    expect(res?.status).toBe(404);
  });

  it("uses the effective (previewed) role — ADMIN previewing as INSTALL_MANAGER is blocked from test project", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValueOnce({
      id: "test-p1",
      deletedAt: null,
      isTestProject: true,
    } as never);
    // Effective session reflects the previewed role, not the real ADMIN role.
    vi.mocked(getEffectiveSession).mockResolvedValueOnce({
      user: { id: "u1", role: "INSTALL_MANAGER", email: "a@x.com", name: null },
      masquerade: null,
      rolePreview: { realRole: "ADMIN", previewRole: "INSTALL_MANAGER" },
    } as never);

    // session.user.role is still ADMIN (real JWT), but effective role is INSTALL_MANAGER
    const res = await enforceProjectReadVisibility("test-p1", { user: { role: "ADMIN" } });
    expect(res?.status).toBe(404);
  });

  it("falls back to session role when getEffectiveSession returns null (ADMIN still passes)", async () => {
    vi.mocked(db.project.findFirst).mockResolvedValueOnce({
      id: "test-p1",
      deletedAt: null,
      isTestProject: true,
    } as never);
    // Simulate no request context (cookie read failed → getEffectiveSession returns null)
    vi.mocked(getEffectiveSession).mockResolvedValueOnce(null);

    const res = await enforceProjectReadVisibility("test-p1", { user: { role: "ADMIN" } });
    expect(res).toBeNull(); // ADMIN fallback → can see test projects
  });
});
