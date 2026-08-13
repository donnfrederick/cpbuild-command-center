import { Buffer } from "node:buffer";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
const mockTx = {
  $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
  $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: "lk1" }]),
};
vi.mock("@/lib/db", () => ({
  db: {
    project: { findUnique: vi.fn(), findFirst: vi.fn() },
    projectRow: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      aggregate: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    projectIssue: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    inspectionSubmission: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    clearInspection: {
      count: vi.fn().mockResolvedValue(0),
    },
    projectObservation: {
      count: vi.fn().mockResolvedValue(0),
    },
    issueScopeTag: {
      create: vi.fn().mockResolvedValue({}),
    },
    observationScopeTag: {
      create: vi.fn().mockResolvedValue({}),
    },
    projectSubScopeInstance: {
      count: vi.fn().mockResolvedValue(0),
    },
    projectScopeOverride: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    scopeType: { findFirst: vi.fn(), create: vi.fn() },
    locationType: { findFirst: vi.fn(), create: vi.fn() },
    costType: { findFirst: vi.fn(), create: vi.fn() },
    installTeam: { findFirst: vi.fn(), create: vi.fn() },
    uomType: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
  },
}));
// Mock sub-scopes service — hasSubScopeInstances returns false by default so
// existing tests that update scopeStage/scopeStatus are not blocked.
vi.mock("@/lib/sub-scopes", () => ({
  hasSubScopeInstances: vi.fn().mockResolvedValue(false),
  autoCreateInstancesForNewRows: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/project-rows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/project-rows")>();
  return {
    ...actual,
    insertProjectRows: vi.fn().mockResolvedValue({ unlinkedScopeTypes: [] }),
  };
});
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
  resolveActorName: vi.fn().mockResolvedValue("Test User"),
  resolveActivityActorName: vi.fn().mockResolvedValue({ actorId: "u1", userName: "Test User" }),
  getActivityReplayMetadata: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/field-notes/relink-scope-tags", () => ({
  relinkScopeTagsForProject: vi.fn().mockResolvedValue({ issueTagsCreated: 0, observationTagsCreated: 0 }),
}));
vi.mock("@/lib/activity-subcontractor-log", () => ({
  resolveSubcontractorDisplayName: vi.fn().mockResolvedValue("Acme Install LLC"),
}));

/** Progress OR-filter count vs total row count — overwrite route calls both. */
async function mockOverwriteGuardCounts(options?: {
  progressRows?: number;
  totalRows?: number;
  issues?: number;
}) {
  const { db } = await import("@/lib/db");
  vi.mocked(db.inspectionSubmission.count).mockResolvedValue(0 as never);
  vi.mocked(db.clearInspection.count).mockResolvedValue(0 as never);
  vi.mocked(db.projectIssue.count).mockResolvedValue((options?.issues ?? 0) as never);
  vi.mocked(db.projectObservation.count).mockResolvedValue(0 as never);
  vi.mocked(db.projectRow.count).mockImplementation((args: { where?: Record<string, unknown> }) => {
    if (args?.where && "OR" in args.where) {
      return Promise.resolve(options?.progressRows ?? 0);
    }
    return Promise.resolve(options?.totalRows ?? 0);
  });
}

async function mockProjectRowFindManySequence(...responses: unknown[][]) {
  const { db } = await import("@/lib/db");
  let call = 0;
  vi.mocked(db.projectRow.findMany).mockImplementation(() => {
    const payload = responses[call] ?? responses[responses.length - 1] ?? [];
    call += 1;
    return Promise.resolve(payload as never);
  });
}

async function resetUnitsPostMocks() {
  const { insertProjectRows } = await import("@/lib/project-rows");
  const { relinkScopeTagsForProject } = await import("@/lib/field-notes/relink-scope-tags");
  const { resolveActorName, resolveActivityActorName } = await import("@/lib/activity-logger");
  vi.mocked(insertProjectRows).mockResolvedValue({ unlinkedScopeTypes: [] } as never);
  vi.mocked(relinkScopeTagsForProject).mockResolvedValue({ issueTagsCreated: 0, observationTagsCreated: 0 });
  vi.mocked(resolveActorName).mockResolvedValue("Test User");
  vi.mocked(resolveActivityActorName).mockResolvedValue({ actorId: "u1", userName: "Test User" });
  await mockOverwriteGuardCounts();
}

