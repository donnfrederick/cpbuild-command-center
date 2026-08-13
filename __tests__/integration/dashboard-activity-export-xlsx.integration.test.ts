import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  isTestProjectSquadRole: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/db", () => ({
  db: {
    project: { findMany: vi.fn() },
    activityLog: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/export/activity-xlsx", () => ({
  buildActivityXlsx: vi.fn(),
}));

vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectList: vi.fn(),
}));

import { POST } from "@/app/api/activity/export-xlsx/route";
import { getSession } from "@/lib/dev-session";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { buildActivityXlsx } from "@/lib/export/activity-xlsx";
import { enrichProjectList } from "@/lib/project-unifier-merge";

const mockGetSession = vi.mocked(getSession);
const mockIsSquad = vi.mocked(isTestProjectSquadRole);
const mockProjectFindMany = vi.mocked(db.project.findMany);
const mockActivityFindMany = vi.mocked(db.activityLog.findMany);
const mockBuildXlsx = vi.mocked(buildActivityXlsx);
const mockEnrich = vi.mocked(enrichProjectList);

function setupAccessibleProjects(list: { id: string; name: string }[]) {
  mockProjectFindMany.mockResolvedValue(list.map((p) => ({ id: p.id })) as never);
  mockEnrich.mockResolvedValue(
    list.map((p) => ({ id: p.id, projectName: p.name })) as never,
  );
}

const SESSION_MEMBER = {
  user: {
    id: "user-1",
    email: "alice@example.com",
    role: "MEMBER",
    name: "Alice",
    specialPermissions: [],
  },
};

function makeRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost/api/activity/export-xlsx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeActivity(projectId = "proj-1") {
  return {
    id: "evt-1",
    projectId,
    eventType: "SCOPE_STATUS_UPDATED",
    userId: "user-1",
    userName: "Alice",
    metadata: {},
    createdAt: new Date("2025-01-01T10:00:00Z"),
  };
}

describe("POST /api/activity/export-xlsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSquad.mockReturnValue(false);
    mockBuildXlsx.mockReturnValue(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockBuildXlsx).not.toHaveBeenCalled();
  });

  it("returns 404 when no events match", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);
    mockActivityFindMany.mockResolvedValue([]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(mockBuildXlsx).not.toHaveBeenCalled();
  });

  it("returns an xlsx response with expected headers on success", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Harbor Plaza" }]);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="activity-log-\d+\.xlsx"$/,
    );
    expect(mockBuildXlsx).toHaveBeenCalledOnce();
    const opts = mockBuildXlsx.mock.calls[0][0];
    expect(opts.projectLabelById?.get("proj-1")).toBe("Harbor Plaza");
  });

  it("returns 500 when Excel generation throws", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);
    mockBuildXlsx.mockImplementation(() => {
      throw new Error("xlsx write failed");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Excel generation failed.");

    errorSpy.mockRestore();
  });
});
