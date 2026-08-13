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
const MUTATION_ID = "offline-mutation-obs-1";

const baseBody = {
  offlineMutationId: MUTATION_ID,
  clientQueuedAt: "2026-06-25T10:00:00.000Z",
  mutationType: "create-observation" as const,
  itemSummary: "Observation · S112 · \"Progress note\"",
  unit: "S112",
  building: "South",
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
  const { POST } = await import("@/app/api/projects/[id]/activity/mutation-sync-failed/route");
  return POST(
    new Request(`http://localhost/api/projects/${PROJECT}/activity/mutation-sync-failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PROJECT }) },
  );
}

describe("POST /api/projects/[id]/activity/mutation-sync-failed", () => {
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

  it("creates a MUTATION_SYNC_FAILED activity row", async () => {
    const { logActivity } = await import("@/lib/activity-logger");
    const res = await makePost({
      ...baseBody,
      syncErrors: [syncError(1, "Invalid request (HTTP 400)")],
    });
    expect(res.status).toBe(201);
    expect(logActivity).toHaveBeenCalledWith(
      PROJECT,
      "u1",
      "Tester",
      expect.objectContaining({
        eventType: "MUTATION_SYNC_FAILED",
        offlineMutationId: MUTATION_ID,
        itemSummary: baseBody.itemSummary,
      }),
    );
  });
});