describe("GET /api/projects/[id]/units", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(401);
  });

  it("returns 200 for INSTALL_MANAGER (has MANAGE_PROJECTS — unit read access)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
  });

  it("returns 200 for PROJECT_MANAGER (has MANAGE_PROJECTS — unit read access)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "PROJECT_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
  });

  it("returns 403 for MEMBER (lacks VIEW_UPM, MANAGE_PROJECTS, and MANAGE_UNIT_STATUS)", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(403);
  });

  it("returns 404 when project not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findFirst).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
  });

  it("returns units when project exists (ADMIN)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "r1",
        rowIndex: 0,
        building: "A",
        level: "1",
        unit: "101",
        area: "100",
        shipPhase: "",
        buildPhase: "",
        scheme: "",
        unitType: "",
        description: "",
        scopeType: { id: "s1", code: "ST1", name: "Scope" },
        csiPrimeCode: "",
        csiDetailCode: "",
        locationType: null,
        costType: null,
        installer: null,
        qty: 5,
        uom: { id: "u1", code: "EA", name: "Each" },
        unitRate: 10,
        budgetedManHours: 50,
        startDate: new Date("2024-01-15"),
        finishDate: null,
        percentComplete: null,
        actualManHours: null,
        scopeStage: null,
        scopeStatus: null,
        inspectionStatus: null,
        clearInspections: [],
        subScopeInstances: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.units).toHaveLength(1);
    expect(body.units[0].building).toBe("A");
    expect(body.units[0].unit).toBe("101");
    expect(body.units[0].qty).toBe(5);
    expect(body.hasMore).toBeUndefined();
    expect(db.projectRow.count).not.toHaveBeenCalled();
  });

  it("applies project scope override to serialized canonicalScopeType on GET", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectScopeOverride.findMany).mockResolvedValueOnce([
      {
        scopeTypeId: "st1",
        canonicalScopeType: { id: "cst-override", code: "LVT-S", displayName: "LVT Stairs" },
      },
    ] as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "r1",
        rowIndex: 0,
        building: "A",
        level: "1",
        unit: "101",
        area: "100",
        shipPhase: "",
        buildPhase: "",
        scheme: "",
        unitType: "",
        description: "",
        scopeType: {
          id: "st1",
          code: "LVT",
          name: "LVT",
          canonicalScopeType: { id: "cst-global", code: "LVT", displayName: "LVT Flooring" },
        },
        csiPrimeCode: "",
        csiDetailCode: "",
        locationType: null,
        costType: null,
        installer: null,
        qty: 5,
        uom: { id: "u1", code: "EA", name: "Each" },
        unitRate: 10,
        budgetedManHours: 50,
        startDate: new Date("2024-01-15"),
        finishDate: null,
        percentComplete: null,
        actualManHours: null,
        scopeStage: null,
        scopeStatus: null,
        inspectionStatus: null,
        clearInspections: [],
        subScopeInstances: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.units[0].scopeType.canonicalScopeType.displayName).toBe("LVT Stairs");
    expect(vi.mocked(db.projectScopeOverride.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "p1" } }),
    );
  });

  function baseMockRow(
    id: string,
    rowIndex: number,
    overrides: Partial<{ building: string; unit: string; description: string }> = {}
  ) {
    return {
      id,
      rowIndex,
      building: overrides.building ?? "A",
      level: "1",
      unit: overrides.unit ?? "101",
      area: "",
      shipPhase: "",
      buildPhase: "",
      scheme: "",
      unitType: "",
      description: overrides.description ?? "",
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
    };
  }

  it("paginated GET returns slice, hasMore, nextCursor, and total on first page", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.count).mockResolvedValueOnce(5);
    vi.mocked(db.projectRow.groupBy).mockResolvedValueOnce([
      { building: "A", level: "1", unit: "101", _count: { _all: 1 } },
      { building: "A", level: "1", unit: "102", _count: { _all: 1 } },
      { building: "A", level: "1", unit: "103", _count: { _all: 1 } },
    ] as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      baseMockRow("r1", 0, { unit: "101" }),
      baseMockRow("r2", 1, { unit: "102" }),
      baseMockRow("r3", 2, { unit: "103" }),
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(
      new Request("http://localhost/api/projects/p1/units?limit=2"),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.units).toHaveLength(2);
    expect(body.units[1].id).toBe("r2");
    expect(body.hasMore).toBe(true);
    expect(typeof body.nextCursor).toBe("string");
    expect(body.nextCursor.length).toBeGreaterThan(0);
    expect(body.total).toBe(5);
    expect(body.totalUnits).toBe(3);
    expect(vi.mocked(db.projectRow.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        where: { projectId: "p1" },
      })
    );
  });

  it("paginated GET with search applies global filter to where and count", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.count).mockResolvedValueOnce(2);
    vi.mocked(db.projectRow.groupBy).mockResolvedValueOnce([
      { building: "A", level: "1", unit: "101", _count: { _all: 1 } },
      { building: "A", level: "1", unit: "102", _count: { _all: 1 } },
    ] as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      baseMockRow("r1", 0, { unit: "101", description: "Countertops - TEST" }),
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(
      new Request("http://localhost/api/projects/p1/units?limit=50&search=Countertops"),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.units).toHaveLength(1);
    expect(body.total).toBe(2);
    expect(body.totalUnits).toBe(2);
    expect(vi.mocked(db.projectRow.count)).toHaveBeenCalledWith({
      where: {
        AND: [
          { projectId: "p1" },
          {
            OR: expect.arrayContaining([
              expect.objectContaining({ description: { contains: "Countertops", mode: "insensitive" } }),
            ]),
          },
        ],
      },
    });
  });

  it("paginated GET second page uses keyset where and omits total", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    const cursor = Buffer.from(JSON.stringify({ rowIndex: 1, id: "r2" }), "utf8").toString("base64url");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([baseMockRow("r3", 2, { unit: "103" })] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(
      new Request(`http://localhost/api/projects/p1/units?limit=2&cursor=${encodeURIComponent(cursor)}`),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.units).toHaveLength(1);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBeUndefined();
    expect(body.totalUnits).toBeUndefined();
    expect(db.projectRow.count).not.toHaveBeenCalled();
    expect(db.projectRow.groupBy).not.toHaveBeenCalled();
    expect(vi.mocked(db.projectRow.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        where: {
          AND: [
            { projectId: "p1" },
            {
              OR: [
                { rowIndex: { gt: 1 } },
                { AND: [{ rowIndex: 1 }, { id: { gt: "r2" } }] },
              ],
            },
          ],
        },
      })
    );
  });

  it("returns 400 for invalid limit when paginating", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(
      new Request("http://localhost/api/projects/p1/units?limit=nan"),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid limit");
  });

  it("returns 400 for invalid cursor", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(
      new Request("http://localhost/api/projects/p1/units?limit=10&cursor=%%%"),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid cursor");
  });

  it("clamps limit above max to 200 (take 201)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.count).mockResolvedValueOnce(300);
    vi.mocked(db.projectRow.groupBy).mockResolvedValueOnce(
      Array.from({ length: 300 }, (_, i) => ({
        building: "A",
        level: "1",
        unit: String(i),
        _count: { _all: 1 },
      })) as never
    );
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce(
      Array.from({ length: 201 }, (_, i) => baseMockRow(`r${i}`, i, { unit: String(i) })) as never
    );

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(
      new Request("http://localhost/api/projects/p1/units?limit=999"),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.units).toHaveLength(200);
    expect(body.hasMore).toBe(true);
    expect(vi.mocked(db.projectRow.findMany)).toHaveBeenCalledWith(expect.objectContaining({ take: 201 }));
  });

  it("tour demo project returns full units with pagination envelope when limit is set", async () => {
    const { auth } = await import("@/lib/auth");
    const { TOUR_DEMO_PROJECT_ID, TOUR_DEMO_UNITS } = await import("@/lib/tour-demo-data");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(
      new Request(`http://localhost/api/projects/${TOUR_DEMO_PROJECT_ID}/units?limit=5`),
      { params: Promise.resolve({ id: TOUR_DEMO_PROJECT_ID }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.units).toHaveLength(TOUR_DEMO_UNITS.length);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(TOUR_DEMO_UNITS.length);
    const distinctDemoUnits = new Set(TOUR_DEMO_UNITS.map((r) => `${r.building}|${r.level}|${r.unit}`)).size;
    expect(body.totalUnits).toBe(distinctDemoUnits);
  });

  it("includes issueMeta with empty arrays when no issues exist for the project", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: "",
        shipPhase: "", buildPhase: "", scheme: null, unitType: "", description: "",
        scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null,
        costType: null, installer: null, qty: null, uom: null, unitRate: null,
        budgetedManHours: null, startDate: null, finishDate: null, percentComplete: null,
        actualManHours: null, scopeStage: null, scopeStatus: null, inspectionStatus: null,
        subScopeInstances: [],
        clearInspections: [],
      },
    ] as never);
    // No issues — default mock returns []

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.units[0].issueMeta).toMatchObject({
      hasIssues: false,
      hasOpenIssues: false,
      hasBlockingIssues: false,
      issueTypes: [],
      responsibleParties: [],
      statuses: [],
      scopeRowIdsWithIssues: [],
    });
  });

  it("populates issueMeta with issue data when issues exist for the unit", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: "",
        shipPhase: "", buildPhase: "", scheme: null, unitType: "", description: "",
        scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null,
        costType: null, installer: null, qty: null, uom: null, unitRate: null,
        budgetedManHours: null, startDate: null, finishDate: null, percentComplete: null,
        actualManHours: null, scopeStage: null, scopeStatus: null, inspectionStatus: null,
        subScopeInstances: [],
        clearInspections: [],
      },
    ] as never);
    vi.mocked(db.projectIssue.findMany).mockResolvedValueOnce([
      {
        id: "issue-1",
        unitRef: "A|1|101",
        issueTypeCode: "DAMAGED_MATERIALS",
        responsiblePartyCode: "ELECTRICIAN",
        isBlockingWork: true,
        status: "OPEN",
        scopeTags: [{ projectRowId: "r1" }],
        subScopeTags: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    const meta = body.units[0].issueMeta;
    expect(meta.hasIssues).toBe(true);
    expect(meta.hasOpenIssues).toBe(true);
    expect(meta.hasBlockingIssues).toBe(true);
    expect(meta.issueTypes).toContain("DAMAGED_MATERIALS");
    expect(meta.responsibleParties).toContain("ELECTRICIAN");
    expect(meta.statuses).toContain("OPEN");
    expect(meta.scopeRowIdsWithIssues).toContain("r1");
  });

  it("includes subScopeInstanceIdsWithBlockingIssues for open blocking issues tagged on sub-scopes (FB-0027)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: "",
        shipPhase: "", buildPhase: "", scheme: null, unitType: "", description: "",
        scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null,
        costType: null, installer: null, qty: null, uom: null, unitRate: null,
        budgetedManHours: null, startDate: null, finishDate: null, percentComplete: null,
        actualManHours: null, scopeStage: null, scopeStatus: null, inspectionStatus: null,
        subScopeInstances: [],
        clearInspections: [],
      },
    ] as never);
    vi.mocked(db.projectIssue.findMany).mockResolvedValueOnce([
      {
        id: "issue-sub",
        unitRef: "A|1|101",
        issueTypeCode: "DAMAGED_MATERIALS",
        responsiblePartyCode: "ELECTRICIAN",
        isBlockingWork: true,
        status: "OPEN",
        scopeTags: [],
        subScopeTags: [{ subScopeInstanceId: "ssi-blocked" }],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    const meta = body.units[0].issueMeta;
    expect(meta.subScopeInstanceIdsWithBlockingIssues).toContain("ssi-blocked");
    expect(meta.subScopeInstanceIdsWithIssues).toContain("ssi-blocked");
  });
});

