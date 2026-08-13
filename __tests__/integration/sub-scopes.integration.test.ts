/**
 * Integration tests for the sub-scope API routes.
 *
 * Covers:
 *   POST   /api/projects/[id]/sub-scopes
 *   GET    /api/projects/[id]/sub-scopes
 *   DELETE /api/projects/[id]/sub-scopes/[subScopeId]
 *   PATCH  /api/projects/[id]/sub-scopes/instances/[instanceId]
 *   + regression tests on modified routes:
 *     GET   /api/projects/[id]/units  (now includes subScopeInstances)
 *     PATCH /api/projects/[id]/units/[rowId]  (409 gate when instances exist)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Global mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    project: { findUnique: vi.fn(), findFirst: vi.fn() },
    projectRow: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    projectIssue: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    inspectionSubmission: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    scopeType: { findUnique: vi.fn() },
    projectSubScope: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    projectSubScopeInstance: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    projectScopeOverride: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/sub-scopes", () => ({
  createSubScopesWithInstances: vi.fn(),
  getSubScopesForProject: vi.fn(),
  hasSubScopeInstances: vi.fn(),
  autoCreateInstancesForNewRows: vi.fn(),
  addSubScopeToGroup: vi.fn(),
}));

// project-rows mock needed for the POST /units test
vi.mock("@/lib/project-rows", () => ({
  insertProjectRows: vi.fn().mockResolvedValue(undefined),
  rowKey: (r: Record<string, string>) => {
    const g = (keys: string[]) =>
      keys.reduce((acc, k) => acc || (r[k]?.trim() ?? ""), "").toLowerCase();
    return `${g(["Building"])}|${g(["Level"])}|${g(["Unit"])}`;
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEF_SUB_SCOPE = {
  id: "ss1",
  name: "Kitchen Cabinetry",
  displayOrder: 0,
  unitType: "2BR",
  scopeTypeId: "st1",
  scopeTypeName: "Cabinetry",
  createdAt: new Date(),
  instanceCount: 5,
};

const DEF_INSTANCE = {
  id: "inst1",
  subScopeId: "ss1",
  rowId: "row1",
  subScope: { id: "ss1", name: "Kitchen Cabinetry", displayOrder: 0, unitType: "2BR", scopeTypeId: "st1" },
  qty: null,
  scopeStage: null,
  scopeStatus: null,
  inspectionStatus: null,
};

// ─── POST /api/projects/[id]/sub-scopes ──────────────────────────────────────

describe("POST /api/projects/[id]/sub-scopes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER (lacks MANAGE_PROJECTS)", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when only 1 sub-scope name is provided (minimum is 2)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          unitType: "2BR",
          scopeTypeId: "st1",
          distributionMode: "even",
          subScopes: [{ name: "Kitchen Cabinetry" }],
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when distributionMode is 'manual' but qty is missing from a sub-scope", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          unitType: "2BR",
          scopeTypeId: "st1",
          distributionMode: "manual",
          // Kitchen has qty but Bath is missing it — should fail
          subScopes: [{ name: "Kitchen Cabinetry", qty: 6 }, { name: "Bath Cabinetry" }],
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    // Error should be in the subScopes[1].qty path
    expect(JSON.stringify(body.error)).toMatch(/qty/i);
  });

  it("returns 400 when scopeTypeId does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.scopeType.findUnique).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          unitType: "2BR",
          scopeTypeId: "nonexistent",
          distributionMode: "even",
          subScopes: [{ name: "A" }, { name: "B" }],
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/scope type/i);
  });

  it("returns 400 when no ProjectRows match (unitType + scopeTypeId)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.scopeType.findUnique).mockResolvedValueOnce({ id: "st1", name: "Cabinetry" } as never);
    vi.mocked(db.projectRow.count).mockResolvedValueOnce(0 as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          unitType: "2BR",
          scopeTypeId: "st1",
          distributionMode: "even",
          subScopes: [{ name: "A" }, { name: "B" }],
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no rows found/i);
  });

  it("returns 409 when a sub-scope name already exists for this combination", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.scopeType.findUnique).mockResolvedValueOnce({ id: "st1", name: "Cabinetry" } as never);
    vi.mocked(db.projectRow.count).mockResolvedValueOnce(5 as never);
    vi.mocked(db.projectSubScope.findFirst).mockResolvedValueOnce({ name: "Kitchen Cabinetry" } as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          unitType: "2BR",
          scopeTypeId: "st1",
          distributionMode: "even",
          subScopes: [{ name: "Kitchen Cabinetry" }, { name: "Bath Cabinetry" }],
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(409);
  });

  it("returns 201 with created sub-scopes and instance count — even mode", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { createSubScopesWithInstances } = await import("@/lib/sub-scopes");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.scopeType.findUnique).mockResolvedValueOnce({ id: "st1", name: "Cabinetry" } as never);
    vi.mocked(db.projectRow.count).mockResolvedValueOnce(5 as never);
    vi.mocked(db.projectSubScope.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(createSubScopesWithInstances).mockResolvedValueOnce([
      DEF_SUB_SCOPE,
      { ...DEF_SUB_SCOPE, id: "ss2", name: "Bath Cabinetry", displayOrder: 1 },
    ] as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          unitType: "2BR",
          scopeTypeId: "st1",
          distributionMode: "even",
          subScopes: [
            { name: "Kitchen Cabinetry" },
            { name: "Bath Cabinetry" },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subScopes).toHaveLength(2);
    expect(body.instancesCreated).toBe(5);
    expect(body.rowCount).toBe(5);
  });

  it("returns 201 — manual mode passes qty to createSubScopesWithInstances", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { createSubScopesWithInstances } = await import("@/lib/sub-scopes");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.scopeType.findUnique).mockResolvedValueOnce({ id: "st1", name: "Cabinetry" } as never);
    vi.mocked(db.projectRow.count).mockResolvedValueOnce(5 as never);
    vi.mocked(db.projectSubScope.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(createSubScopesWithInstances).mockResolvedValueOnce([
      { ...DEF_SUB_SCOPE, qty: 6 },
      { ...DEF_SUB_SCOPE, id: "ss2", name: "Bath Cabinetry", displayOrder: 1, qty: 4 },
    ] as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          unitType: "2BR",
          scopeTypeId: "st1",
          distributionMode: "manual",
          subScopes: [
            { name: "Kitchen Cabinetry", qty: 6 },
            { name: "Bath Cabinetry", qty: 4 },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(201);
    // Verify the service was called with distributionMode: "manual" and per-scope qtys
    expect(createSubScopesWithInstances).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        distributionMode: "manual",
        subScopes: expect.arrayContaining([
          expect.objectContaining({ name: "Kitchen Cabinetry", qty: 6 }),
          expect.objectContaining({ name: "Bath Cabinetry", qty: 4 }),
        ]),
      })
    );
  });
});

// ─── GET /api/projects/[id]/sub-scopes ───────────────────────────────────────

describe("GET /api/projects/[id]/sub-scopes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER (lacks VIEW_UPM, MANAGE_PROJECTS, MANAGE_UNIT_STATUS)", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { GET } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 with grouped sub-scopes for INSTALL_MANAGER", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { getSubScopesForProject } = await import("@/lib/sub-scopes");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(getSubScopesForProject).mockResolvedValueOnce([
      {
        unitType: "2BR",
        scopeTypeId: "st1",
        scopeTypeName: "Cabinetry",
        subScopes: [DEF_SUB_SCOPE],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subScopes).toHaveLength(1);
    expect(body.subScopes[0].unitType).toBe("2BR");
  });
});

// ─── DELETE /api/projects/[id]/sub-scopes/[subScopeId] ───────────────────────

describe("DELETE /api/projects/[id]/sub-scopes/[subScopeId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { DELETE } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", subScopeId: "ss1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { DELETE } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", subScopeId: "ss1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when sub-scope does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectSubScope.findUnique).mockResolvedValueOnce(null as never);

    const { DELETE } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", subScopeId: "ss1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when sub-scope belongs to a different project", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectSubScope.findUnique).mockResolvedValueOnce({
      id: "ss1",
      projectId: "p99",
      name: "Kitchen Cabinetry",
    } as never);

    const { DELETE } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", subScopeId: "ss1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful delete", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectSubScope.findUnique).mockResolvedValueOnce({
      id: "ss1",
      projectId: "p1",
      name: "Kitchen Cabinetry",
    } as never);
    vi.mocked(db.projectSubScope.delete).mockResolvedValueOnce({} as never);

    const { DELETE } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", subScopeId: "ss1" }),
    });
    expect(res.status).toBe(204);
  });
});

// ─── PATCH /api/projects/[id]/sub-scopes/instances/[instanceId] ──────────────

describe("PATCH /api/projects/[id]/sub-scopes/instances/[instanceId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/sub-scopes/instances/[instanceId]/route"
    );
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: "p1", instanceId: "inst1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER (lacks MANAGE_UNIT_STATUS)", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/sub-scopes/instances/[instanceId]/route"
    );
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: "p1", instanceId: "inst1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when instance does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectSubScopeInstance.findUnique).mockResolvedValueOnce(null as never);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/sub-scopes/instances/[instanceId]/route"
    );
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scopeStage: "STAGING" }),
      }),
      { params: Promise.resolve({ id: "p1", instanceId: "inst1" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when inspectionStatus is set but stage is not INSTALL+COMPLETE", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectSubScopeInstance.findUnique).mockResolvedValueOnce({
      ...DEF_INSTANCE,
      subScope: { projectId: "p1" },
      scopeStage: "STAGING",
      scopeStatus: "IN_PROGRESS",
    } as never);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/sub-scopes/instances/[instanceId]/route"
    );
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ inspectionStatus: "READY" }),
      }),
      { params: Promise.resolve({ id: "p1", instanceId: "inst1" }) }
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 BLOCKING_ISSUE_OPEN when transitioning to INSTALL+COMPLETE with an open blocking issue (FB-0027)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    // Route loads full instance; install-complete-blocking loads { rowId } only — both must be mocked.
    vi.mocked(db.projectSubScopeInstance.findUnique)
      .mockResolvedValueOnce({
        ...DEF_INSTANCE,
        subScope: { projectId: "p1" },
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
      } as never)
      .mockResolvedValueOnce({ rowId: "row1" } as never);
    vi.mocked(db.projectIssue.count).mockResolvedValueOnce(1);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/sub-scopes/instances/[instanceId]/route"
    );
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
      }),
      { params: Promise.resolve({ id: "p1", instanceId: "inst1" }) }
    );
    expect(res.status).toBe(422);
    const body = await res.json() as { code?: string };
    expect(body.code).toBe("BLOCKING_ISSUE_OPEN");
    expect(db.projectSubScopeInstance.update).not.toHaveBeenCalled();
  });

  it("returns 200 with updated instance on happy path", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectSubScopeInstance.findUnique).mockResolvedValueOnce({
      ...DEF_INSTANCE,
      subScope: { projectId: "p1" },
    } as never);
    vi.mocked(db.projectSubScopeInstance.update).mockResolvedValueOnce({
      ...DEF_INSTANCE,
      scopeStage: "STAGING",
      scopeStatus: "IN_PROGRESS",
    } as never);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/sub-scopes/instances/[instanceId]/route"
    );
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scopeStage: "STAGING", scopeStatus: "IN_PROGRESS" }),
      }),
      { params: Promise.resolve({ id: "p1", instanceId: "inst1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scopeStage).toBe("STAGING");
    expect(body.scopeStatus).toBe("IN_PROGRESS");
  });

  it("accepts PENDING_VERIFICATION and clears stale inspectionStatus", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectSubScopeInstance.findUnique).mockResolvedValueOnce({
      ...DEF_INSTANCE,
      subScope: { projectId: "p1" },
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
      inspectionStatus: "PASSED",
    } as never);
    vi.mocked(db.projectSubScopeInstance.update).mockResolvedValueOnce({
      ...DEF_INSTANCE,
      scopeStage: "INSTALL",
      scopeStatus: "PENDING_VERIFICATION",
      inspectionStatus: null,
    } as never);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/sub-scopes/instances/[instanceId]/route"
    );
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scopeStage: "INSTALL", scopeStatus: "PENDING_VERIFICATION" }),
      }),
      { params: Promise.resolve({ id: "p1", instanceId: "inst1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scopeStatus).toBe("PENDING_VERIFICATION");
    expect(body.inspectionStatus).toBeNull();
    expect(db.projectSubScopeInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scopeStage: "INSTALL",
          scopeStatus: "PENDING_VERIFICATION",
          inspectionStatus: null,
        }),
      })
    );
  });

  it("returns 200 with updated qty when qty is provided", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectSubScopeInstance.findUnique).mockResolvedValueOnce({
      ...DEF_INSTANCE,
      subScope: { projectId: "p1" },
    } as never);
    vi.mocked(db.projectSubScopeInstance.update).mockResolvedValueOnce({
      ...DEF_INSTANCE,
      qty: { toNumber: () => 7.5, valueOf: () => 7.5 },
    } as never);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/sub-scopes/instances/[instanceId]/route"
    );
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ qty: 7.5 }),
      }),
      { params: Promise.resolve({ id: "p1", instanceId: "inst1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.qty).toBe(7.5);
  });

  it("returns 400 when qty is negative", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);

    const { PATCH } = await import(
      "@/app/api/projects/[id]/sub-scopes/instances/[instanceId]/route"
    );
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ qty: -5 }),
      }),
      { params: Promise.resolve({ id: "p1", instanceId: "inst1" }) }
    );
    expect(res.status).toBe(400);
  });
});

// ─── Regression: PATCH /api/projects/[id]/units/[rowId] — sub-scope gate ─────

describe("PATCH /api/projects/[id]/units/[rowId] — sub-scope gate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 409 when row has sub-scope instances and scopeStage is being set", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { hasSubScopeInstances } = await import("@/lib/sub-scopes");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({
      id: "row1",
      projectId: "p1",
      scopeStage: null,
      scopeStatus: null,
      inspectionStatus: null,
    } as never);
    vi.mocked(hasSubScopeInstances).mockResolvedValueOnce(true as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scopeStage: "INSTALL" }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "row1" }) }
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/sub-scopes defined/i);
  });

  it("returns 409 when row has sub-scope instances and scopeStatus is being set", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { hasSubScopeInstances } = await import("@/lib/sub-scopes");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({
      id: "row1",
      projectId: "p1",
      scopeStage: "INSTALL",
      scopeStatus: null,
      inspectionStatus: null,
    } as never);
    vi.mocked(hasSubScopeInstances).mockResolvedValueOnce(true as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scopeStatus: "COMPLETE" }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "row1" }) }
    );
    expect(res.status).toBe(409);
  });

  it("allows non-stage/status updates (e.g. description) even when instances exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "CONTROLS_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({
      id: "row1",
      projectId: "p1",
      scopeStage: null,
      scopeStatus: null,
      inspectionStatus: null,
    } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "row1",
      description: "Updated description",
      scopeType: null,
      locationType: null,
      costType: null,
      installer: null,
      uom: null,
      qty: null,
      unitRate: null,
      budgetedManHours: null,
      startDate: null,
      finishDate: null,
      percentComplete: null,
      actualManHours: null,
      scopeStage: null,
      scopeStatus: null,
      inspectionStatus: null,
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ description: "Updated description" }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "row1" }) }
    );
    // CONTROLS_MANAGER has EDIT_UPM — allowed for non-status fields
    expect(res.status).toBe(200);
  });
});

// ─── Regression: GET /api/projects/[id]/units — includes subScopeInstances ───

describe("GET /api/projects/[id]/units — subScopeInstances in response", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns subScopeInstances array (empty when no sub-scopes defined)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "row1",
        rowIndex: 0,
        building: "A",
        level: "1",
        unit: "101",
        area: "",
        shipPhase: "",
        buildPhase: "",
        scheme: "",
        unitType: "2BR",
        description: "",
        scopeType: null,
        csiPrimeCode: "",
        csiDetailCode: "",
        locationType: null,
        costType: null,
        installer: null,
        qty: null,
        uom: null,
        unitRate: null,
        budgetedManHours: null,
        startDate: null,
        finishDate: null,
        percentComplete: null,
        actualManHours: null,
        scopeStage: null,
        scopeStatus: null,
        inspectionStatus: null,
        subScopeInstances: [],
        clearInspections: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.units[0].subScopeInstances).toEqual([]);
  });

  it("includes populated subScopeInstances when sub-scopes exist for a row", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "row1",
        rowIndex: 0,
        building: "A",
        level: "1",
        unit: "101",
        area: "",
        shipPhase: "",
        buildPhase: "",
        scheme: "",
        unitType: "2BR",
        description: "",
        scopeType: { id: "st1", code: "CAB", name: "Cabinetry" },
        csiPrimeCode: "",
        csiDetailCode: "",
        locationType: null,
        costType: null,
        installer: null,
        qty: null,
        uom: null,
        unitRate: null,
        budgetedManHours: null,
        startDate: null,
        finishDate: null,
        percentComplete: null,
        actualManHours: null,
        scopeStage: null,
        scopeStatus: null,
        inspectionStatus: null,
        subScopeInstances: [
          {
            id: "inst1",
            subScopeId: "ss1",
            rowId: "row1",
            subScope: { id: "ss1", name: "Kitchen Cabinetry", displayOrder: 0, unitType: "2BR", scopeTypeId: "st1" },
            qty: { toNumber: () => 5, valueOf: () => 5 },
            scopeStage: "STAGING",
            scopeStatus: "IN_PROGRESS",
            inspectionStatus: null,
          },
          {
            id: "inst2",
            subScopeId: "ss2",
            rowId: "row1",
            subScope: { id: "ss2", name: "Bath Cabinetry", displayOrder: 1, unitType: "2BR", scopeTypeId: "st1" },
            qty: null,
            scopeStage: null,
            scopeStatus: null,
            inspectionStatus: null,
          },
        ],
        clearInspections: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.units[0].subScopeInstances).toHaveLength(2);
    expect(body.units[0].subScopeInstances[0].subScope.name).toBe("Kitchen Cabinetry");
    expect(body.units[0].subScopeInstances[0].scopeStage).toBe("STAGING");
    expect(body.units[0].subScopeInstances[0].qty).toBe(5);
    expect(body.units[0].subScopeInstances[1].scopeStage).toBeNull();
    expect(body.units[0].subScopeInstances[1].qty).toBeNull();
  });
});

// ─── PATCH /api/projects/[id]/sub-scopes/[subScopeId] ─────────────────────────

describe("PATCH /api/projects/[id]/sub-scopes/[subScopeId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("renames a sub-scope and returns updated record", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectSubScope.findUnique).mockResolvedValueOnce({ id: "ss1", projectId: "p1" } as never);
    vi.mocked(db.projectSubScope.update).mockResolvedValueOnce({
      id: "ss1", name: "Master Kitchen", displayOrder: 0, qty: null, unitType: "2BR", scopeTypeId: "st1",
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Master Kitchen" }),
      }),
      { params: Promise.resolve({ id: "p1", subScopeId: "ss1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subScope.name).toBe("Master Kitchen");
  });

  it("returns 400 when name is empty", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      { params: Promise.resolve({ id: "p1", subScopeId: "ss1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { PATCH } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      }),
      { params: Promise.resolve({ id: "p1", subScopeId: "ss1" }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when role lacks MANAGE_PROJECTS", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      }),
      { params: Promise.resolve({ id: "p1", subScopeId: "ss1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when sub-scope not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectSubScope.findUnique).mockResolvedValueOnce(null);

    const { PATCH } = await import("@/app/api/projects/[id]/sub-scopes/[subScopeId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      }),
      { params: Promise.resolve({ id: "p1", subScopeId: "ss-missing" }) }
    );
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/projects/[id]/sub-scopes (addToGroup mode) ────────────────────

describe("POST /api/projects/[id]/sub-scopes — addToGroup: true", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("adds a single sub-scope to an existing group", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { addSubScopeToGroup } = await import("@/lib/sub-scopes");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectSubScope.count).mockResolvedValueOnce(2);
    vi.mocked(db.projectSubScope.findFirst).mockResolvedValueOnce(null);
    vi.mocked(addSubScopeToGroup).mockResolvedValueOnce({
      id: "ss3", name: "Laundry", displayOrder: 2, qty: null,
      unitType: "2BR", scopeTypeId: "st1", scopeTypeName: "",
      createdAt: new Date(), instanceCount: 5,
    });
    vi.mocked(db.scopeType.findUnique).mockResolvedValueOnce({ name: "Cabinetry" } as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addToGroup: true, unitType: "2BR", scopeTypeId: "st1", name: "Laundry" }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subScope.name).toBe("Laundry");
  });

  it("returns 400 when group does not exist", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectSubScope.count).mockResolvedValueOnce(0);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addToGroup: true, unitType: "2BR", scopeTypeId: "st1", name: "Laundry" }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 on name conflict", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectSubScope.count).mockResolvedValueOnce(2);
    vi.mocked(db.projectSubScope.findFirst).mockResolvedValueOnce({ id: "existing" } as never);

    const { POST } = await import("@/app/api/projects/[id]/sub-scopes/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addToGroup: true, unitType: "2BR", scopeTypeId: "st1", name: "Kitchen" }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(res.status).toBe(409);
  });
});
