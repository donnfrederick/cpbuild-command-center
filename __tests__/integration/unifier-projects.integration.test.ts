import { describe, it, expect, vi, beforeEach } from "vitest";
import { CC_UNIFIER_LINKED_COUNT_HEADER } from "@/lib/unifier/projects-list-header";

/**
 * Integration tests for /api/unifier/projects and POST /api/projects.
 * DB and Unifier service are fully mocked.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const project = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: {
      project,
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          project,
          $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
        };
        return callback(tx);
      }),
    },
  };
});

vi.mock("@/lib/unifier/service", () => ({
  getProjects: vi.fn(),
  getProjectByPid: vi.fn(),
}));

vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectById: vi.fn(),
  enrichProjectList: vi.fn(),
  getProjectDisplayNameForMetadata: vi.fn(),
  mergeProjectWithShell: vi.fn(),
  buildShellIndex: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(role = "ADMIN") {
  return { user: { id: "user-1", email: "admin@test.com", name: "Admin", role } };
}

function makeUnifierProject(overrides = {}) {
  return {
    pid: "99",
    projectNumber: "CP-2024-001",
    projectName: "Test Project",
    status: "Construction",
    shellStatus: "Active",
    location: "Austin, TX",
    address: "Austin, TX",
    state: "TX",
    clientName: "ACME Corp",
    projectType: "Commercial",
    projectPhase: "Construction",
    stage: null,
    estimatingStage: null,
    projectManagerName: "Jane Smith",
    estimatorName: null,
    fieldDueDate: null,
    sageProjectId: null,
    rfmsProjectId: null,
    projectTrack: null,
    ...overrides,
  };
}

// ─── GET /api/unifier/projects ────────────────────────────────────────────────

describe("GET /api/unifier/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/unifier/projects/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns available (non-linked) Unifier projects", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { getProjects } = await import("@/lib/unifier/service");

    vi.mocked(auth).mockResolvedValue(makeSession() as never);
    vi.mocked(getProjects).mockResolvedValueOnce([
      makeUnifierProject({ pid: "1" }),
      makeUnifierProject({ pid: "2" }),
      makeUnifierProject({ pid: "3" }),
    ]);
    // Project with pid "2" is already linked
    vi.mocked(db.project.findMany).mockResolvedValueOnce([
      { unifierPid: "2" } as never,
    ]);

    const { GET } = await import("@/app/api/unifier/projects/route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json() as Array<{ pid: string }>;
    const pids = body.map((p) => p.pid);
    expect(pids).toContain("1");
    expect(pids).toContain("3");
    expect(pids).not.toContain("2");
    expect(res.headers.get(CC_UNIFIER_LINKED_COUNT_HEADER)).toBe("1");
  });

  it("returns 502 when Unifier service throws", async () => {
    const { auth } = await import("@/lib/auth");
    const { getProjects } = await import("@/lib/unifier/service");

    vi.mocked(auth).mockResolvedValue(makeSession() as never);
    vi.mocked(getProjects).mockRejectedValueOnce(new Error("Network error"));

    const { GET } = await import("@/app/api/unifier/projects/route");
    const res = await GET();
    expect(res.status).toBe(502);
  });
});

// ─── POST /api/projects ───────────────────────────────────────────────────────

describe("POST /api/projects with unifierPid", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");
    const { getProjectByPid } = await import("@/lib/unifier/service");
    vi.mocked(getProjectByPid).mockResolvedValue(makeUnifierProject() as never);
    vi.mocked(enrichProjectById).mockImplementation(async (id: string) => ({
      id,
      projectName: "Test Project",
      siteLocation: "Austin, TX",
      status: "Construction",
      lifecycleStatus: "Active" as const,
      startDate: null,
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      projectManagerName: "Jane Smith",
      unifierPid: "99",
      unifierProjectNumber: "CP-2024-001",
    }));
  });

  it("returns 403 for MEMBER role", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(makeSession("MEMBER") as never);

    const { POST } = await import("@/app/api/projects/route");
    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ unifierPid: "1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 422 when unifierPid is missing", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(makeSession() as never);

    const { POST } = await import("@/app/api/projects/route");
    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 409 when unifierPid is already linked", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValue(makeSession() as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "existing", deletedAt: null } as never);

    const { POST } = await import("@/app/api/projects/route");
    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ unifierPid: "99" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("creates and returns a project when valid", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValue(makeSession() as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce(null);
    vi.mocked(db.project.create).mockResolvedValueOnce({
      id: "new-id",
      installManagerId: null,
      installManagerName: null,
      projectManagerId: null,
      unifierPid: "99",
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { POST } = await import("@/app/api/projects/route");
    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ unifierPid: "99" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json() as { unifierPid: string; unifierProjectNumber: string };
    expect(body.unifierPid).toBe("99");
    expect(body.unifierProjectNumber).toBe("CP-2024-001");
  });
});