describe("PATCH /api/projects/[id]/units/[rowId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    const { resolveActorName, resolveActivityActorName } = await import("@/lib/activity-logger");
    const { resolveSubcontractorDisplayName } = await import("@/lib/activity-subcontractor-log");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0);
    vi.mocked(resolveActorName).mockResolvedValue("Test User");
    vi.mocked(resolveActivityActorName).mockResolvedValue({ actorId: "u1", userName: "Test User" });
    vi.mocked(resolveSubcontractorDisplayName).mockResolvedValue("Acme Install LLC");
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ building: "B" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks EDIT_UPM and MANAGE_UNIT_STATUS (MEMBER)", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ building: "B" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 200 for PROJECT_MANAGER patching scopeStage (same location edit access as Install Manager)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "PROJECT_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({ id: "r1" } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ scopeStage: "INSTALL" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(200);
  });

  it("returns 403 for CONTROLS_MANAGER attempting to update scopeStage (lacks MANAGE_UNIT_STATUS)", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "CONTROLS_MANAGER" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ scopeStage: "INSTALL" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 200 for INSTALL_MANAGER patching non-status field (has MANAGE_UNIT_STATUS)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({ id: "r1" } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ building: "B" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(200);
  });

  it("returns 200 for INSTALL_MANAGER patching scopeStage (has MANAGE_UNIT_STATUS)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({ id: "r1" } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ scopeStage: "INSTALL" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(200);
  });

  it("returns 200 for DESIGNER patching non-status field (has MANAGE_UNIT_STATUS)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "DESIGNER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({ id: "r1" } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ scopeStatus: "IN_PROGRESS" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(200);
  });

  it("returns 422 BLOCKING_ISSUE_OPEN when transitioning to INSTALL+COMPLETE with an open blocking issue (FB-0027)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({
      id: "r1",
      projectId: "p1",
      scopeStage: "INSTALL",
      scopeStatus: "IN_PROGRESS",
    } as never);
    vi.mocked(db.projectIssue.count).mockResolvedValueOnce(1);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(422);
    const body = await res.json() as { code?: string };
    expect(body.code).toBe("BLOCKING_ISSUE_OPEN");
    expect(db.projectRow.update).not.toHaveBeenCalled();
  });

  it("returns 404 when row not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce(null as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ building: "B" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("updates row when authorized", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1",
      rowIndex: 0,
      building: "B",
      level: "1",
      unit: "101",
      area: "100",
      shipPhase: "",
      buildPhase: "",
      scheme: "",
      unitType: "",
      description: "",
      scopeType: null,
      csiPrimeCode: "",
      csiDetailCode: "",
      locationType: null,
      costType: null,
      installer: null,
      qty: 5,
      uom: null,
      unitRate: 10,
      budgetedManHours: 50,
      startDate: null,
      finishDate: null,
      percentComplete: null,
      actualManHours: null,
      scopeStage: null,
      scopeStatus: null,
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ building: "B" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.building).toBe("B");
  });

  it("updates scopeStage when provided", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: "",
      shipPhase: "", buildPhase: "", scheme: "", unitType: "", description: "",
      scopeType: null, csiPrimeCode: "", csiDetailCode: "", locationType: null,
      costType: null, installer: null, qty: null, uom: null, unitRate: null,
      budgetedManHours: null, startDate: null, finishDate: null,
      percentComplete: null, actualManHours: null,
      scopeStage: "STAGING",
      scopeStatus: null,
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ scopeStage: "STAGING" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scopeStage).toBe("STAGING");
    expect(body.scopeStatus).toBeNull();
  });

  it("updates scopeStatus when provided", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: "",
      shipPhase: "", buildPhase: "", scheme: "", unitType: "", description: "",
      scopeType: null, csiPrimeCode: "", csiDetailCode: "", locationType: null,
      costType: null, installer: null, qty: null, uom: null, unitRate: null,
      budgetedManHours: null, startDate: null, finishDate: null,
      percentComplete: null, actualManHours: null,
      scopeStage: "ASSEMBLY",
      scopeStatus: "IN_PROGRESS",
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scopeStage).toBe("ASSEMBLY");
    expect(body.scopeStatus).toBe("IN_PROGRESS");
  });

  it("rejects invalid scopeStage value with 422", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ scopeStage: "INVALID_STAGE" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(422);
  });

  it("rejects whitespace-only required UPM fields with 422", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ unitType: "   ", description: " ", scopeTypeCode: "\t" }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(422);
  });

  it("allows scopeTypeId null when scopeTypeCode is provided", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.scopeType.findFirst).mockResolvedValueOnce({ id: "st-tile" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1",
      rowIndex: 0,
      building: "A",
      level: "1",
      unit: "101",
      area: "",
      shipPhase: "",
      buildPhase: "",
      scheme: "",
      unitType: "Lobby",
      description: "Tile",
      scopeType: { id: "st-tile", name: "Tile", code: "TILE" },
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
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scopeTypeId: null, scopeTypeCode: "TILE" }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(200);
  });

  it("rejects clearing scope type when scopeTypeId is null and scopeTypeCode is omitted", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ scopeTypeId: null }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(422);
  });

  it("clears scopeStage when null is provided", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: "",
      shipPhase: "", buildPhase: "", scheme: "", unitType: "", description: "",
      scopeType: null, csiPrimeCode: "", csiDetailCode: "", locationType: null,
      costType: null, installer: null, qty: null, uom: null, unitRate: null,
      budgetedManHours: null, startDate: null, finishDate: null,
      percentComplete: null, actualManHours: null,
      scopeStage: null,
      scopeStatus: null,
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ scopeStage: null }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scopeStage).toBeNull();
  });

  it("sets inspectionStatus to READY when row is INSTALL+COMPLETE", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1", scopeStage: "INSTALL", scopeStatus: "COMPLETE" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: null,
      shipPhase: "", buildPhase: "", scheme: null, unitType: null, description: "",
      scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null,
      costType: null, installer: null, qty: null, uom: null, unitRate: null,
      budgetedManHours: null, startDate: null, finishDate: null,
      percentComplete: null, actualManHours: null,
      scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: "READY",
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ inspectionStatus: "READY" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inspectionStatus).toBe("READY");
  });

  it("sets inspectionStatus to PASSED when row is INSTALL+COMPLETE", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1", scopeStage: "INSTALL", scopeStatus: "COMPLETE" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: null,
      shipPhase: "", buildPhase: "", scheme: null, unitType: null, description: "",
      scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null,
      costType: null, installer: null, qty: null, uom: null, unitRate: null,
      budgetedManHours: null, startDate: null, finishDate: null,
      percentComplete: null, actualManHours: null,
      scopeStage: "INSTALL", scopeStatus: "COMPLETE", inspectionStatus: "PASSED",
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ inspectionStatus: "PASSED" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inspectionStatus).toBe("PASSED");
  });

  it("clears inspectionStatus by setting it to null", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: null,
      shipPhase: "", buildPhase: "", scheme: null, unitType: null, description: "",
      scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null,
      costType: null, installer: null, qty: null, uom: null, unitRate: null,
      budgetedManHours: null, startDate: null, finishDate: null,
      percentComplete: null, actualManHours: null,
      scopeStage: null, scopeStatus: null, inspectionStatus: null,
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ inspectionStatus: null }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.inspectionStatus).toBeNull();
  });

  it("rejects inspectionStatus when row is not INSTALL+COMPLETE", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1", scopeStage: "STAGING", scopeStatus: "IN_PROGRESS" } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ inspectionStatus: "READY" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(422);
  });

  it("rejects invalid inspectionStatus value with 422", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ inspectionStatus: "INVALID" }) }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );

    expect(res.status).toBe(422);
  });

  it("accepts and persists unifierSubId when patching a scope row", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: "",
      shipPhase: "", buildPhase: "", scheme: "", unitType: "", description: "",
      scopeType: null, csiPrimeCode: "", csiDetailCode: "", locationType: null,
      costType: null, installer: null, unifierSubId: "sub-99",
      qty: null, uom: null, unitRate: null, budgetedManHours: null,
      startDate: null, finishDate: null, percentComplete: null, actualManHours: null,
      scopeStage: null, scopeStatus: null, inspectionStatus: null,
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ unifierSubId: "sub-99" }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );
    const body = await res.json() as { unifierSubId: string | null };

    expect(res.status).toBe(200);
    expect(body.unifierSubId).toBe("sub-99");

    const updateCall = vi.mocked(db.projectRow.update).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    } | undefined;
    expect(updateCall?.data).toMatchObject({ unifierSubId: "sub-99" });
  });

  it("logs SCOPE_SUBCONTRACTOR_UPDATED when assigning subcontractor (not Location Builder)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { logActivity, resolveActivityActorName } = await import("@/lib/activity-logger");

    vi.mocked(resolveActivityActorName).mockResolvedValue({ actorId: "u1", userName: "Test User" });
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({
      id: "r1",
      projectId: "p1",
      building: "North",
      level: "2",
      unit: "N208",
      unifierSubId: null,
      inspectionStatus: null,
      scopeStage: null,
      scopeStatus: null,
    } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1",
      rowIndex: 0,
      building: "North",
      level: "2",
      unit: "N208",
      area: "",
      shipPhase: "",
      buildPhase: "",
      scheme: "",
      unitType: "",
      description: "",
      scopeType: { id: "st1", code: "CAB", name: "Cabinetry", canonicalScopeType: null },
      csiPrimeCode: "",
      csiDetailCode: "",
      locationType: null,
      costType: null,
      installer: null,
      unifierSubId: "sub-99",
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
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ unifierSubId: "sub-99" }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) },
    );

    const { voidLogFieldActivity } = await import("@/lib/activity/log-field-activity");
    expect(res.status).toBe(200);
    expect(voidLogFieldActivity).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({
        eventType: "SCOPE_SUBCONTRACTOR_UPDATED",
        scopeName: "Cabinetry",
        subcontractorName: "Acme Install LLC",
        building: "North",
        level: "2",
        unit: "N208",
      }),
      expect.any(Object),
    );
    expect(voidLogFieldActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ eventType: "UPM_ROW_UPDATED" }),
    );
  });

  it("clears unifierSubId when patching with null", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValueOnce({
      id: "r1", rowIndex: 0, building: "A", level: "1", unit: "101", area: "",
      shipPhase: "", buildPhase: "", scheme: "", unitType: "", description: "",
      scopeType: null, csiPrimeCode: "", csiDetailCode: "", locationType: null,
      costType: null, installer: null, unifierSubId: null,
      qty: null, uom: null, unitRate: null, budgetedManHours: null,
      startDate: null, finishDate: null, percentComplete: null, actualManHours: null,
      scopeStage: null, scopeStatus: null, inspectionStatus: null,
    } as never);

    const { PATCH } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ unifierSubId: null }),
      }),
      { params: Promise.resolve({ id: "p1", rowId: "r1" }) }
    );
    const body = await res.json() as { unifierSubId: string | null };

    expect(res.status).toBe(200);
    expect(body.unifierSubId).toBeNull();

    const updateCall = vi.mocked(db.projectRow.update).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    } | undefined;
    expect(updateCall?.data).toMatchObject({ unifierSubId: null });
  });
});

