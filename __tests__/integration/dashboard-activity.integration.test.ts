import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { activityWhereNotIn } from "../helpers/activity-where";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  isTestProjectSquadRole: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/db", () => ({
  db: {
    project: { findMany: vi.fn() },
    activityLog: { findMany: vi.fn(), count: vi.fn() },
    activityLocationContext: { findMany: vi.fn(), create: vi.fn() },
    mediaCaptureContext: { findMany: vi.fn() },
    mediaAttachment: { findMany: vi.fn() },
    inspectionAnswerMedia: { findMany: vi.fn() },
  },
}));

import { GET } from "@/app/api/activity/route";
import { getSession } from "@/lib/dev-session";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { db } from "@/lib/db";

const mockGetSession = vi.mocked(getSession);
const mockIsSquad = vi.mocked(isTestProjectSquadRole);
const mockProjectFindMany = vi.mocked(db.project.findMany);
const mockActivityFindMany = vi.mocked(db.activityLog.findMany);
const mockActivityCount = vi.mocked(db.activityLog.count);

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/activity");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

function makeActivity(overrides: Partial<{
  id: string;
  projectId: string;
  eventType: string;
  userId: string | null;
  userName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? "evt-1",
    projectId: overrides.projectId ?? "proj-1",
    eventType: overrides.eventType ?? "SCOPE_STATUS_UPDATED",
    userId: overrides.userId ?? "user-1",
    userName: overrides.userName ?? "Alice",
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? new Date("2025-01-01T10:00:00Z"),
  };
}

const SESSION_MEMBER = {
  user: { id: "user-1", email: "alice@example.com", role: "MEMBER", name: "Alice", specialPermissions: [] },
};

