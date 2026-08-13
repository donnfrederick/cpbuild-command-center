import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/session-db-user", () => ({
  resolveSessionToDbUserId: vi.fn(async (user: { id: string }) => user.id),
}));
vi.mock("@/lib/production-project-access", () => ({
  enforceProductionProjectMutation: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db", () => ({
  db: {
    projectRow: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    inspectionSubmission: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    clearInspection: {
      upsert: vi.fn(),
    },
    inspectionType: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "insp_type_clear" }),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
  resolveActorName: vi.fn().mockResolvedValue("Test User"),
}));

const ADMIN_SESSION = {
  user: { id: "user-1", role: "ADMIN" },
};

async function makePost(
  body: unknown,
  params: { id: string; rowId: string } = { id: "proj-1", rowId: "scope-1" }
) {
  const { POST } = await import(
    "@/app/api/projects/[id]/units/[rowId]/backfill-inspection/route"
  );
  return POST(
    new Request(
      `http://localhost/api/projects/${params.id}/units/${params.rowId}/backfill-inspection`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    { params: Promise.resolve(params) }
  );
}

describe("POST /api/projects/[id]/units/[rowId]/backfill-inspection", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(ADMIN_SESSION as never);

    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findFirst).mockResolvedValue({
      id: "scope-1",
      building: "North",
      level: "1",
      unit: "N010",
      scopeType: { name: "Tile" },
    } as never);
    vi.mocked(db.inspectionSubmission.findFirst).mockResolvedValue(null);
    vi.mocked(db.inspectionSubmission.findUnique).mockResolvedValue({
      id: "sub-new",
      source: "BACKFILL",
      outcome: "PASS",
      clearInspection: { inspectedById: "user-1", inspectedBy: { id: "user-1", name: "Test User" } },
    } as never);
    vi.mocked(db.inspectionSubmission.create).mockResolvedValue({
      id: "sub-new",
      source: "BACKFILL",
      outcome: "PASS",
    } as never);
    vi.mocked(db.clearInspection.upsert).mockResolvedValue({ id: "clear-1" } as never);
    vi.mocked(db.projectRow.update).mockResolvedValue({} as never);

    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      if (typeof fn === "function") {
        return fn({
          inspectionSubmission: {
            create: vi.mocked(db.inspectionSubmission.create),
            update: vi.mocked(db.inspectionSubmission.update),
          },
          projectRow: { update: vi.mocked(db.projectRow.update) },
          clearInspection: { upsert: vi.mocked(db.clearInspection.upsert) },
          inspectionType: { findUniqueOrThrow: vi.mocked(db.inspectionType.findUniqueOrThrow) },
        } as never);
      }
      return Promise.all(fn as Promise<unknown>[]);
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const res = await makePost({ outcome: "PASS" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_UNIT_STATUS", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: "user-1", role: "MEMBER" },
    } as never);

    const res = await makePost({ outcome: "PASS" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when scope row is missing", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findFirst).mockResolvedValueOnce(null);

    const res = await makePost({ outcome: "PASS" });
    expect(res.status).toBe(404);
  });

  it("creates backfill submission and clear_inspection history in one transaction", async () => {
    const { db } = await import("@/lib/db");

    const res = await makePost({ outcome: "PASS", note: "Procore 2024" });

    expect(res.status).toBe(201);
    expect(vi.mocked(db.$transaction)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.inspectionSubmission.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "BACKFILL",
          scopeRowId: "scope-1",
          outcome: "PASS",
          payload: { note: "Procore 2024" },
        }),
      })
    );
    expect(vi.mocked(db.clearInspection.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inspectionSubmissionId: "sub-new" },
        create: expect.objectContaining({
          rowId: "scope-1",
          inspectionTypeId: "insp_type_clear",
          inspectedById: "user-1",
        }),
      })
    );
    expect(vi.mocked(db.projectRow.update)).toHaveBeenCalledWith({
      where: { id: "scope-1" },
      data: { inspectionStatus: "PASSED" },
    });
  });

  it("returns 409 when a form-based inspection already exists", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.inspectionSubmission.findFirst).mockImplementation(async (args) => {
      const where = (args as { where?: { source?: string } }).where;
      if (where?.source === "FORM") {
        return { id: "form-sub-1" } as never;
      }
      return null;
    });

    const res = await makePost({ outcome: "FAIL" });
    expect(res.status).toBe(409);
  });
});

async function makeDelete(
  params: { id: string; rowId: string } = { id: "proj-1", rowId: "scope-1" }
) {
  const { DELETE } = await import(
    "@/app/api/projects/[id]/units/[rowId]/backfill-inspection/route"
  );
  return DELETE(
    new Request(
      `http://localhost/api/projects/${params.id}/units/${params.rowId}/backfill-inspection`,
      { method: "DELETE" }
    ),
    { params: Promise.resolve(params) }
  );
}

describe("DELETE /api/projects/[id]/units/[rowId]/backfill-inspection", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(ADMIN_SESSION as never);

    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findFirst).mockResolvedValue({
      building: "North",
      level: "1",
      unit: "N010",
      scopeType: { name: "Countertops" },
    } as never);
    vi.mocked(db.inspectionSubmission.findFirst).mockResolvedValue(null);
    vi.mocked(db.inspectionSubmission.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.projectRow.updateMany).mockResolvedValue({ count: 1 } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const res = await makeDelete();
    expect(res.status).toBe(401);
  });

  it("clears backfill submission and inspectionStatus", async () => {
    const { db } = await import("@/lib/db");

    const res = await makeDelete();

    expect(res.status).toBe(200);
    expect(vi.mocked(db.inspectionSubmission.deleteMany)).toHaveBeenCalledWith({
      where: { scopeRowId: "scope-1", source: "BACKFILL", projectId: "proj-1" },
    });
    expect(vi.mocked(db.projectRow.updateMany)).toHaveBeenCalledWith({
      where: { id: "scope-1", projectId: "proj-1" },
      data: { inspectionStatus: null },
    });
  });

  it("returns 409 when a form-based inspection exists", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.inspectionSubmission.findFirst).mockResolvedValueOnce({
      id: "form-sub-1",
    } as never);

    const res = await makeDelete();
    expect(res.status).toBe(409);
  });
});
