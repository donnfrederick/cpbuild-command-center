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
    activityLog: { findMany: vi.fn() },
  },
}));

// Mock the PDF builder so these tests stay fast and don't spin up headless Chrome.
vi.mock("@/lib/pdf/activity-pdf", () => ({
  buildActivityPdf: vi.fn(),
}));

// Mock the Unifier enrichment so names come through without hitting the
// Unifier PDS during unit-level integration runs.
vi.mock("@/lib/project-unifier-merge", () => ({
  enrichProjectList: vi.fn(),
}));

import { POST } from "@/app/api/activity/export-pdf/route";
import { getSession } from "@/lib/dev-session";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { buildActivityPdf } from "@/lib/pdf/activity-pdf";
import { enrichProjectList } from "@/lib/project-unifier-merge";

const mockGetSession = vi.mocked(getSession);
const mockIsSquad = vi.mocked(isTestProjectSquadRole);
const mockProjectFindMany = vi.mocked(db.project.findMany);
const mockActivityFindMany = vi.mocked(db.activityLog.findMany);
const mockBuildPdf = vi.mocked(buildActivityPdf);
const mockEnrich = vi.mocked(enrichProjectList);

/**
 * Shape the project mock so both `db.project.findMany` and the downstream
 * `enrichProjectList` return parallel values. In production the route runs:
 *   rows = await db.project.findMany(...)
 *   enriched = await enrichProjectList(rows)
 * For tests we preserve that contract: `findMany` returns rows with ids, and
 * `enrichProjectList` projects them to `{ id, projectName }` so the route's
 * label map contains the friendly name.
 */
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

type ExportBody = {
  eventTypes?: string[];
  projectIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  filterSummary?: string;
  scopeLabel?: string;
};