const SESSION_ADMIN = {
  user: { id: "admin-1", email: "admin@example.com", role: "ADMIN", name: "Admin", specialPermissions: [] },
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSquad.mockReturnValue(false);
    mockActivityCount.mockResolvedValue(0);
    vi.mocked(db.activityLocationContext.findMany).mockResolvedValue([]);
    vi.mocked(db.mediaCaptureContext.findMany).mockResolvedValue([]);
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([]);
    vi.mocked(db.inspectionAnswerMedia.findMany).mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  it("returns empty events when user has no accessible projects", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[]; nextCursor: null; totalCount: number };
    expect(body.events).toHaveLength(0);
    expect(body.nextCursor).toBeNull();
    expect(body.totalCount).toBe(0);
  });

  it("returns events from all accessible projects", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }, { id: "proj-2" }] as never);
    const event1 = makeActivity({ id: "evt-1", projectId: "proj-1" });
    const event2 = makeActivity({ id: "evt-2", projectId: "proj-2" });
    mockActivityFindMany.mockResolvedValue([event1, event2] as never);
    mockActivityCount.mockResolvedValue(2);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json() as { events: typeof event1[]; nextCursor: null; totalCount: number };
    expect(body.events).toHaveLength(2);
    expect(body.nextCursor).toBeNull();
    expect(body.totalCount).toBe(2);
  });

  it("scopes to a specific projectId when requested (legacy single-id param)", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }, { id: "proj-2" }] as never);
    const event = makeActivity({ id: "evt-1", projectId: "proj-1" });
    mockActivityFindMany.mockResolvedValue([event] as never);

    const res = await GET(makeRequest({ projectId: "proj-1" }));
    expect(res.status).toBe(200);

    // Verify the DB query used the scoped project ID
    const callArgs = mockActivityFindMany.mock.calls[0][0] as { where: { projectId: { in: string[] } } };
    expect(callArgs.where.projectId.in).toEqual(["proj-1"]);
  });

  it("scopes to multiple projectIds (comma-separated) when requested", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue(
      [{ id: "proj-1" }, { id: "proj-2" }, { id: "proj-3" }] as never
    );
    mockActivityFindMany.mockResolvedValue([] as never);

    const res = await GET(makeRequest({ projectIds: "proj-1,proj-3" }));
    expect(res.status).toBe(200);

    const callArgs = mockActivityFindMany.mock.calls[0][0] as {
      where: { projectId: { in: string[] } };
    };
    expect(callArgs.where.projectId.in).toEqual(["proj-1", "proj-3"]);
  });

  it("silently drops inaccessible IDs from projectIds rather than leaking existence", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }, { id: "proj-2" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    // "proj-secret" is not in the accessible set — it must not appear in the
    // DB query, but the presence of "proj-1" means the request still runs.
    const res = await GET(makeRequest({ projectIds: "proj-1,proj-secret" }));
    expect(res.status).toBe(200);

    const callArgs = mockActivityFindMany.mock.calls[0][0] as {
      where: { projectId: { in: string[] } };
    };
    expect(callArgs.where.projectId.in).toEqual(["proj-1"]);
  });

  it("trims whitespace and ignores empty entries in projectIds", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }, { id: "proj-2" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    const res = await GET(makeRequest({ projectIds: " proj-1 , ,proj-2 " }));
    expect(res.status).toBe(200);

    const callArgs = mockActivityFindMany.mock.calls[0][0] as {
      where: { projectId: { in: string[] } };
    };
    expect(callArgs.where.projectId.in).toEqual(["proj-1", "proj-2"]);
  });

  it("returns empty when projectIds contains only inaccessible IDs", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);

    const res = await GET(makeRequest({ projectIds: "proj-secret,proj-other" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(body.events).toHaveLength(0);
    expect(mockActivityFindMany).not.toHaveBeenCalled();
  });

  it("treats empty projectIds string as no filter (all accessible projects)", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }, { id: "proj-2" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(makeRequest({ projectIds: "" }));

    const callArgs = mockActivityFindMany.mock.calls[0][0] as {
      where: { projectId: { in: string[] } };
    };
    expect(callArgs.where.projectId.in).toEqual(["proj-1", "proj-2"]);
  });

  it("projectIds takes precedence over legacy projectId when both are provided", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue(
      [{ id: "proj-1" }, { id: "proj-2" }, { id: "proj-3" }] as never
    );
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(makeRequest({ projectIds: "proj-2,proj-3", projectId: "proj-1" }));

    const callArgs = mockActivityFindMany.mock.calls[0][0] as {
      where: { projectId: { in: string[] } };
    };
    expect(callArgs.where.projectId.in).toEqual(["proj-2", "proj-3"]);
  });

  it("returns empty when projectId is not in accessible projects", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);

    const res = await GET(makeRequest({ projectId: "proj-other" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[] };
    expect(body.events).toHaveLength(0);
    // DB should not have been called since scopedIds is empty
    expect(mockActivityFindMany).not.toHaveBeenCalled();
  });

  it("excludes test projects for non-squad users", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockIsSquad.mockReturnValue(false);
    mockProjectFindMany.mockResolvedValue([] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(makeRequest());

    const projectQuery = mockProjectFindMany.mock.calls[0][0] as { where: { isTestProject?: boolean; deletedAt: null } };
    expect(projectQuery.where.isTestProject).toBe(false);
  });

  it("includes test projects for squad users", async () => {
    mockGetSession.mockResolvedValue(SESSION_ADMIN as never);
    mockIsSquad.mockReturnValue(true);
    mockProjectFindMany.mockResolvedValue([] as never);

    await GET(makeRequest());

    const projectQuery = mockProjectFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(projectQuery.where.isTestProject).toBeUndefined();
  });

  it("applies dateFrom and dateTo to the DB query", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(makeRequest({
      dateFrom: "2025-01-01T00:00:00.000Z",
      dateTo: "2025-01-31T23:59:59.999Z",
    }));

    const activityQuery = mockActivityFindMany.mock.calls[0][0] as {
      where: { createdAt: { gte: Date; lte: Date } };
    };
    expect(activityQuery.where.createdAt.gte).toEqual(new Date("2025-01-01T00:00:00.000Z"));
    expect(activityQuery.where.createdAt.lte).toEqual(new Date("2025-01-31T23:59:59.999Z"));
  });

  it("paginates with cursor and nextCursor", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);
    // Return limit+1 = 3 events (limit defaults to 50, use limit=2 here)
    const events = [
      makeActivity({ id: "evt-1", createdAt: new Date("2025-01-03T10:00:00Z") }),
      makeActivity({ id: "evt-2", createdAt: new Date("2025-01-02T10:00:00Z") }),
      makeActivity({ id: "evt-3", createdAt: new Date("2025-01-01T10:00:00Z") }),
    ];
    mockActivityFindMany.mockResolvedValue(events as never);

    const res = await GET(makeRequest({ limit: "2" }));
    const body = await res.json() as { events: typeof events; nextCursor: string };
    expect(body.events).toHaveLength(2);
    expect(body.nextCursor).toBe("2025-01-02T10:00:00.000Z");
  });

  it("returns nextCursor=null when no more events", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);

    const res = await GET(makeRequest({ limit: "10" }));
    const body = await res.json() as { nextCursor: null };
    expect(body.nextCursor).toBeNull();
  });

  it("filters out hidden annotation events", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(makeRequest());

    const activityQuery = mockActivityFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    const notIn = activityWhereNotIn(activityQuery.where);
    expect(notIn).toContain("ISSUE_ANNOTATION_UPDATED");
    expect(notIn).toContain("OBSERVATION_ANNOTATION_UPDATED");
    expect(notIn).toContain("OBSERVATION_IMAGE_VERSION_ADDED");
    expect(notIn).toContain("CLEAR_INSPECTION_SET");
    expect(notIn).toContain("CLEAR_INSPECTION_DELETED");
  });

  it("filters out FIELD_MEDIA_UPLOAD_RATE_LIMITED for non-squad users", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockIsSquad.mockReturnValue(false);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(makeRequest());

    const activityQuery = mockActivityFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(activityWhereNotIn(activityQuery.where)).toContain(
      "FIELD_MEDIA_UPLOAD_RATE_LIMITED",
    );
  });

  it("allows FIELD_MEDIA_UPLOAD_RATE_LIMITED for squad users", async () => {
    mockGetSession.mockResolvedValue(SESSION_ADMIN as never);
    mockIsSquad.mockReturnValue(true);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(makeRequest());

    const activityQuery = mockActivityFindMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(activityWhereNotIn(activityQuery.where)).not.toContain(
      "FIELD_MEDIA_UPLOAD_RATE_LIMITED",
    );
  });

  it("filters by comma-separated eventType param server-side", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(
      makeRequest({
        eventType: "INSPECTION_SUBMITTED,INSPECTION_BACKFILL_SET",
      })
    );

    const activityQuery = mockActivityFindMany.mock.calls[0][0] as {
      where: { eventType: { in: string[] } };
    };
    expect(activityQuery.where.eventType.in).toEqual([
      "INSPECTION_SUBMITTED",
      "INSPECTION_BACKFILL_SET",
    ]);
  });

  it("returns empty when eventType filter only requests hidden legacy clear toggles", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);

    const res = await GET(makeRequest({ eventType: "CLEAR_INSPECTION_SET" }));

    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[]; nextCursor: null };
    expect(body.events).toHaveLength(0);
    expect(body.nextCursor).toBeNull();
    expect(mockActivityFindMany).not.toHaveBeenCalled();
  });

  it("filters by locationOutcome param server-side when caller has location:view", async () => {
    mockGetSession.mockResolvedValue(SESSION_ADMIN as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(makeRequest({ locationOutcome: "denied,timeout" }));

    const activityQuery = mockActivityFindMany.mock.calls[0][0] as {
      where: { OR: Array<{ locationContext: { gpsStatus: string } }> };
    };
    expect(activityQuery.where.OR).toEqual([
      { locationContext: { gpsStatus: "DENIED" } },
      { locationContext: { gpsStatus: "TIMEOUT" } },
    ]);
  });

  it("ignores locationOutcome param when caller lacks location:view", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockProjectFindMany.mockResolvedValue([{ id: "proj-1" }] as never);
    mockActivityFindMany.mockResolvedValue([] as never);

    await GET(makeRequest({ locationOutcome: "denied,timeout" }));

    const activityQuery = mockActivityFindMany.mock.calls[0][0] as {
      where: { OR: Array<{ locationContext?: { gpsStatus: string } }> };
    };
    expect(activityQuery.where.OR).not.toEqual([
      { locationContext: { gpsStatus: "DENIED" } },
      { locationContext: { gpsStatus: "TIMEOUT" } },
    ]);
  });
});
