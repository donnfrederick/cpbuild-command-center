import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    projectRow: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    projectScopeOverride: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    scopeType: {
      findUnique: vi.fn(),
    },
    canonicalScopeType: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
  enforceProductionProjectMutation: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(),
  PERMISSIONS: {
    VIEW_UPM: "view:upm",
    EDIT_UPM: "edit:upm",
  },
}));
vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));

const PROJECT_ID = "proj_test";
const SCOPE_TYPE_ID = "st_lvt";
const CANONICAL_ID = "cst_lvt_stairs";

const CANONICAL_FIXTURE = { id: CANONICAL_ID, code: "LVT-S", displayName: "LVT Stairs" };
const SCOPE_TYPE_FIXTURE = { id: SCOPE_TYPE_ID, code: "LVT", name: "LVT", canonicalScopeType: null };

async function makeGet() {
  const { GET } = await import("@/app/api/projects/[id]/scope-overrides/route");
  return GET(
    new Request(`http://localhost/api/projects/${PROJECT_ID}/scope-overrides`),
    { params: Promise.resolve({ id: PROJECT_ID }) },
  );
}

async function makePost(body: unknown) {
  const { POST } = await import("@/app/api/projects/[id]/scope-overrides/route");
  return POST(
    new Request(`http://localhost/api/projects/${PROJECT_ID}/scope-overrides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PROJECT_ID }) },
  );
}

async function makeDelete(scopeTypeId: string) {
  const { DELETE } = await import(
    "@/app/api/projects/[id]/scope-overrides/[scopeTypeId]/route"
  );
  return DELETE(
    new Request(
      `http://localhost/api/projects/${PROJECT_ID}/scope-overrides/${scopeTypeId}`,
      { method: "DELETE" },
    ),
    { params: Promise.resolve({ id: PROJECT_ID, scopeTypeId }) },
  );
}

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/projects/[id]/scope-overrides", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";

    const { hasPermission } = await import("@/lib/permissions");
    vi.mocked(hasPermission).mockReturnValue(true);

    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      {
        scopeTypeId: SCOPE_TYPE_ID,
        scopeType: {
          id: SCOPE_TYPE_ID,
          code: "LVT",
          name: "LVT",
          canonicalScopeType: { id: "cst_lvt", code: "LVT", displayName: "LVT Flooring" },
        },
      },
    ] as never);
    vi.mocked(db.projectScopeOverride.findMany).mockResolvedValue([]);
  });

  it("returns 403 when role lacks VIEW_UPM", async () => {
    const { hasPermission } = await import("@/lib/permissions");
    vi.mocked(hasPermission).mockReturnValue(false);
    const res = await makeGet();
    expect(res.status).toBe(403);
  });

  it("returns scopes with no override when none exist", async () => {
    const res = await makeGet();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { scopes: unknown[] };
    expect(data.scopes).toHaveLength(1);
    const scope = data.scopes[0] as {
      scopeTypeId: string;
      globalCanonical: { displayName: string };
      projectOverride: null;
    };
    expect(scope.scopeTypeId).toBe(SCOPE_TYPE_ID);
    expect(scope.globalCanonical?.displayName).toBe("LVT Flooring");
    expect(scope.projectOverride).toBeNull();
  });

  it("returns project override when one exists", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectScopeOverride.findMany).mockResolvedValue([
      { scopeTypeId: SCOPE_TYPE_ID, canonicalScopeType: CANONICAL_FIXTURE },
    ] as never);

    const res = await makeGet();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      scopes: { scopeTypeId: string; projectOverride: { displayName: string } | null }[];
    };
    expect(data.scopes[0].projectOverride?.displayName).toBe("LVT Stairs");
  });

  it("handles scope with null scopeType (no UPM row for it)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { scopeTypeId: null, scopeType: null },
    ] as never);
    const res = await makeGet();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { scopes: unknown[] };
    // Rows with null scopeType are filtered out
    expect(data.scopes).toHaveLength(0);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/projects/[id]/scope-overrides", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";

    const { hasPermission } = await import("@/lib/permissions");
    vi.mocked(hasPermission).mockReturnValue(true);

    const { db } = await import("@/lib/db");
    vi.mocked(db.scopeType.findUnique).mockResolvedValue({ id: SCOPE_TYPE_ID } as never);
    vi.mocked(db.canonicalScopeType.findUnique).mockResolvedValue({ id: CANONICAL_ID } as never);
    vi.mocked(db.projectRow.findFirst).mockResolvedValue({ id: "row-1" } as never);
    vi.mocked(db.projectScopeOverride.upsert).mockResolvedValue({
      id: "ov-1",
      scopeTypeId: SCOPE_TYPE_ID,
      canonicalScopeType: CANONICAL_FIXTURE,
    } as never);
  });

  it("returns 403 when role lacks EDIT_UPM", async () => {
    const { hasPermission } = await import("@/lib/permissions");
    vi.mocked(hasPermission).mockReturnValue(false);
    const res = await makePost({ scopeTypeId: SCOPE_TYPE_ID, canonicalScopeTypeId: CANONICAL_ID });
    expect(res.status).toBe(403);
  });

  it("returns 422 when body is missing required fields", async () => {
    const res = await makePost({ scopeTypeId: SCOPE_TYPE_ID }); // missing canonicalScopeTypeId
    expect(res.status).toBe(422);
  });

  it("returns 404 when scopeType does not exist", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.scopeType.findUnique).mockResolvedValue(null);
    const res = await makePost({ scopeTypeId: SCOPE_TYPE_ID, canonicalScopeTypeId: CANONICAL_ID });
    expect(res.status).toBe(404);
  });

  it("returns 404 when canonicalScopeType does not exist", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.canonicalScopeType.findUnique).mockResolvedValue(null);
    const res = await makePost({ scopeTypeId: SCOPE_TYPE_ID, canonicalScopeTypeId: CANONICAL_ID });
    expect(res.status).toBe(404);
  });

  it("returns 422 when scope type is not used in this project", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findFirst).mockResolvedValue(null);
    const res = await makePost({ scopeTypeId: SCOPE_TYPE_ID, canonicalScopeTypeId: CANONICAL_ID });
    expect(res.status).toBe(422);
  });

  it("upserts override and returns 200 on happy path", async () => {
    const res = await makePost({ scopeTypeId: SCOPE_TYPE_ID, canonicalScopeTypeId: CANONICAL_ID });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      override: { scopeTypeId: string; canonicalScopeType: { displayName: string } };
    };
    expect(data.override.scopeTypeId).toBe(SCOPE_TYPE_ID);
    expect(data.override.canonicalScopeType.displayName).toBe("LVT Stairs");
  });

  it("accepts upsert with empty string canonicalScopeTypeId (should fail validation)", async () => {
    // Empty string canonicalScopeTypeId should fail Zod .min(1) validation
    const res = await makePost({ scopeTypeId: SCOPE_TYPE_ID, canonicalScopeTypeId: "" });
    expect(res.status).toBe(422);
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe("DELETE /api/projects/[id]/scope-overrides/[scopeTypeId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";

    const { hasPermission } = await import("@/lib/permissions");
    vi.mocked(hasPermission).mockReturnValue(true);

    const { db } = await import("@/lib/db");
    vi.mocked(db.projectScopeOverride.deleteMany).mockResolvedValue({ count: 1 } as never);
  });

  it("returns 403 when role lacks EDIT_UPM", async () => {
    const { hasPermission } = await import("@/lib/permissions");
    vi.mocked(hasPermission).mockReturnValue(false);
    const res = await makeDelete(SCOPE_TYPE_ID);
    expect(res.status).toBe(403);
  });

  it("returns 200 and deleted:true when override exists", async () => {
    const res = await makeDelete(SCOPE_TYPE_ID);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { deleted: boolean };
    expect(data.deleted).toBe(true);
  });

  it("returns 200 idempotently when no override existed (count=0)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectScopeOverride.deleteMany).mockResolvedValue({ count: 0 } as never);
    const res = await makeDelete(SCOPE_TYPE_ID);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { deleted: boolean };
    expect(data.deleted).toBe(true);
  });

  it("passes the correct projectId and scopeTypeId to deleteMany", async () => {
    const { db } = await import("@/lib/db");
    await makeDelete(SCOPE_TYPE_ID);
    expect(vi.mocked(db.projectScopeOverride.deleteMany)).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, scopeTypeId: SCOPE_TYPE_ID },
    });
  });
});

