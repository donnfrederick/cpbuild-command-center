import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { activityWhereNotIn } from "../helpers/activity-where";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
  isTestProjectSquadRole: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    activityLog: { findMany: vi.fn(), count: vi.fn() },
    activityLocationContext: { findMany: vi.fn(), create: vi.fn() },
    mediaCaptureContext: { findMany: vi.fn() },
    mediaAttachment: { findMany: vi.fn() },
    inspectionAnswerMedia: { findMany: vi.fn() },
  },
}));

const PROJECT = "proj1";

function makeGet(params: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/projects/${PROJECT}/activity`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return import("@/app/api/projects/[id]/activity/route").then(({ GET }) =>
    GET(new NextRequest(url), { params: Promise.resolve({ id: PROJECT }) }),
  );
}

function makeOptions() {
  return import("@/app/api/projects/[id]/activity/route").then(({ OPTIONS }) =>
    OPTIONS(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/activity`),
      { params: Promise.resolve({ id: PROJECT }) },
    ),
  );
}

const MEMBER_SESSION = { user: { id: "u1", role: "MEMBER" } };
const ADMIN_SESSION = { user: { id: "u2", role: "ADMIN" } };

describe("GET /api/projects/[id]/activity", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    const { getSession } = await import("@/lib/dev-session");
    const { isTestProjectSquadRole } = await import("@/lib/production-project-access");
    const { db } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(MEMBER_SESSION as never);
    vi.mocked(isTestProjectSquadRole).mockReturnValue(false);
    vi.mocked(db.activityLog.count).mockResolvedValue(0);
    vi.mocked(db.activityLocationContext.findMany).mockResolvedValue([]);
    vi.mocked(db.mediaCaptureContext.findMany).mockResolvedValue([]);
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([]);
    vi.mocked(db.inspectionAnswerMedia.findMany).mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await makeGet();
    expect(res.status).toBe(401);
  });

  it("returns events array and nextCursor: null when under the limit", async () => {
    const { db } = await import("@/lib/db");
    const event = {
      id: "ev1",
      eventType: "ISSUE_CREATED",
      projectId: PROJECT,
      userId: "u1",
      userName: "Alice",
      metadata: { issueId: "iss1" },
      createdAt: new Date("2026-04-01T10:00:00Z"),
    };
    vi.mocked(db.activityLog.findMany).mockResolvedValue([event] as never);
    vi.mocked(db.activityLog.count).mockResolvedValue(1);
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      {
        id: "att1",
        storageUrl: "https://storage.example.com/issue.jpg",
        mimeType: "image/jpeg",
        issueId: "iss1",
      },
    ] as never);

    const res = await makeGet();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toHaveLength(1);
    expect(json.nextCursor).toBeNull();
    expect(json.totalCount).toBe(1);
    expect(json.events[0].metadata.mediaPreviews).toEqual([
      {
        id: "att1",
        storageUrl: "https://storage.example.com/issue.jpg",
        mimeType: "image/jpeg",
      },
    ]);
  });

  it("sets nextCursor when result count exceeds limit", async () => {
    const { db } = await import("@/lib/db");
    // limit defaults to 50; return 51 rows to trigger pagination
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `ev${i}`,
      eventType: "ISSUE_CREATED",
      projectId: PROJECT,
      userId: "u1",
      userName: "Alice",
      metadata: {},
      createdAt: new Date(Date.now() - i * 1000),
    }));
    vi.mocked(db.activityLog.findMany).mockResolvedValue(rows as never);
    vi.mocked(db.activityLog.count).mockResolvedValue(120);

    const res = await makeGet();
    const json = await res.json();
    expect(json.events).toHaveLength(50);
    expect(json.nextCursor).not.toBeNull();
    expect(json.totalCount).toBe(120);
  });

  it("returns 400 for invalid query params (bad datetime)", async () => {
    const res = await makeGet({ dateFrom: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("filters out FIELD_MEDIA_UPLOAD_RATE_LIMITED for non-privileged roles", async () => {
    const { db } = await import("@/lib/db");
    const { isTestProjectSquadRole } = await import("@/lib/production-project-access");
    vi.mocked(isTestProjectSquadRole).mockReturnValue(false);
    vi.mocked(db.activityLog.findMany).mockResolvedValue([] as never);

    await makeGet({ eventType: "FIELD_MEDIA_UPLOAD_RATE_LIMITED" });

    // When the only requested event type is the security event and the caller
    // cannot see it, the handler returns early with empty events without querying.
    expect(db.activityLog.findMany).not.toHaveBeenCalled();
  });

  it("allows FIELD_MEDIA_UPLOAD_RATE_LIMITED for ADMIN", async () => {
    const { getSession } = await import("@/lib/dev-session");
    const { isTestProjectSquadRole } = await import("@/lib/production-project-access");
    const { db } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue(ADMIN_SESSION as never);
    vi.mocked(isTestProjectSquadRole).mockReturnValue(true);
    vi.mocked(db.activityLog.findMany).mockResolvedValue([] as never);

    await makeGet({ eventType: "FIELD_MEDIA_UPLOAD_RATE_LIMITED" });

    expect(db.activityLog.findMany).toHaveBeenCalled();
    const call = vi.mocked(db.activityLog.findMany).mock.calls[0][0] as {
      where?: { eventType?: { in?: string[] } };
    };
    expect(call.where?.eventType?.in).toContain("FIELD_MEDIA_UPLOAD_RATE_LIMITED");
  });

  it("excludes FIELD_MEDIA_UPLOAD_RATE_LIMITED from unfiltered results for non-privileged roles", async () => {
    const { db } = await import("@/lib/db");
    const { isTestProjectSquadRole } = await import("@/lib/production-project-access");
    vi.mocked(isTestProjectSquadRole).mockReturnValue(false);
    vi.mocked(db.activityLog.findMany).mockResolvedValue([] as never);

    await makeGet();

    // Route now uses notIn with all excluded types (hidden markup events + security event for
    // non-privileged roles). FIELD_MEDIA_UPLOAD_RATE_LIMITED must be in that exclusion list.
    const call = vi.mocked(db.activityLog.findMany).mock.calls[0][0] as {
      where?: Record<string, unknown>;
    };
    const notIn = activityWhereNotIn(call.where);
    expect(notIn).toContain("FIELD_MEDIA_UPLOAD_RATE_LIMITED");
    expect(notIn).toContain("CLEAR_INSPECTION_SET");
    expect(notIn).toContain("CLEAR_INSPECTION_DELETED");
  });

  it("returns empty when filtering only hidden legacy clear toggle events", async () => {
    const { db } = await import("@/lib/db");
    const res = await makeGet({ eventType: "CLEAR_INSPECTION_SET" });
    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[] };
    expect(body.events).toHaveLength(0);
    expect(db.activityLog.findMany).not.toHaveBeenCalled();
  });

  it("applies building, level, and unit filters to activity metadata", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.activityLog.findMany).mockResolvedValue([] as never);

    await makeGet({ building: "North", level: "02", unit: "N0201" });

    expect(db.activityLog.findMany).toHaveBeenCalled();
    const call = vi.mocked(db.activityLog.findMany).mock.calls[0][0] as {
      where?: { OR?: unknown[] };
    };
    expect(call.where?.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          AND: expect.arrayContaining([
            { metadata: { path: ["building"], equals: "North" } },
            { metadata: { path: ["level"], equals: "02" } },
            { metadata: { path: ["unit"], equals: "N0201" } },
          ]),
        }),
        { metadata: { path: ["unitRef"], string_contains: "North|02|N0201" } },
        { metadata: { path: ["unitRefs"], array_contains: { building: "North", level: "02", unit: "N0201" } } },
      ]),
    );
  });

  it("returns empty events when no activity exists", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.activityLog.findMany).mockResolvedValue([] as never);

    const res = await makeGet();
    const json = await res.json();
    expect(json.events).toEqual([]);
    expect(json.nextCursor).toBeNull();
  });
});

describe("OPTIONS /api/projects/[id]/activity", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(MEMBER_SESSION as never);
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await makeOptions();
    expect(res.status).toBe(401);
  });

  it("returns distinct user list for the project", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.activityLog.findMany).mockResolvedValue([
      { userId: "u1", userName: "Alice" },
      { userId: "u2", userName: null },
    ] as never);

    const res = await makeOptions();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.users).toHaveLength(2);
    expect(json.users[0]).toEqual({ id: "u1", name: "Alice" });
    expect(json.users[1]).toEqual({ id: "u2", name: "u2" });
  });
});
