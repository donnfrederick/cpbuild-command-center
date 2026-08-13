import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProductionProjectMutation: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db", () => ({
  db: {
    project: { findUnique: vi.fn() },
    activityLog: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/lib/api-logger", () => ({
  logApi: vi.fn(),
  apiTimer: () => () => 0,
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
  resolveActivityActorName: vi.fn().mockResolvedValue({ actorId: "u1", userName: "Tester" }),
}));

const PROJECT = "proj1";
const MUTATION_ID = "offline-mutation-1";

const baseBody = {
  offlineMutationId: MUTATION_ID,
  clientQueuedAt: "2026-06-25T10:00:00.000Z",
  formName: "Clear Inspection",
  category: "CLEAR_INSPECTION",
  outcome: "PASS" as const,
  unit: "101",
  building: "A",
  level: "1",
};

function syncError(attempt: number, message: string) {
  return {
    attempt,
    message,
    errorKind: "retriable" as const,
    recordedAt: `2026-06-25T10:0${attempt - 1}:00.000Z`,
  };
}

async function makePost(body: unknown) {
  const { POST } = await import("@/app/api/projects/[id]/activity/inspection-sync-failed/route");
  return POST(
    new Request(`http://localhost/api/projects/${PROJECT}/activity/inspection-sync-failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PROJECT }) },
  );
}

describe("POST /api/projects/[id]/activity/inspection-sync-failed", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    const { getSession } = await import("@/lib/dev-session");
    const { db } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    vi.mocked(db.project.findUnique).mockResolvedValue({ id: PROJECT } as never);
    vi.mocked(db.activityLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.activityLog.update).mockResolvedValue({ id: "log-1" } as never);
    vi.mocked(db.activityLog.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "log-1" } as never);
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await makePost({ ...baseBody, syncErrors: [syncError(1, "fail")] });
    expect(res.status).toBe(401);
  });

  it("returns 422 when syncErrors is empty", async () => {
    const res = await makePost({ ...baseBody, syncErrors: [] });
    expect(res.status).toBe(422);
  });

  it("creates on first POST and updates same row on subsequent POSTs", async () => {
    const { db } = await import("@/lib/db");
    const { logActivity } = await import("@/lib/activity-logger");

    vi.mocked(db.activityLog.findFirst)
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "log-1" } as never)
      .mockResolvedValueOnce({ id: "log-1" } as never)
      .mockResolvedValueOnce({ id: "log-1" } as never);

    const first = await makePost({
      ...baseBody,
      syncErrors: [syncError(1, "first failure")],
    });
    expect(first.status).toBe(201);
    const firstJson = await first.json();
    expect(firstJson.created).toBe(true);
    expect(logActivity).toHaveBeenCalledTimes(1);

    const second = await makePost({
      ...baseBody,
      syncErrors: [syncError(1, "first failure"), syncError(2, "second failure")],
    });
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.updated).toBe(true);
    expect(secondJson.id).toBe("log-1");
    expect(db.activityLog.update).toHaveBeenCalledTimes(1);
    const updateArg = vi.mocked(db.activityLog.update).mock.calls[0]?.[0];
    const metadata = updateArg?.data?.metadata as { syncErrors: Array<{ attempt: number }> };
    expect(metadata.syncErrors).toHaveLength(2);
    expect(logActivity).toHaveBeenCalledTimes(1);

    const third = await makePost({
      ...baseBody,
      syncErrors: [
        syncError(1, "first failure"),
        syncError(2, "second failure"),
        syncError(3, "third failure"),
      ],
    });
    expect(third.status).toBe(200);
    expect(db.activityLog.update).toHaveBeenCalledTimes(2);
    expect(logActivity).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when project does not exist", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.project.findUnique).mockResolvedValue(null);
    const res = await makePost({ ...baseBody, syncErrors: [syncError(1, "fail")] });
    expect(res.status).toBe(404);
  });

  it("accepts body with omitted optional scopeRowId and scopeName", async () => {
    const { db } = await import("@/lib/db");
    const { logActivity } = await import("@/lib/activity-logger");
    vi.mocked(db.activityLog.findFirst)
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "log-new" } as never);
    vi.mocked(logActivity).mockClear();

    const res = await makePost({
      offlineMutationId: "offline-mutation-optional-scope",
      clientQueuedAt: "2026-06-25T10:00:00.000Z",
      formName: "Clear Inspection",
      category: "CLEAR_INSPECTION",
      outcome: "PASS",
      unit: "101",
      building: "A",
      level: "1",
      syncErrors: [syncError(1, "network error")],
    });
    expect(res.status).toBe(201);
    expect(logActivity).toHaveBeenCalledTimes(1);
  });
});