describe("POST /api/projects/[id]/units", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findUnique).mockReset();
    vi.mocked(db.projectRow.aggregate).mockReset();
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
    await resetUnitsPostMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ Building: "A", Level: "1", Unit: "101" }] }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks EDIT_UPM and MANAGE_PROJECTS (MEMBER)", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ Building: "A", Level: "1", Unit: "101" }] }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 for DESIGNER (has VIEW_UPM and MANAGE_UNIT_STATUS but not EDIT_UPM or MANAGE_PROJECTS)", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "DESIGNER" } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ Building: "A", Level: "1", Unit: "101" }] }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when project not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findFirst).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ Building: "A", Level: "1", Unit: "101" }] }),
      }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );

    expect(res.status).toBe(404);
  });

  it("adds rows when authorized (add mode)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.aggregate).mockResolvedValueOnce({ _max: { rowIndex: 0 } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ Building: "B", Level: "2", Unit: "201" }] }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.added).toBe(1);
    expect(body.message).toContain("Added 1 row");
  });

  it("merge mode skips duplicate rows", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    await mockProjectRowFindManySequence(
      [{ building: "A", level: "1", unit: "101", description: "" }],
      [{ id: "new-row" }],
      [{ building: "A", level: "1", unit: "101", description: "" }],
    );
    vi.mocked(db.projectRow.aggregate).mockResolvedValueOnce({ _max: { rowIndex: 0 } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { Building: "A", Level: "1", Unit: "101" },
            { Building: "B", Level: "2", Unit: "201" },
          ],
          mode: "merge",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.added).toBe(1);
    expect(body.skipped).toBe(1);
  });

  it("merge mode treats same unit with different description as a new row", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    await mockProjectRowFindManySequence(
      [{ building: "A", level: "1", unit: "101", description: "Scope A" }],
      [{ id: "new-row" }],
      [{ building: "A", level: "1", unit: "101", description: "Scope A" }],
    );
    vi.mocked(db.projectRow.aggregate).mockResolvedValueOnce({ _max: { rowIndex: 0 } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { Building: "A", Level: "1", Unit: "101", Description: "Scope B" },
          ],
          mode: "merge",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.added).toBe(1);
    expect(body.skipped).toBe(0);
  });

  it("logs UNIT_ROW_CREATED after successful upload", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { logActivity } = await import("@/lib/activity-logger");
    const { relinkScopeTagsForProject } = await import("@/lib/field-notes/relink-scope-tags");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.aggregate).mockResolvedValueOnce({ _max: { rowIndex: 0 } } as never);
    await mockProjectRowFindManySequence([], [{ id: "new-row" }], []);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [{ Building: "A", Level: "1", Unit: "101" }],
          mode: "add",
          source: "upload",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(logActivity).toHaveBeenCalledWith(
      "p1",
      "u1",
      "Test User",
      expect.objectContaining({
        eventType: "UNIT_ROW_CREATED",
        count: 1,
        mode: "add",
        source: "upload",
      }),
    );
    expect(relinkScopeTagsForProject).toHaveBeenCalledWith(db, "p1");
  });

  it("returns 200 with added 0 when no rows to add", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.added).toBe(0);
  });

  it("excludes empty rows when uploading (Excel-style payload)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { insertProjectRows } = await import("@/lib/project-rows");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.aggregate).mockResolvedValueOnce({ _max: { rowIndex: -1 } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { Building: "A", Level: "1", Unit: "101", Area: "100" },
            { Building: "", Level: "", Unit: "", Area: "" },
            { Building: "B", Level: "2", Unit: "201", Area: "200" },
            { Building: "", Level: "" },
            { Building: "C", Level: "3", Unit: "301" },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.added).toBe(3);

    const insertedRows = vi.mocked(insertProjectRows).mock.calls[0]?.[2] as Record<string, string>[];
    expect(insertedRows).toHaveLength(3);
    expect(insertedRows[0]).toMatchObject({ Building: "A", Level: "1", Unit: "101" });
    expect(insertedRows[1]).toMatchObject({ Building: "B", Level: "2", Unit: "201" });
    expect(insertedRows[2]).toMatchObject({ Building: "C", Level: "3", Unit: "301" });

    const hasEmptyRow = insertedRows.some(
      (r) =>
        !String(r.Building ?? "").trim() &&
        !String(r.Level ?? "").trim() &&
        !String(r.Unit ?? "").trim()
    );
    expect(hasEmptyRow).toBe(false);
  });
});

