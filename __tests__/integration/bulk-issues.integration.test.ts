import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    project: { findFirst: vi.fn() },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    projectRow: {
      findMany: vi.fn(),
    },
    issueTypeCatalog: { findFirst: vi.fn() },
    responsiblePartyCatalog: { findMany: vi.fn() },
    projectIssue: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    issueComment: {
      create: vi.fn(),
    },
    mediaAttachment: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE_URL = "http://localhost/api/projects/proj1";

async function postBulk(body: unknown) {
  const { POST } = await import("@/app/api/projects/[id]/issues/bulk/route");
  return POST(
    new Request(`${BASE_URL}/issues/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj1" }) }
  );
}

async function postResolve(issueId: string, body: unknown) {
  const { POST } = await import(
    "@/app/api/projects/[id]/issues/[issueId]/resolve/route"
  );
  return POST(
    new Request(`${BASE_URL}/issues/${issueId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj1", issueId }) }
  );
}

// ── POST /issues/bulk ─────────────────────────────────────────────────────────

describe("POST /api/projects/[id]/issues/bulk", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "proj1", deletedAt: null, isTestProject: false } as never);
    vi.mocked(db.issueTypeCatalog.findFirst).mockImplementation(async ({ where }) => {
      const code = (where as { code: string }).code;
      const catalog: Record<string, { code: string; requiresVisual: boolean }> = {
        SUBSTRATE_CONDITION: { code: "SUBSTRATE_CONDITION", requiresVisual: false },
        MISSING_MATERIALS: { code: "MISSING_MATERIALS", requiresVisual: false },
        DAMAGED_MATERIALS: { code: "DAMAGED_MATERIALS", requiresVisual: true },
      };
      return (catalog[code] ?? null) as never;
    });
    vi.mocked(db.responsiblePartyCatalog.findMany).mockImplementation(async ({ where }) => {
      const codes = (where as { code: { in: string[] } }).code.in;
      return codes.map((code) => ({ code })) as never;
    });
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const res = await postBulk({
      units: [{ unitRef: "A|1|101", scopeRowIds: [] }],
      shortDescription: "Test",
      issueType: "SUBSTRATE_CONDITION",
      responsibleParty: "CP_BUILD",
    });
    expect(res.status).toBe(401);
  });

  it("returns 422 when units array is empty", async () => {
    const res = await postBulk({
      units: [],
      shortDescription: "Test",
      issueType: "SUBSTRATE_CONDITION",
      responsibleParty: "CP_BUILD",
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 when required fields are missing", async () => {
    const res = await postBulk({
      units: [{ unitRef: "A|1|101", scopeRowIds: [] }],
      // missing shortDescription, issueType, responsibleParty
    });
    expect(res.status).toBe(422);
  });

  it("creates one issue per unit with a shared bulkGroupId", async () => {
    const { db } = await import("@/lib/db");

    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    const mockCreated = [{ id: "issue1" }, { id: "issue2" }];
    vi.mocked(db.$transaction).mockResolvedValue(mockCreated as never);

    const res = await postBulk({
      units: [
        { unitRef: "A|1|101", scopeRowIds: [] },
        { unitRef: "A|1|102", scopeRowIds: [] },
      ],
      shortDescription: "Substrate damage",
      issueType: "SUBSTRATE_CONDITION",
      responsibleParty: "CP_BUILD",
      isBlockingWork: false,
    });

    expect(res.status).toBe(201);
    const data = await res.json() as { created: number; bulkGroupId: string };
    expect(data.created).toBe(2);
    expect(typeof data.bulkGroupId).toBe("string");
    expect(data.bulkGroupId.length).toBeGreaterThan(0);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("accepts units with null/empty scopeRowIds — Unifier-style missing scope data", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.$transaction).mockResolvedValue([{ id: "issue1" }] as never);

    const res = await postBulk({
      units: [{ unitRef: "A|1|101", scopeRowIds: [] }],
      shortDescription: "x",
      issueType: "MISSING_MATERIALS",
      responsibleParty: "ELECTRICIAN",
    });
    expect(res.status).toBe(201);
  });

  it("validates scope row IDs belong to the project", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user1" } as never);
    // Only one of the two rows is found (the other belongs to a different project)
    vi.mocked(db.projectRow.findMany).mockResolvedValue([{ id: "row1" }] as never);

    const res = await postBulk({
      units: [{ unitRef: "A|1|101", scopeRowIds: ["row1", "row-other"] }],
      shortDescription: "x",
      issueType: "SUBSTRATE_CONDITION",
      responsibleParty: "CP_BUILD",
    });
    expect(res.status).toBe(404);
  });

  it("creates bulk issues with multiple responsible parties per issue", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.create).mockImplementation(
      (args) => Promise.resolve({ id: "issue1", ...args }) as never,
    );
    vi.mocked(db.$transaction).mockImplementation(async (ops) => {
      if (Array.isArray(ops)) return Promise.all(ops as Promise<unknown>[]);
      return (ops as (tx: typeof db) => Promise<unknown>)(db);
    });

    const res = await postBulk({
      units: [{ unitRef: "A|1|101", scopeRowIds: [] }],
      shortDescription: "Multi trade",
      issueType: "SUBSTRATE_CONDITION",
      responsibleParties: ["ELECTRICIAN", "PLUMBER"],
    });

    expect(res.status).toBe(201);
    expect(db.projectIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responsiblePartyCode: "ELECTRICIAN",
          responsiblePartyTags: {
            create: [{ partyCode: "ELECTRICIAN" }, { partyCode: "PLUMBER" }],
          },
        }),
      }),
    );
  });
});