// ── Serialization plumbing — serializeUnitRow ─────────────────────────────────

describe("serializeUnitRow — projectScopeOverrides option", () => {
  it("uses project override over global canonical when override map is provided", async () => {
    const { serializeUnitRow } = await import("@/lib/project-units-serialize");
    const overrideCanonical = { id: "cst_new", code: "LVT-S", displayName: "LVT Stairs" };
    const row = {
      id: "row-1",
      projectId: "proj-1",
      rowIndex: 0,
      building: "A",
      level: "1",
      unit: "101",
      area: null,
      shipPhase: null,
      buildPhase: null,
      scheme: null,
      unitType: null,
      description: null,
      scopeType: {
        id: SCOPE_TYPE_ID,
        code: "LVT",
        name: "LVT",
        canonicalScopeType: { id: "cst_global", code: "LVT", displayName: "LVT Flooring" },
      },
      csiPrimeCode: null,
      csiDetailCode: null,
      locationType: null,
      costType: null,
      installer: null,
      unifierSubId: null,
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
    };

    const overrideMap = new Map([[SCOPE_TYPE_ID, overrideCanonical]]);
    const serialized = serializeUnitRow(
      row as never,
      () => ({
        hasIssues: false,
        hasOpenIssues: false,
        hasBlockingIssues: false,
        issueTypes: [],
        responsibleParties: [],
        statuses: [],
        scopeRowIdsWithIssues: [],
        scopeRowIdsWithBlockingIssues: [],
        subScopeInstanceIdsWithIssues: [],
        subScopeInstanceIdsWithBlockingIssues: [],
      }),
      { projectScopeOverrides: overrideMap },
    );

    expect(serialized.scopeType?.canonicalScopeType?.displayName).toBe("LVT Stairs");
  });

  it("falls back to global canonical when no project override exists", async () => {
    const { serializeUnitRow } = await import("@/lib/project-units-serialize");
    const row = {
      id: "row-2",
      projectId: "proj-1",
      rowIndex: 0,
      building: "A",
      level: "1",
      unit: "102",
      area: null,
      shipPhase: null,
      buildPhase: null,
      scheme: null,
      unitType: null,
      description: null,
      scopeType: {
        id: SCOPE_TYPE_ID,
        code: "LVT",
        name: "LVT",
        canonicalScopeType: { id: "cst_global", code: "LVT", displayName: "LVT Flooring" },
      },
      csiPrimeCode: null,
      csiDetailCode: null,
      locationType: null,
      costType: null,
      installer: null,
      unifierSubId: null,
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
    };

    // Empty override map — no override for this scope type
    const serialized = serializeUnitRow(
      row as never,
      () => ({
        hasIssues: false,
        hasOpenIssues: false,
        hasBlockingIssues: false,
        issueTypes: [],
        responsibleParties: [],
        statuses: [],
        scopeRowIdsWithIssues: [],
        scopeRowIdsWithBlockingIssues: [],
        subScopeInstanceIdsWithIssues: [],
        subScopeInstanceIdsWithBlockingIssues: [],
      }),
      { projectScopeOverrides: new Map() },
    );

    expect(serialized.scopeType?.canonicalScopeType?.displayName).toBe("LVT Flooring");
  });

  it("returns null canonical when neither project override nor global canonical exist", async () => {
    const { serializeUnitRow } = await import("@/lib/project-units-serialize");
    const row = {
      id: "row-3",
      projectId: "proj-1",
      rowIndex: 0,
      building: "A",
      level: "1",
      unit: "103",
      area: null,
      shipPhase: null,
      buildPhase: null,
      scheme: null,
      unitType: null,
      description: null,
      scopeType: {
        id: SCOPE_TYPE_ID,
        code: "LVT",
        name: "LVT",
        canonicalScopeType: null, // no global canonical
      },
      csiPrimeCode: null,
      csiDetailCode: null,
      locationType: null,
      costType: null,
      installer: null,
      unifierSubId: null,
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
    };

    const serialized = serializeUnitRow(
      row as never,
      () => ({
        hasIssues: false,
        hasOpenIssues: false,
        hasBlockingIssues: false,
        issueTypes: [],
        responsibleParties: [],
        statuses: [],
        scopeRowIdsWithIssues: [],
        scopeRowIdsWithBlockingIssues: [],
        subScopeInstanceIdsWithIssues: [],
        subScopeInstanceIdsWithBlockingIssues: [],
      }),
      { projectScopeOverrides: new Map() },
    );

    expect(serialized.scopeType?.canonicalScopeType).toBeNull();
  });
});
