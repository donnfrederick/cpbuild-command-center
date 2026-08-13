import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
  isTestProjectSquadRole: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/db", () => ({
  db: {
    activityLog: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/export/activity-xlsx", () => ({
  buildActivityXlsx: vi.fn(),
}));

import { POST } from "@/app/api/projects/[id]/activity/export-xlsx/route";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { buildActivityXlsx } from "@/lib/export/activity-xlsx";

const mockGetSession = vi.mocked(getSession);
const mockEnforceRead = vi.mocked(enforceProjectReadVisibility);
const mockActivityFindMany = vi.mocked(db.activityLog.findMany);
const mockBuildXlsx = vi.mocked(buildActivityXlsx);

const SESSION_MEMBER = {
  user: {
    id: "user-1",
    email: "alice@example.com",
    role: "MEMBER",
    name: "Alice",
    specialPermissions: [],
  },
};

const PARAMS = { params: Promise.resolve({ id: "proj-1" }) };

function makeRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost/api/projects/proj-1/activity/export-xlsx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeActivity(overrides: {
  id?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
} = {}) {
  return {
    id: "evt-1",
    projectId: "proj-1",
    eventType: "SCOPE_STATUS_UPDATED",
    userId: "user-1",
    userName: "Alice",
    metadata: { rowId: "row-1", toStage: null, toStatus: "NOT_STARTED" },
    createdAt: new Date("2025-01-01T10:00:00Z"),
    ...overrides,
  };
}

describe("POST /api/projects/[id]/activity/export-xlsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRead.mockResolvedValue(null);
    mockBuildXlsx.mockReturnValue(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest(), PARAMS);
    expect(res.status).toBe(401);
    expect(mockBuildXlsx).not.toHaveBeenCalled();
  });

  it("returns 403 when project read is blocked", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockEnforceRead.mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as never,
    );

    const res = await POST(makeRequest(), PARAMS);
    expect(res.status).toBe(403);
    expect(mockBuildXlsx).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body shape", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    const res = await POST(makeRequest({ eventTypes: "not-an-array" }), PARAMS);
    expect(res.status).toBe(400);
    expect(mockBuildXlsx).not.toHaveBeenCalled();
  });

  it("returns 404 when no events match", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockActivityFindMany.mockResolvedValue([]);

    const res = await POST(makeRequest(), PARAMS);
    expect(res.status).toBe(404);
    expect(mockBuildXlsx).not.toHaveBeenCalled();
  });

  it("returns an xlsx response with expected headers on success", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);

    const res = await POST(makeRequest(), PARAMS);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="activity-log-proj-1-\d+\.xlsx"$/,
    );
    expect(mockBuildXlsx).toHaveBeenCalledOnce();
  });

  it("dedupes burst duplicate events before building xlsx", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockActivityFindMany.mockResolvedValue([
      makeActivity({
        id: "evt-3",
        createdAt: new Date("2026-07-16T20:05:00.000Z"),
      }),
      makeActivity({
        id: "evt-2",
        createdAt: new Date("2026-07-16T20:04:30.000Z"),
      }),
      makeActivity({
        id: "evt-1",
        createdAt: new Date("2026-07-16T20:04:00.000Z"),
      }),
    ] as never);

    const res = await POST(makeRequest(), PARAMS);
    expect(res.status).toBe(200);

    const buildArg = mockBuildXlsx.mock.calls[0]?.[0];
    expect(buildArg?.events).toHaveLength(1);
    expect(buildArg?.events[0]?.id).toBe("evt-3");
  });

  it("returns 500 when Excel generation throws", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);
    mockBuildXlsx.mockImplementation(() => {
      throw new Error("xlsx write failed");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest(), PARAMS);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Excel generation failed.");

    errorSpy.mockRestore();
  });
});
