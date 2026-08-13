import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
  isTestProjectSquadRole: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/geo/project-site-geocode", () => ({
  resolveProjectSiteGeocode: vi.fn().mockResolvedValue({
    siteLocation: "123 Main",
    latitude: 40,
    longitude: -105,
    available: true,
    geocodeStatus: "SUCCESS",
  }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    activityLog: { findMany: vi.fn() },
    activityLocationContext: { findMany: vi.fn() },
    mediaCaptureContext: { findMany: vi.fn() },
    mediaAttachment: { findMany: vi.fn() },
    inspectionAnswerMedia: { findMany: vi.fn() },
  },
}));

const PROJECT = "proj-heatmap";

describe("GET /api/projects/[id]/activity/heatmap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue(null);
    const { GET } = await import("@/app/api/projects/[id]/activity/heatmap/route");
    const res = await GET(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/activity/heatmap`),
      { params: Promise.resolve({ id: PROJECT }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated user lacks location tracking permission", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u1", role: "MEMBER" } } as never);
    const { GET } = await import("@/app/api/projects/[id]/activity/heatmap/route");
    const res = await GET(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/activity/heatmap`),
      { params: Promise.resolve({ id: PROJECT }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns coverage summary for mixed location outcomes", async () => {
    process.env.DEV_BYPASS_AUTH = "true";
    const { getSession } = await import("@/lib/dev-session");
    const { db } = await import("@/lib/db");
    vi.mocked(getSession).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);

    vi.mocked(db.activityLog.findMany).mockResolvedValue([
      {
        id: "log-1",
        projectId: PROJECT,
        userId: "u1",
        userName: "Alice",
        eventType: "SCOPE_STATUS_UPDATED",
        metadata: { rowId: "r1" },
        createdAt: new Date("2026-07-25T12:00:00.000Z"),
      },
      {
        id: "log-2",
        projectId: PROJECT,
        userId: "u1",
        userName: "Alice",
        eventType: "ISSUE_CREATED",
        metadata: { issueId: "iss-1" },
        createdAt: new Date("2026-07-25T12:05:00.000Z"),
      },
    ] as never);

    vi.mocked(db.activityLocationContext.findMany).mockResolvedValue([
      {
        activityLogId: "log-1",
        gpsStatus: "GRANTED",
        latitude: 40.1,
        longitude: -105.1,
        distanceFromProjectMeters: 50,
        source: "ACTIVITY_CAPTURE",
      },
      {
        activityLogId: "log-2",
        gpsStatus: "DENIED",
        latitude: null,
        longitude: null,
        distanceFromProjectMeters: null,
        source: "ACTIVITY_CAPTURE",
      },
    ] as never);

    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([]);
    vi.mocked(db.inspectionAnswerMedia.findMany).mockResolvedValue([]);

    const { GET } = await import("@/app/api/projects/[id]/activity/heatmap/route");
    const res = await GET(
      new NextRequest(`http://localhost/api/projects/${PROJECT}/activity/heatmap`),
      { params: Promise.resolve({ id: PROJECT }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.coverage.totalActivities).toBe(2);
    expect(json.coverage.onMapCount).toBe(1);
    expect(json.coverage.byOutcome.denied).toBe(1);
    expect(json.mapPoints).toHaveLength(1);
    expect(json.points).toHaveLength(1);
  });
});