describe("DELETE /api/projects/[id]/units/[rowId]", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { DELETE } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1", rowId: "r1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks EDIT_UPM and MANAGE_PROJECTS (MEMBER)", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "MEMBER" } } as never);

    const { DELETE } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1", rowId: "r1" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 200 for INSTALL_MANAGER deleting a unit row (has MANAGE_PROJECTS)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.delete).mockResolvedValueOnce({} as never);

    const { DELETE } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1", rowId: "r1" }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 404 when row not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce(null as never);

    const { DELETE } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1", rowId: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });

  it("deletes row when authorized", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({ id: "r1", projectId: "p1" } as never);
    vi.mocked(db.projectRow.delete).mockResolvedValueOnce({} as never);

    const { DELETE } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1", rowId: "r1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(db.projectRow.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});

// ── GET /api/projects/[id]/units/[rowId] ─────────────────────────────────────

describe("GET /api/projects/[id]/units/[rowId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    // enforceProjectReadVisibility needs project.findFirst to resolve
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", rowId: "r1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 when anchor row is not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", rowId: "missing-row" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 200 with unit preview and sibling scopes for authorized user", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValueOnce({
      building: "A",
      level: "1",
      unit: "101",
      unitType: "Studio",
    } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "r1",
        rowIndex: 0,
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
        inspectionStatus: null,
        percentComplete: null,
        shipPhase: "Phase 1",
        buildPhase: "Build A",
        scopeType: { id: "st-1", code: "FLR", name: "Flooring", canonicalScopeType: null },
        uom: { code: "EA", name: "Each" },
        installer: null,
        subScopeInstances: [],
        clearInspections: [],
      },
      {
        id: "r2",
        rowIndex: 1,
        qty: 5,
        scopeStage: "STAGING",
        scopeStatus: "IN_PROGRESS",
        inspectionStatus: null,
        percentComplete: null,
        shipPhase: "Phase 1",
        buildPhase: "Build A",
        scopeType: { id: "st-2", code: "CTR", name: "Countertop", canonicalScopeType: null },
        uom: null,
        installer: { name: "Acme Tile" },
        subScopeInstances: [],
        clearInspections: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", rowId: "r1" }),
    });
    const body = await res.json() as {
      building: string;
      level: string;
      unit: string;
      unitType: string;
      scopes: Array<{ id: string; scopeStage: string; scopeStatus: string }>;
    };

    expect(res.status).toBe(200);
    expect(body.building).toBe("A");
    expect(body.level).toBe("1");
    expect(body.unit).toBe("101");
    expect(body.unitType).toBe("Studio");
    expect(body.scopes).toHaveLength(2);
    expect(body.scopes[0].id).toBe("r1");
    expect(body.scopes[0].scopeStage).toBe("INSTALL");
    expect(body.scopes[1].scopeStage).toBe("STAGING");
  });

  it("returns 200 for DESIGNER (has MANAGE_UNIT_STATUS)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "DESIGNER" } } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValueOnce({
      building: "A",
      level: "1",
      unit: "101",
      unitType: "",
    } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", rowId: "r1" }),
    });

    expect(res.status).toBe(200);
  });

  it("returns scopes with progress fields (scopeStage, scopeStatus, inspectionStatus)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findUnique).mockResolvedValueOnce({
      building: "B",
      level: "2",
      unit: "201",
      unitType: "",
    } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "r1",
        rowIndex: 0,
        qty: null,
        scopeStage: "ASSEMBLY",
        scopeStatus: "BLOCKED",
        inspectionStatus: "FAILED",
        percentComplete: null,
        shipPhase: "",
        buildPhase: "",
        scopeType: null,
        uom: null,
        installer: null,
        subScopeInstances: [],
        clearInspections: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/[rowId]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p1", rowId: "r1" }),
    });
    const body = await res.json() as {
      scopes: Array<{ scopeStage: string; scopeStatus: string; inspectionStatus: string }>;
    };

    expect(res.status).toBe(200);
    expect(body.scopes[0].scopeStage).toBe("ASSEMBLY");
    expect(body.scopes[0].scopeStatus).toBe("BLOCKED");
    expect(body.scopes[0].inspectionStatus).toBe("FAILED");
  });
});

