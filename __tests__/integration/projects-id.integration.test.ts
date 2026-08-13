import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

// getEffectiveSession is called inside enforceProjectReadVisibility.
// Default: unconfigured mock returns undefined, so effective?.user.role is
// undefined and the guard falls back to session.user.role (real role).
// Role-preview tests configure this explicitly.
vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));

vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectById: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    project: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const makeApiProject = (overrides = {}) => ({
  id: "p1",
  projectName: "Test Project",
  siteLocation: "Austin",
  status: "Construction",
  lifecycleStatus: "Active" as const,
  startDate: null,
  installManagerId: null,
  installManagerName: null,
  projectManagerId: null,
  projectManagerName: "PM",
  unifierPid: "1",
  unifierProjectNumber: "CP-001",
  ...overrides,
});

const makeDbProject = (overrides = {}) => ({
  id: "p1",
  unifierPid: "1",
  installManagerId: null,
  installManagerName: null,
  projectManagerId: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/projects/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(new Request("http://localhost"), params("p1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when project not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");

    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(enrichProjectById).mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(new Request("http://localhost"), params("nonexistent"));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("Not found");
  });

  it("returns 404 when project is soft-deleted", async () => {
    const { auth } = await import("@/lib/auth");
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");

    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(enrichProjectById).mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(new Request("http://localhost"), params("p1"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with project when found", async () => {
    const { auth } = await import("@/lib/auth");
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");

    const project = makeApiProject();
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(enrichProjectById).mockResolvedValueOnce(project);

    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(new Request("http://localhost"), params("p1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.id).toBe("p1");
    expect(body.projectName).toBe("Test Project");
    expect(body.status).toBe("Construction");
    expect(body.lifecycleStatus).toBe("Active");
  });

  it("returns 404 when ADMIN is role-previewing as a non-squad role on a test project", async () => {
    const { auth } = await import("@/lib/auth");
    const { getEffectiveSession } = await import("@/lib/masquerade");
    const { db } = await import("@/lib/db");

    // Real session is ADMIN, but effective (previewed) role is INSTALL_MANAGER.
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u1", role: "INSTALL_MANAGER", email: "a@x.com", name: null, specialPermissions: [] },
      masquerade: null,
      rolePreview: { realRole: "ADMIN", previewRole: "INSTALL_MANAGER" },
    } as never);
    vi.mocked(db.project.findFirst).mockResolvedValue({
      id: "test-p1",
      deletedAt: null,
      isTestProject: true,
    } as never);

    const { GET } = await import("@/app/api/projects/[id]/route");
    const res = await GET(new Request("http://localhost"), params("test-p1"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/projects/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null as never);

    const { PATCH } = await import("@/app/api/projects/[id]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ installManagerName: "Updated IM" }),
        headers: { "Content-Type": "application/json" },
      }),
      params("p1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_PROJECTS", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ installManagerName: "Updated IM" }),
        headers: { "Content-Type": "application/json" },
      }),
      params("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 400 on invalid JSON", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      }),
      params("p1")
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid JSON");
  });

  it("returns 422 when validation fails", async () => {
    const { auth } = await import("@/lib/auth");

    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ installManagerName: "x".repeat(101) }),
        headers: { "Content-Type": "application/json" },
      }),
      params("p1")
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when project not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/projects/[id]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ installManagerName: "Updated IM" }),
        headers: { "Content-Type": "application/json" },
      }),
      params("nonexistent")
    );
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("Not found");
  });

  it("returns 200 with updated project when valid", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { enrichProjectById } = await import("@/lib/project-unifier-merge");

    const existing = makeDbProject();
    const updatedPayload = makeApiProject({ installManagerName: "Updated IM" });
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValue(existing as never);
    vi.mocked(db.project.update).mockResolvedValue(existing as never);
    vi.mocked(enrichProjectById).mockResolvedValueOnce(updatedPayload);

    const { PATCH } = await import("@/app/api/projects/[id]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ installManagerName: "Updated IM" }),
        headers: { "Content-Type": "application/json" },
      }),
      params("p1")
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.installManagerName).toBe("Updated IM");
    expect(body.projectName).toBe("Test Project");
  });
});

describe("DELETE /api/projects/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null as never);

    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(new Request("http://localhost"), params("p1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_PROJECTS", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);

    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(new Request("http://localhost"), params("p1"));
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 404 when project not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(new Request("http://localhost"), params("nonexistent"));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not found");
  });

  it("returns 204 when project soft-deleted", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    const project = makeDbProject();
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValue(project as never);
    vi.mocked(db.project.update).mockResolvedValue({ ...project, deletedAt: new Date() } as never);

    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(new Request("http://localhost"), params("p1"));
    expect(res.status).toBe(204);
  });

  it("returns 403 when non-admin tries to delete a test project", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValue(
      makeDbProject({ isTestProject: true }) as never
    );

    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(new Request("http://localhost"), params("p1"));
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toContain("Admin");
  });
});
