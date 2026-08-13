import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    projectRow: { findMany: vi.fn() },
    projectSubScopeInstance: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue("activity-log-id"),
  resolveActorName: vi.fn().mockResolvedValue("Test User"),
  resolveActivityActorName: vi.fn().mockResolvedValue({ actorId: "user1", userName: "Test User" }),
  getActivityReplayMetadata: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/production-project-access", () => ({
  enforceProductionProjectMutation: vi.fn().mockResolvedValue(null),
}));

async function makeRequest(body: unknown) {
  const { POST } = await import("@/app/api/projects/[id]/units/bulk-status/activity/route");
  return POST(
    new Request("http://localhost/api/projects/proj1/units/bulk-status/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj1" }) }
  );
}

describe("POST /api/projects/[id]/units/bulk-status/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const res = await makeRequest({ appliedRowIds: ["r1"], scopeStatus: "COMPLETE" });
    expect(res.status).toBe(401);
  });

  it("returns 422 when both arrays are empty", async () => {
    const res = await makeRequest({
      appliedRowIds: [],
      appliedSubScopeInstanceIds: [],
      scopeStatus: "IN_PROGRESS",
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 when scopeStatus is missing", async () => {
    const res = await makeRequest({ appliedRowIds: ["r1"] });
    expect(res.status).toBe(422);
  });

  it("logs activity and returns ok for valid row IDs", async () => {
    const { db } = await import("@/lib/db");
    const { voidLogFieldActivity } = await import("@/lib/activity/log-field-activity");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([
      { building: "A", level: "1", unit: "101" } as never,
    ]);

    const res = await makeRequest({
      appliedRowIds: ["r1"],
      scopeStatus: "COMPLETE",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(voidLogFieldActivity).toHaveBeenCalled();
  });

  it("logs activity for sub-scope instance IDs (null scopeStage allowed)", async () => {
    const { db } = await import("@/lib/db");
    const { voidLogFieldActivity } = await import("@/lib/activity/log-field-activity");
    vi.mocked(db.projectSubScopeInstance.findMany).mockResolvedValueOnce([
      { row: { building: "B", level: "2", unit: "202" } } as never,
    ]);

    const res = await makeRequest({
      appliedRowIds: [],
      appliedSubScopeInstanceIds: ["inst1"],
      scopeStage: null,
      scopeStatus: "IN_PROGRESS",
    });

    expect(res.status).toBe(200);
    expect(voidLogFieldActivity).toHaveBeenCalled();
  });

  it("returns ok even when all IDs reference no project rows (no matching records)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValueOnce([]);

    const res = await makeRequest({
      appliedRowIds: ["nonexistent"],
      scopeStatus: "BLOCKED",
    });

    expect(res.status).toBe(200);
  });
});