function makeRequest(body: ExportBody = {}): NextRequest {
  return new NextRequest("http://localhost/api/activity/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeActivity(
  overrides: Partial<{
    id: string;
    projectId: string;
    eventType: string;
    userId: string | null;
    userName: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }> = {},
) {
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

describe("POST /api/activity/export-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSquad.mockReturnValue(false);
    // A tiny non-empty buffer is enough for tests.
    mockBuildPdf.mockResolvedValue(Buffer.from([0x25, 0x50, 0x44, 0x46])); // %PDF
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it("returns 404 when the user has no accessible projects", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed body", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);

    const req = new NextRequest("http://localhost/api/activity/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // eventTypes must be array of strings; pass a number array to fail Zod.
      body: JSON.stringify({ eventTypes: [123] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it("returns 404 when no events match the filters", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);
    mockActivityFindMany.mockResolvedValue([]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(mockBuildPdf).not.toHaveBeenCalled();
  });

  it("scopes the query to accessible projects only (drops inaccessible IDs silently)", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([
      { id: "proj-1", name: "Project 1" },
      { id: "proj-2", name: "Project 2" },
    ]);
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ projectId: "proj-1" }),
    ] as never);

    const res = await POST(
      makeRequest({ projectIds: ["proj-1", "proj-999-not-accessible"] }),
    );
    expect(res.status).toBe(200);

    const whereArg = mockActivityFindMany.mock.calls[0][0]?.where as
      | { projectId?: { in?: string[] } }
      | undefined;
    expect(whereArg?.projectId?.in).toEqual(["proj-1"]);
  });

  it("returns 404 when all requested project IDs are inaccessible", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);

    const res = await POST(makeRequest({ projectIds: ["proj-other"] }));
    expect(res.status).toBe(404);
    expect(mockActivityFindMany).not.toHaveBeenCalled();
  });

  it("excludes hidden markup/annotation event types from the query", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const whereArg = mockActivityFindMany.mock.calls[0][0]?.where as
      | Record<string, unknown>
      | undefined;
    const notIn = activityWhereNotIn(whereArg);
    // Non-squad callers: the four always-hidden types are excluded.
    expect(notIn).toContain("ISSUE_ANNOTATION_UPDATED");
    expect(notIn).toContain("OBSERVATION_ANNOTATION_UPDATED");
    expect(notIn).toContain("OBSERVATION_IMAGE_VERSION_ADDED");
    expect(notIn).toContain("FIELD_MEDIA_UPLOAD_RATE_LIMITED");
  });

  it("does not exclude FIELD_MEDIA_UPLOAD_RATE_LIMITED for squad roles", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    mockIsSquad.mockReturnValue(true);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);

    await POST(makeRequest());

    const whereArg = mockActivityFindMany.mock.calls[0][0]?.where as
      | Record<string, unknown>
      | undefined;
    const notIn = activityWhereNotIn(whereArg);
    expect(notIn).not.toContain("FIELD_MEDIA_UPLOAD_RATE_LIMITED");
  });

  it("filters to the explicit eventTypes list (excluding hidden ones)", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);

    await POST(
      makeRequest({
        eventTypes: [
          "SCOPE_STATUS_UPDATED",
          "ISSUE_ANNOTATION_UPDATED", // hidden — should be dropped
          "not-a-real-event-type",     // invalid — should be dropped
        ],
      }),
    );

    const whereArg = mockActivityFindMany.mock.calls[0][0]?.where as
      | { eventType?: { in?: string[] } }
      | undefined;
    expect(whereArg?.eventType?.in).toEqual(["SCOPE_STATUS_UPDATED"]);
  });

  it("passes dateFrom/dateTo into the Prisma where clause", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);

    const dateFrom = "2025-01-01T00:00:00.000Z";
    const dateTo = "2025-01-31T23:59:59.999Z";
    await POST(makeRequest({ dateFrom, dateTo }));

    const whereArg = mockActivityFindMany.mock.calls[0][0]?.where as
      | { createdAt?: { gte?: Date; lte?: Date } }
      | undefined;
    expect(whereArg?.createdAt?.gte?.toISOString()).toBe(dateFrom);
    expect(whereArg?.createdAt?.lte?.toISOString()).toBe(dateTo);
  });

  it("returns a PDF response with the expected headers on success", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);

    const res = await POST(makeRequest({ scopeLabel: "All Projects" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="activity-log-\d+\.pdf"$/,
    );
  });

  it("builds a projectLabelById map covering every project in the result set (names from Unifier enrichment)", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([
      { id: "proj-1", name: "Harbor Plaza" },
      { id: "proj-2", name: "Westfield Tower" },
    ]);
    mockActivityFindMany.mockResolvedValue([
      makeActivity({ id: "evt-a", projectId: "proj-1" }),
      makeActivity({ id: "evt-b", projectId: "proj-2" }),
      makeActivity({ id: "evt-c", projectId: "proj-1" }), // dup — must not re-add
    ] as never);

    await POST(makeRequest({ scopeLabel: "All Projects", filterSummary: "fs" }));

    expect(mockBuildPdf).toHaveBeenCalledOnce();
    const opts = mockBuildPdf.mock.calls[0][0];
    expect(opts.projectName).toBe("All Projects");
    expect(opts.filterSummary).toBe("fs");
    expect(opts.projectLabelById).toBeInstanceOf(Map);
    expect(opts.projectLabelById?.get("proj-1")).toBe("Harbor Plaza");
    expect(opts.projectLabelById?.get("proj-2")).toBe("Westfield Tower");
    expect(opts.projectLabelById?.size).toBe(2);
  });

  it("returns 500 when PDF generation throws", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([{ id: "proj-1", name: "Project 1" }]);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);
    mockBuildPdf.mockRejectedValue(new Error("puppeteer launch failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("PDF generation failed.");

    errorSpy.mockRestore();
  });

  it("scopes to all accessible projects when projectIds is omitted", async () => {
    mockGetSession.mockResolvedValue(SESSION_MEMBER as never);
    setupAccessibleProjects([
      { id: "proj-1", name: "Project 1" },
      { id: "proj-2", name: "Project 2" },
      { id: "proj-3", name: "Project 3" },
    ]);
    mockActivityFindMany.mockResolvedValue([makeActivity()] as never);

    await POST(makeRequest());

    const whereArg = mockActivityFindMany.mock.calls[0][0]?.where as
      | { projectId?: { in?: string[] } }
      | undefined;
    expect(whereArg?.projectId?.in).toEqual(
      expect.arrayContaining(["proj-1", "proj-2", "proj-3"]),
    );
    expect(whereArg?.projectId?.in).toHaveLength(3);
  });
});