// ── POST overwrite mode ───────────────────────────────────────────────────────

describe("POST /api/projects/[id]/units — overwrite mode", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
    await resetUnitsPostMocks();
  });

  it("calls deleteMany before insert and returns 201 with correct added count", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    await mockOverwriteGuardCounts({ totalRows: 5 });
    vi.mocked(db.projectRow.deleteMany).mockResolvedValueOnce({ count: 5 } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { Building: "A", Level: "1", Unit: "101" },
            { Building: "B", Level: "2", Unit: "201" },
          ],
          mode: "overwrite",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json() as { added: number };

    expect(res.status).toBe(201);
    expect(body.added).toBe(2);
    expect(db.projectRow.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1" } });
  });

  it("does NOT call deleteMany in add mode", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.aggregate).mockResolvedValueOnce({ _max: { rowIndex: 0 } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [{ Building: "A", Level: "1", Unit: "101" }],
          mode: "add",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(db.projectRow.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 403 for DESIGNER in overwrite mode (lacks EDIT_UPM and MANAGE_PROJECTS)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "DESIGNER" } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [{ Building: "A", Level: "1", Unit: "101" }],
          mode: "overwrite",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(403);
    expect(db.projectRow.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 403 for INSTALL_MANAGER in overwrite mode (has MANAGE_PROJECTS but not EDIT_UPM)", async () => {
    // INSTALL_MANAGER now has VIEW_UPM + MANAGE_PROJECTS (can add/edit/delete) but overwrite
    // is restricted to EDIT_UPM holders (ADMIN, CONTROLS_MANAGER) — not INSTALL_MANAGER.
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [{ Building: "A", Level: "1", Unit: "101" }],
          mode: "overwrite",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(403);
    expect(db.projectRow.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 201 for INSTALL_MANAGER in add mode (MANAGE_PROJECTS permits add/merge)", async () => {
    // Regression guard: adding rows should still succeed for INSTALL_MANAGER after
    // the overwrite restriction was introduced.
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "INSTALL_MANAGER" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    vi.mocked(db.projectRow.aggregate).mockResolvedValueOnce({ _max: { rowIndex: 0 } } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [{ Building: "A", Level: "1", Unit: "101" }],
          mode: "add",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    const body = await res.json() as { added: number };
    expect(res.status).toBe(201);
    expect(body.added).toBe(1);
    expect(db.projectRow.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 409 overwrite_blocked when field data exists on project", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    await mockOverwriteGuardCounts({ issues: 3 });

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [{ Building: "A", Level: "1", Unit: "101" }],
          mode: "overwrite",
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    const body = await res.json() as { error: string; reason: string; counts: { issues: number } };

    expect(res.status).toBe(409);
    expect(body.error).toBe("overwrite_blocked");
    expect(body.reason).toBe("field_data_exists");
    expect(body.counts.issues).toBe(3);
    expect(db.projectRow.deleteMany).not.toHaveBeenCalled();
  });

  it("allows ADMIN forceOverwrite when field data exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { logActivity } = await import("@/lib/activity-logger");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValueOnce({ id: "p1" } as never);
    await mockOverwriteGuardCounts({ issues: 2, totalRows: 4 });
    vi.mocked(db.projectRow.deleteMany).mockResolvedValueOnce({ count: 4 } as never);

    const { POST } = await import("@/app/api/projects/[id]/units/route");
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [{ Building: "A", Level: "1", Unit: "101" }],
          mode: "overwrite",
          forceOverwrite: true,
        }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(res.status).toBe(201);
    expect(db.projectRow.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1" } });
    expect(logActivity).toHaveBeenCalledWith(
      "p1",
      "u1",
      "Test User",
      expect.objectContaining({
        eventType: "UNIT_ROWS_BULK_DELETED",
        count: 4,
        mode: "overwrite",
      }),
    );
  });
});

describe("GET /api/projects/[id]/units/overwrite-eligibility", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
    vi.mocked(db.inspectionSubmission.count).mockResolvedValue(0 as never);
    vi.mocked(db.clearInspection.count).mockResolvedValue(0 as never);
    vi.mocked(db.projectRow.count).mockResolvedValue(0 as never);
    vi.mocked(db.projectIssue.count).mockResolvedValue(0 as never);
    vi.mocked(db.projectObservation.count).mockResolvedValue(0 as never);
  });

  it("returns overwriteAllowed true when no field data exists", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);

    const { GET } = await import("@/app/api/projects/[id]/units/overwrite-eligibility/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json() as { overwriteAllowed: boolean; blocked: boolean };

    expect(res.status).toBe(200);
    expect(body.overwriteAllowed).toBe(true);
    expect(body.blocked).toBe(false);
  });

  it("returns blocked when issues exist on project", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectIssue.count).mockResolvedValueOnce(1 as never);

    const { GET } = await import("@/app/api/projects/[id]/units/overwrite-eligibility/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "p1" }) });
    const body = await res.json() as { overwriteAllowed: boolean; blocked: boolean; counts: { issues: number } };

    expect(res.status).toBe(200);
    expect(body.overwriteAllowed).toBe(false);
    expect(body.blocked).toBe(true);
    expect(body.counts.issues).toBe(1);
  });
});

