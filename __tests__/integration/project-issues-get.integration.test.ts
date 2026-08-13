import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db", () => ({
  db: {
    projectIssue: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";

const PROJECT = "proj-get-issues";

async function getIssues(query = "") {
  const { GET } = await import("@/app/api/projects/[id]/issues/route");
  return GET(
    new NextRequest(`http://localhost/api/projects/${PROJECT}/issues${query}`),
    { params: Promise.resolve({ id: PROJECT }) },
  );
}

describe("GET /api/projects/[id]/issues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user-1", email: "admin@cp.build", role: "ADMIN" },
    } as never);
    vi.mocked(db.projectIssue.groupBy).mockResolvedValue([] as never);
  });

  it("returns issueType and responsibleParty aliases for UI clients", async () => {
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([
      {
        id: "issue-1",
        projectId: PROJECT,
        unitRef: "1|12|1218",
        shortDescription: "Gap at backsplash",
        issueTypeCode: "SUBSTRATE_CONDITION",
        responsiblePartyCode: "CP_BUILD",
        isBlockingWork: false,
        status: "OPEN",
        createdAt: new Date("2026-07-23T12:00:00Z"),
        bulkGroupId: null,
        createdBy: { id: "user-1", name: "Alice", email: "alice@cp.build" },
        resolvedBy: null,
        attachments: [],
        scopeTags: [],
        subScopeTags: [],
        responsiblePartyTags: [{ partyCode: "CP_BUILD" }],
        _count: { comments: 0 },
      },
    ] as never);

    const res = await getIssues("?unitRef=1%7C12%7C1218");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      issues: Array<{ issueType?: string; issueTypeCode?: string; responsibleParty?: string }>;
    };
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0]?.issueType).toBe("SUBSTRATE_CONDITION");
    expect(body.issues[0]?.responsibleParty).toBe("CP_BUILD");
  });
});
