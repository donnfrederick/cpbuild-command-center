import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectList: vi.fn(),
  enrichProjectListResilient: vi.fn(),
  enrichProjectById: vi.fn(),
  getProjectDisplayNameForMetadata: vi.fn(),
  mergeProjectWithShell: vi.fn(),
  buildShellIndex: vi.fn(),
}));

vi.mock("@/lib/session-db-user", () => ({
  resolveSessionToDbUserId: vi.fn(),
}));

vi.mock("@/lib/unifier/service", () => ({
  getProjectByPid: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const createdProject = {
    id: "new-p1",
    installManagerId: null,
    installManagerName: null,
    projectManagerId: null,
    unifierPid: "uni-1",
    deletedAt: null,
    isTestProject: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    db: {
      project: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        // Route calls db.project.create() / update() directly (no interactive tx).
        create: vi.fn().mockResolvedValue(createdProject),
        update: vi.fn().mockResolvedValue(createdProject),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      // GET /api/projects fetches scope types for badge display
      projectRow: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      userProjectFavorite: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      // insertProjectRows uses db.$queryRawUnsafe and db.$executeRawUnsafe
      // directly (no tx wrapper) since interactive transactions are banned.
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: "lookup-id" }]),
      // Array-form $transaction still used by other routes (invites/accept).
      $transaction: vi.fn(),
    },
  };
});

describe("GET /api/projects", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { resolveSessionToDbUserId } = await import("@/lib/session-db-user");
    vi.mocked(resolveSessionToDbUserId).mockResolvedValue("u1");
    const { enrichProjectList, enrichProjectListResilient } = await import("@/lib/project-unifier-merge");
    vi.mocked(enrichProjectList).mockImplementation(async (rows) =>
      rows.map((r) => ({
        id: r.id,
        projectName: r.unifierPid === "1" ? "Test" : `Project-${r.unifierPid ?? "none"}`,
        siteLocation: "Austin",
        status: r.unifierPid === "1" ? "Construction" : "",
        lifecycleStatus: "Active" as const,
        startDate: null,
        installManagerId: r.installManagerId ?? null,
        installManagerName: r.installManagerName ?? null,
        projectManagerId: r.projectManagerId ?? null,
        projectManagerName: "PM",
        unifierPid: r.unifierPid,
        unifierProjectNumber: r.unifierPid === "1" ? "CP-001" : null,
        scopeTypes: (r as { scopeTypes?: string[] }).scopeTypes ?? [],
        isTestProject: (r as { isTestProject?: boolean }).isTestProject ?? false,
        clonedFromProjectId: null,
        clonedFromProjectName: null,
        clonedAt: null,
        isFavorite: false,
      }))
    );
    vi.mocked(enrichProjectListResilient).mockImplementation(async (rows) => ({
      projects: await vi.mocked(enrichProjectList)(rows),
      unifierAvailable: true,
    }));
  });

  it("returns x-unifier-available false when Unifier enrichment fails", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", email: "a@b.com", role: "ADMIN" },
    } as never);
    const { enrichProjectListResilient } = await import("@/lib/project-unifier-merge");
    vi.mocked(enrichProjectListResilient).mockResolvedValueOnce({
      projects: [
        {
          id: "p1",
          projectName: "Unnamed project",
          siteLocation: "",
          status: "",
          lifecycleStatus: "Planning",
          startDate: null,
          installManagerId: null,
          installManagerName: null,
          projectManagerId: null,
          projectManagerName: "",
          unifierPid: "99",
          unifierProjectNumber: null,
          scopeTypes: [],
          isTestProject: false,
          clonedFromProjectId: null,
          clonedFromProjectName: null,
          clonedAt: null,
        },
      ],
      unifierAvailable: false,
    });
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findMany).mockResolvedValueOnce([
      { id: "p1", unifierPid: "99", installManagerId: null, installManagerName: null, projectManagerId: null, deletedAt: null, isTestProject: false, createdAt: new Date(), updatedAt: new Date() },
    ] as never);

    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-unifier-available")).toBe("false");
    const body = (await res.json()) as { id: string }[];
    expect(body[0].id).toBe("p1");
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("bypasses auth when DEV_BYPASS_AUTH=true and not production", async () => {
    const origBypass = process.env.DEV_BYPASS_AUTH;
    const origNodeEnv = process.env.NODE_ENV;
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.NODE_ENV = "development";

    vi.resetModules();
    const { db } = await import("@/lib/db");
    const { enrichProjectListResilient } = await import("@/lib/project-unifier-merge");
    vi.mocked(enrichProjectListResilient).mockResolvedValueOnce({
      projects: [],
      unifierAvailable: true,
    });
    vi.mocked(db.project.findMany).mockResolvedValueOnce([] as never);

    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);

    process.env.DEV_BYPASS_AUTH = origBypass;
    process.env.NODE_ENV = origNodeEnv;
  });

  it("returns 200 with projects when authenticated", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        installManagerId: null,
        installManagerName: null,
        projectManagerId: null,
        unifierPid: "1",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        isTestProject: false,
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].projectName).toBe("Test");
    expect(body[0].status).toBe("Construction");
    expect(body[0].lifecycleStatus).toBe("Active");
  });

  it("returns empty array when no projects", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValueOnce([] as never);

    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("filters test projects out of Prisma query for non-squad roles", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "MEMBER" },
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValueOnce([] as never);

    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, isTestProject: false },
      })
    );
  });

  it("returns Unifier phase label and lifecycle from merge layer", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { enrichProjectList } = await import("@/lib/project-unifier-merge");

    vi.mocked(enrichProjectList).mockImplementationOnce(async (rows) =>
      rows.map((r) => ({
        id: r.id,
        projectName: "Test",
        siteLocation: "Austin",
        status: "Design Development",
        lifecycleStatus: "On Hold" as const,
        startDate: "2024-01-15",
        installManagerId: r.installManagerId ?? null,
        installManagerName: r.installManagerName ?? null,
        projectManagerId: r.projectManagerId ?? null,
        projectManagerName: "PM",
        unifierPid: r.unifierPid,
        unifierProjectNumber: null,
        scopeTypes: (r as { scopeTypes?: string[] }).scopeTypes ?? [],
        isTestProject: (r as { isTestProject?: boolean }).isTestProject ?? false,
      }))
    );

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        installManagerId: null,
        installManagerName: null,
        projectManagerId: null,
        unifierPid: "1",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        isTestProject: false,
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    const body = await res.json();
    expect(body[0].status).toBe("Design Development");
    expect(body[0].lifecycleStatus).toBe("On Hold");
    expect(body[0].startDate).toBe("2024-01-15");
  });

  it("returns isFavorite and pins favorites before other projects", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { enrichProjectList } = await import("@/lib/project-unifier-merge");

    vi.mocked(enrichProjectList).mockImplementationOnce(async (rows) =>
      rows.map((r) => ({
        id: r.id,
        projectName: r.id === "p2" ? "Beta" : "Alpha",
        siteLocation: "Austin",
        status: "Construction",
        lifecycleStatus: "Active" as const,
        startDate: null,
        installManagerId: null,
        installManagerName: null,
        projectManagerId: null,
        projectManagerName: "PM",
        unifierPid: r.unifierPid,
        unifierProjectNumber: null,
        scopeTypes: [],
        isTestProject: false,
        clonedFromProjectId: null,
        clonedFromProjectName: null,
        clonedAt: null,
        isFavorite: false,
      }))
    );

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        installManagerId: null,
        installManagerName: null,
        projectManagerId: null,
        unifierPid: "1",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        isTestProject: false,
      },
      {
        id: "p2",
        installManagerId: null,
        installManagerName: null,
        projectManagerId: null,
        unifierPid: "2",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        isTestProject: false,
      },
    ] as never);
    vi.mocked(db.userProjectFavorite.findMany).mockResolvedValueOnce([
      { projectId: "p2" },
    ] as never);

    const { GET } = await import("@/app/api/projects/route");
    const res = await GET();
    const body = await res.json();

    expect(body[0].id).toBe("p2");
    expect(body[0].isFavorite).toBe(true);
    expect(body[1].isFavorite).toBe(false);
  });
});

