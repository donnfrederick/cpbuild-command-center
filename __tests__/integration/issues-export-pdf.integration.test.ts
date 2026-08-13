import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { projectIssue: { findMany: vi.fn() } },
}));
vi.mock("@/lib/pdf/issues-pdf", () => ({
  buildIssuesPdf: vi.fn(),
}));

import { POST } from "@/app/api/projects/[id]/issues/export-pdf/route";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { buildIssuesPdf } from "@/lib/pdf/issues-pdf";

const mockGetSession = vi.mocked(getSession);
const mockVis = vi.mocked(enforceProjectReadVisibility);
const mockFindMany = vi.mocked(db.projectIssue.findMany);
const mockBuildPdf = vi.mocked(buildIssuesPdf);

const SESSION = {
  user: { id: "u1", email: "a@test.com", role: "MEMBER", name: "A", specialPermissions: [] as string[] },
};

function postIssuesExport(body: unknown, projectId = "proj-1") {
  return POST(
    new NextRequest(`http://localhost/api/projects/${projectId}/issues/export-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: projectId }) },
  );
}

describe("POST /api/projects/[id]/issues/export-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION as Awaited<ReturnType<typeof getSession>>);
    mockVis.mockResolvedValue(null);
    mockBuildPdf.mockResolvedValue(Buffer.from("pdf"));
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await postIssuesExport({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when issueTypes is not an array", async () => {
    const res = await postIssuesExport({ issueTypes: "PLUMBING" });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("issueTypes");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("accepts responsibleParties filter as catalog string codes", async () => {
    mockFindMany.mockResolvedValueOnce([] as Awaited<ReturnType<typeof db.projectIssue.findMany>>);

    const res = await postIssuesExport({ responsibleParties: ["NOT_A_PARTY"] });
    expect(res.status).toBe(404);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { responsiblePartyCode: { in: ["NOT_A_PARTY"] } },
            { responsiblePartyTags: { some: { partyCode: { in: ["NOT_A_PARTY"] } } } },
          ],
        }),
      }),
    );
  });

  it("returns 400 when scopeNames contains non-strings", async () => {
    const res = await postIssuesExport({ scopeNames: ["Cabinetry", false] });
    expect(res.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("exports specific issues when issueIds is provided", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "issue-a",
        issueTypeCode: "OTHER",
        responsiblePartyCode: "CP_BUILD",
        responsiblePartyTags: [{ partyCode: "CP_BUILD" }],
      },
      {
        id: "issue-b",
        issueTypeCode: "OTHER",
        responsiblePartyCode: "ELECTRICIAN",
        responsiblePartyTags: [{ partyCode: "ELECTRICIAN" }, { partyCode: "PLUMBER" }],
      },
    ] as Awaited<ReturnType<typeof db.projectIssue.findMany>>);

    const res = await postIssuesExport({
      issueIds: ["issue-a", "issue-b"],
      projectName: "Demo",
      sortOrder: "newest",
    });

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "proj-1",
          id: { in: ["issue-a", "issue-b"] },
        }),
      }),
    );
    expect(mockBuildPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ id: "issue-b", responsibleParties: ["ELECTRICIAN", "PLUMBER"] }),
        ]),
      }),
    );
  });

  it("returns 404 when any requested issueId is missing", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "issue-a" },
    ] as Awaited<ReturnType<typeof db.projectIssue.findMany>>);

    const res = await postIssuesExport({ issueIds: ["issue-a", "issue-missing"] });
    expect(res.status).toBe(404);
  });
});
