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
    observationTypeCatalog: { findFirst: vi.fn() },
    projectObservation: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const BASE_URL = "http://localhost/api/projects/proj1";

async function postBulk(body: unknown) {
  const { POST } = await import("@/app/api/projects/[id]/observations/bulk/route");
  return POST(
    new Request(`${BASE_URL}/observations/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj1" }) }
  );
}

describe("POST /api/projects/[id]/observations/bulk", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findFirst).mockResolvedValue({ id: "proj1", deletedAt: null, isTestProject: false } as never);
    vi.mocked(db.observationTypeCatalog.findFirst).mockImplementation(async ({ where }) => {
      const code = (where as { code: string }).code;
      const activeCodes = new Set(["QUALITY", "PROGRESS", "SAFETY", "OTHER"]);
      return activeCodes.has(code) ? ({ code } as never) : (null as never);
    });
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const res = await postBulk({
      units: [{ unitRef: "A|1|101", scopeRowIds: [] }],
      observationType: "QUALITY",
    });
    expect(res.status).toBe(401);
  });

  it("returns 422 when units array is empty", async () => {
    const res = await postBulk({ units: [], observationType: "QUALITY" });
    expect(res.status).toBe(422);
  });

  it("returns 422 when observationType is missing", async () => {
    const res = await postBulk({
      units: [{ unitRef: "A|1|101", scopeRowIds: [] }],
      // missing observationType
    });
    expect(res.status).toBe(422);
  });

  it("creates one observation per unit with a shared bulkGroupId", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.$transaction).mockResolvedValue([
      { id: "obs1" }, { id: "obs2" }, { id: "obs3" },
    ] as never);

    const res = await postBulk({
      units: [
        { unitRef: "A|1|101", scopeRowIds: [] },
        { unitRef: "A|1|102", scopeRowIds: [] },
        { unitRef: "A|1|103", scopeRowIds: [] },
      ],
      title: "Water staining",
      description: "Noticed during walkthrough",
      observationType: "QUALITY",
    });

    expect(res.status).toBe(201);
    const data = await res.json() as { created: number; bulkGroupId: string };
    expect(data.created).toBe(3);
    expect(typeof data.bulkGroupId).toBe("string");
    expect(data.bulkGroupId.length).toBeGreaterThan(0);
  });

  it("accepts observations with null/empty title and description — Unifier-style optional fields", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user1" } as never);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.$transaction).mockResolvedValue([{ id: "obs1" }] as never);

    const res = await postBulk({
      units: [{ unitRef: "A|1|101", scopeRowIds: [] }],
      title: "",
      description: "",
      observationType: "PROGRESS",
    });
    expect(res.status).toBe(201);
  });

  it("validates scope row IDs belong to the project", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: "user1" } as never);
    // findMany returns only 1 of the 2 requested rows
    vi.mocked(db.projectRow.findMany).mockResolvedValue([{ id: "row1" }] as never);

    const res = await postBulk({
      units: [{ unitRef: "A|1|101", scopeRowIds: ["row1", "row-bogus"] }],
      observationType: "SAFETY",
    });
    expect(res.status).toBe(404);
  });
});