describe("POST /api/projects", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");
    const { getProjectByPid } = await import("@/lib/unifier/service");
    vi.mocked(getProjectByPid).mockResolvedValue({
      pid: "uni-1",
      projectName: "Shell",
    } as never);
    vi.mocked(enrichProjectById).mockImplementation(async (id: string) => ({
      id,
      projectName: "Enriched Project",
      siteLocation: "Austin",
      status: "Construction",
      lifecycleStatus: "Active" as const,
      startDate: null,
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      projectManagerName: "PM",
      unifierPid: "uni-1",
      unifierProjectNumber: "CP-001",
      scopeTypes: [],
      isTestProject: false,
    }));
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ unifierPid: "uni-1" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_PROJECTS", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "MEMBER" },
    } as never);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ unifierPid: "uni-1" }),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid JSON", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 422 on validation failure", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ unifierPid: "" }),
      })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("accepts empty projectManagerName (Unifier project has no PM assigned)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(db.project.create).mockResolvedValueOnce({
      id: "new-no-pm",
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      unifierPid: "uni-no-pm",
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(enrichProjectById).mockImplementationOnce(async (id) => ({
      id,
      projectName: "No PM Project",
      siteLocation: "Austin",
      status: "Construction",
      lifecycleStatus: "Active" as const,
      startDate: null,
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      projectManagerName: "",
      unifierPid: "uni-no-pm",
      unifierProjectNumber: null,
    }));

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ unifierPid: "uni-no-pm" }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.projectManagerName).toBe("");
  });

  it("accepts omitted projectManagerName (Unifier project has no PM field)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(db.project.create).mockResolvedValueOnce({
      id: "new-omit",
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      unifierPid: "uni-no-pm-omit",
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(enrichProjectById).mockImplementationOnce(async (id) => ({
      id,
      projectName: "Omit PM Project",
      siteLocation: "Austin",
      status: "Construction",
      lifecycleStatus: "Active" as const,
      startDate: null,
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      projectManagerName: "",
      unifierPid: "uni-no-pm-omit",
      unifierProjectNumber: null,
    }));

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ unifierPid: "uni-no-pm-omit" }),
      })
    );
    expect(res.status).toBe(201);
  });

  it("returns 201 when creating project with upmData", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(db.project.create).mockResolvedValueOnce({
      id: "new-upm",
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      unifierPid: "uni-upm",
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          unifierPid: "uni-upm",
          upmData: [
            {
              Building: "A",
              Level: "1",
              Unit: "101",
              Area: "1000",
              "Ship. Phase": "Phase 1",
              "Build Phase": "Build",
              Scheme: "S1",
              "Unit Type": "Type A",
              Description: "Unit desc",
              "Scope Type": "ST1",
              "CSI Prime Code": "CSI1",
              "CSI Detail Code": "CSI2",
              "Location Type": "LT1",
              "Cost Type": "CT1",
              Installer: "Team1",
              QTY: "5",
              UOM: "EA",
              "Unit Rate": "10.5",
              "Budgeted Man Hours": "50",
              "Start Date": "2024-01-15",
              "Finish Date": "45324",
              "Percent Complete": "25",
              "Actual Man Hours": "12",
            },
            {
              Building: "B",
              Unit: "102",
              "Start Date": "0",
            },
          ],
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.unitsCount).toBe(2);
    expect(body.restored).toBe(false);
  });

  it("skips rows without identity fields and keeps valid rows that follow them", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(db.project.create).mockResolvedValueOnce({
      id: "new-skip",
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      unifierPid: "uni-skip-empty",
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          unifierPid: "uni-skip-empty",
          upmData: [
            { Building: "A", Unit: "101" },
            { Building: "B", Unit: "102" },
            {}, // identity-less row — skipped, NOT a stop signal
            { Building: "C", Unit: "103" }, // should be imported
            { Area: "0", "Ship Phase": "0" }, // numeric-only row, no identity — skipped
            {},
          ],
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    // A, B, and C are kept; the two identity-less rows are dropped
    expect(body.unitsCount).toBe(3);
  });

  it("returns 201 when creating new project", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(enrichProjectById).mockImplementationOnce(async (id) => ({
      id,
      projectName: "New Project",
      siteLocation: "Austin",
      status: "Construction",
      lifecycleStatus: "Active" as const,
      startDate: null,
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      projectManagerName: "PM",
      unifierPid: "uni-1",
      unifierProjectNumber: null,
    }));

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ unifierPid: "uni-1" }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.projectName).toBe("New Project");
    expect(body.restored).toBe(false);
  });

  it("returns 200 when restoring soft-deleted project with upmData", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");
    const { getProjectByPid } = await import("@/lib/unifier/service");

    const existingDeleted = {
      id: "old-p1",
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      unifierPid: "uni-restore",
      deletedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(existingDeleted as never);
    vi.mocked(db.project.update).mockResolvedValueOnce({ ...existingDeleted, deletedAt: null } as never);
    vi.mocked(enrichProjectById).mockImplementationOnce(async (id) => ({
      id,
      projectName: "Restored",
      siteLocation: "Austin",
      status: "Construction",
      lifecycleStatus: "Active" as const,
      startDate: null,
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      projectManagerName: "PM",
      unifierPid: "uni-restore",
      unifierProjectNumber: null,
    }));
    vi.mocked(getProjectByPid).mockResolvedValueOnce({
      pid: "uni-restore",
      projectName: "Restored",
    } as never);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          unifierPid: "uni-restore",
          upmData: [{ Building: "B", Unit: "201" }],
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.restored).toBe(true);
    expect(body.unitsCount).toBe(1);
  });

  it("returns 200 when restoring soft-deleted project", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");
    const { getProjectByPid } = await import("@/lib/unifier/service");

    const existingDeleted = {
      id: "old-p1",
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      unifierPid: "uni-1",
      deletedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(existingDeleted as never);
    vi.mocked(db.project.update).mockResolvedValueOnce({ ...existingDeleted, deletedAt: null } as never);
    vi.mocked(enrichProjectById).mockImplementationOnce(async (id) => ({
      id,
      projectName: "Restored",
      siteLocation: "Austin",
      status: "Construction",
      lifecycleStatus: "Active" as const,
      startDate: null,
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      projectManagerName: "PM",
      unifierPid: "uni-1",
      unifierProjectNumber: null,
    }));
    vi.mocked(getProjectByPid).mockResolvedValueOnce({
      pid: "uni-1",
      projectName: "Restored",
    } as never);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ unifierPid: "uni-1" }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.restored).toBe(true);
  });

  it("returns 409 when duplicate active project exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    const existingActive = {
      id: "p1",
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      unifierPid: "uni-1",
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(existingActive as never);

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ unifierPid: "uni-1" }),
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already exists");
  });

  it("returns 500 on database error", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(null as never);
    // Route now calls db.project.create() directly (no $transaction).
    vi.mocked(db.project.create).mockRejectedValueOnce(new Error("DB connection failed"));

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ unifierPid: "uni-1" }),
      })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to create project");
  });
});