describe("GET /api/projects/[id]/units/lookup", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "p1", deletedAt: null, isTestProject: false } as never);
    vi.mocked(db.projectScopeOverride.findMany).mockResolvedValue([]);
  });

  it("applies project scope override to scope canonical in lookup response", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce({
      building: "A",
      level: "1",
      unit: "101",
      unitType: "Room",
      area: "850 SF",
      buildPhase: "2",
    } as never);
    vi.mocked(db.projectScopeOverride.findMany).mockResolvedValueOnce([
      {
        scopeTypeId: "st1",
        canonicalScopeType: { id: "cst-override", code: "LVT-S", displayName: "LVT Stairs" },
      },
    ] as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      {
        id: "r1",
        rowIndex: 0,
        building: "A",
        level: "1",
        unit: "101",
        shipPhase: null,
        buildPhase: null,
        qty: null,
        percentComplete: null,
        scopeStage: null,
        scopeStatus: null,
        inspectionStatus: null,
        scopeType: {
          id: "st1",
          code: "LVT",
          name: "LVT",
          canonicalScopeType: { id: "cst-global", code: "LVT", displayName: "LVT Flooring" },
        },
        uom: null,
        installer: null,
        subScopeInstances: [],
        clearInspections: [],
      },
    ] as never);

    const { GET } = await import("@/app/api/projects/[id]/units/lookup/route");
    const res = await GET(
      new NextRequest("http://localhost/api/projects/p1/units/lookup?building=A&level=1&unit=101"),
      { params: Promise.resolve({ id: "p1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.area).toBe("850 SF");
    expect(body.buildPhase).toBe("2");
    expect(body.scopes[0].scopeType.canonicalScopeType.displayName).toBe("LVT Stairs");
  });
});