// ── POST /issues/[issueId]/resolve ────────────────────────────────────────────

describe("POST /api/projects/[id]/issues/[issueId]/resolve", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "proj1", deletedAt: null, isTestProject: false } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const res = await postResolve("issue1", {});
    expect(res.status).toBe(401);
  });

  it("returns 404 when issue not found", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst).mockResolvedValue(null);

    const res = await postResolve("issue1", {});
    expect(res.status).toBe(404);
  });

  it("returns 409 when issue is already resolved", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst).mockResolvedValue({
      id: "issue1", status: "RESOLVED", createdById: "user1", bulkGroupId: null,
    } as never);

    const res = await postResolve("issue1", {});
    expect(res.status).toBe(409);
  });

  it("resolves a single issue and returns resolvedCount=1", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst)
      .mockResolvedValueOnce({ id: "issue1", status: "OPEN", createdById: "dev-user", bulkGroupId: null } as never)
      .mockResolvedValueOnce({ id: "issue1", status: "RESOLVED", resolvedBy: { id: "dev-user", name: "Phil", email: "p@x.com" }, comments: [] } as never);
    vi.mocked(db.$transaction).mockResolvedValue([{}] as never);

    const res = await postResolve("issue1", { resolutionNote: "Fixed it." });
    expect(res.status).toBe(200);
    const data = await res.json() as { resolvedCount: number };
    expect(data.resolvedCount).toBe(1);
  });

  it("group-resolves all OPEN issues sharing the same bulkGroupId", async () => {
    const { db } = await import("@/lib/db");
    const groupId = "group-abc";

    vi.mocked(db.projectIssue.findFirst)
      .mockResolvedValueOnce({ id: "issue1", status: "OPEN", createdById: "dev-user", bulkGroupId: groupId } as never)
      .mockResolvedValueOnce({ id: "issue1", status: "RESOLVED", resolvedBy: null, comments: [] } as never);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([
      { id: "issue1" }, { id: "issue2" }, { id: "issue3" },
    ] as never);
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}] as never);

    const res = await postResolve("issue1", { resolveGroup: true });
    expect(res.status).toBe(200);
    const data = await res.json() as { resolvedCount: number };
    expect(data.resolvedCount).toBe(3);
    // Transaction should have been called (updates + optional comments)
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("stores resolution note and attaches resolution photos on resolve", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst)
      .mockResolvedValueOnce({
        id: "issue1",
        status: "OPEN",
        createdById: "user1",
        bulkGroupId: null,
        shortDescription: "Leak",
        unitRef: "A|1|101",
      } as never)
      .mockResolvedValueOnce({
        id: "issue1",
        status: "RESOLVED",
        resolutionNote: "Sealed the pipe",
        resolvedBy: { id: "user1", name: "Phil", email: "p@x.com" },
        attachments: [{ id: "att1", storageUrl: "https://cdn.example/photo.jpg" }],
        comments: [],
      } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user1" } as never);
    vi.mocked(db.$transaction).mockResolvedValue([{}, {}] as never);

    const res = await postResolve("issue1", {
      resolutionNote: "Sealed the pipe",
      attachmentKeys: ["issues/proj1/key.jpg"],
      attachmentUrls: ["https://cdn.example/photo.jpg"],
      attachmentMimeTypes: ["image/jpeg"],
      attachmentFileSizeBytes: [12345],
    });

    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const txArg = vi.mocked(db.$transaction).mock.calls[0]?.[0] as unknown[];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg.length).toBeGreaterThan(1);
  });
});
