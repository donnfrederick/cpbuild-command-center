import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/masquerade", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/masquerade")>();
  return {
    ...actual,
    getEffectiveSession: vi.fn(),
  };
});
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
  enforceProductionFieldNotesMutation: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  resolveActorName: vi.fn().mockResolvedValue("Test User"),
  getActivityReplayMetadata: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    projectRow: { findMany: vi.fn() },
    issueTypeCatalog: { findFirst: vi.fn() },
    responsiblePartyCatalog: { findMany: vi.fn() },
    projectIssue: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    issueResponsiblePartyTag: { deleteMany: vi.fn(), createMany: vi.fn() },
    mediaAttachment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const PROJECT = "proj1";
const ISSUE = "iss1";
const CREATOR = "user-creator";
const OTHER = "user-other";

async function patchIssue(body: unknown) {
  const { PATCH } = await import("@/app/api/projects/[id]/issues/[issueId]/route");
  return PATCH(
    new NextRequest(`http://localhost/api/projects/${PROJECT}/issues/${ISSUE}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PROJECT, issueId: ISSUE }) },
  );
}

describe("PATCH /api/projects/[id]/issues/[issueId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    const { getSession } = await import("@/lib/dev-session");
    const { getEffectiveSession } = await import("@/lib/masquerade");
    vi.mocked(getSession).mockResolvedValue({ user: { id: CREATOR, role: "MEMBER" } } as never);
    vi.mocked(getEffectiveSession).mockResolvedValue({ user: { id: CREATOR, role: "MEMBER" } } as never);

    const { db } = await import("@/lib/db");
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: CREATOR } as never);
    vi.mocked(db.$transaction).mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops as Promise<unknown>[]);
      return (ops as (tx: typeof db) => Promise<void>)(db);
    });
    vi.mocked(db.issueTypeCatalog.findFirst).mockImplementation(async ({ where }) => {
      const code = (where as { code: string }).code;
      return { code, requiresVisual: false } as never;
    });
    vi.mocked(db.responsiblePartyCatalog.findMany).mockImplementation(async ({ where }) => {
      const codes = (where as { code: { in: string[] } }).code.in;
      return codes.map((code) => ({ code })) as never;
    });
  });

  it("returns 403 when caller is not creator and not privileged", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst).mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      createdById: OTHER,
      shortDescription: "S",
      unitRef: null,
    } as never);

    const res = await patchIssue({ shortDescription: "New title here for patch" });
    expect(res.status).toBe(403);
  });

  const minimalAnnotation = {
    schemaVersion: 1 as const,
    canvasRef: { width: 400, height: 300 },
    strokes: [
      {
        kind: "stroke" as const,
        color: "#ffffff",
        widthNorm: 0.02,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 },
        ],
      },
    ],
    textItems: [],
  };

  it("updates imageAnnotation on the head attachment", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst)
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        createdById: CREATOR,
        shortDescription: "Leak",
        unitRef: "A|1|101",
      } as never)
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        shortDescription: "Leak",
        unitRef: "A|1|101",
        attachments: [
          {
            id: "att1",
            supersedesId: null,
            storageKey: "k",
            storageUrl: "https://x",
            mimeType: "image/jpeg",
            fileSizeBytes: 1,
            imageAnnotation: minimalAnnotation,
            uploadedBy: { id: CREATOR, name: null, email: "a@b.c" },
            lastMarkedBy: { id: CREATOR, name: null, email: "a@b.c" },
            lastMarkedAt: new Date().toISOString(),
          },
        ],
        createdBy: { id: CREATOR, name: null, email: "a@b.c" },
        resolvedBy: null,
        scopeTags: [],
        subScopeTags: [],
        _count: { comments: 0 },
        comments: [],
      } as never);

    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      { id: "att1", supersedesId: null, mimeType: "image/jpeg" },
    ] as never);

    vi.mocked(db.mediaAttachment.update).mockResolvedValue({} as never);

    const res = await patchIssue({
      updateAttachmentAnnotation: {
        attachmentId: "att1",
        imageAnnotation: minimalAnnotation,
      },
    });

    expect(res.status).toBe(200);
    expect(db.mediaAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "att1", issueId: ISSUE }),
      }),
    );
  });

  it("updates shortDescription without touching attachments", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst)
      .mockResolvedValueOnce({
        id: ISSUE, projectId: PROJECT, createdById: CREATOR, shortDescription: "Old", unitRef: null,
      } as never)
      .mockResolvedValueOnce({
        id: ISSUE, projectId: PROJECT, shortDescription: "New title",
        unitRef: null, attachments: [],
        createdBy: { id: CREATOR, name: null, email: "a@b.c" },
        resolvedBy: null, scopeTags: [], subScopeTags: [],
        _count: { comments: 0 }, comments: [],
      } as never);

    vi.mocked(db.projectIssue.update).mockResolvedValue({} as never);

    const res = await patchIssue({ shortDescription: "New title" });
    expect(res.status).toBe(200);
    expect(db.projectIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ISSUE } }),
    );
    expect(db.mediaAttachment.update).not.toHaveBeenCalled();
  });

  it("replaces responsible party tags when responsibleParties is patched", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst)
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        createdById: CREATOR,
        shortDescription: "S",
        unitRef: null,
        responsiblePartyCode: "CP_BUILD",
      } as never)
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        shortDescription: "S",
        unitRef: null,
        responsiblePartyCode: "ELECTRICIAN",
        attachments: [],
        createdBy: { id: CREATOR, name: null, email: "a@b.c" },
        resolvedBy: null,
        scopeTags: [],
        subScopeTags: [],
        responsiblePartyTags: [{ partyCode: "ELECTRICIAN" }, { partyCode: "PLUMBER" }],
        _count: { comments: 0 },
        comments: [],
      } as never);

    vi.mocked(db.projectIssue.update).mockResolvedValue({} as never);
    vi.mocked(db.issueResponsiblePartyTag.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.issueResponsiblePartyTag.createMany).mockResolvedValue({ count: 2 } as never);

    const res = await patchIssue({
      responsibleParties: ["ELECTRICIAN", "PLUMBER"],
    });

    expect(res.status).toBe(200);
    expect(db.issueResponsiblePartyTag.deleteMany).toHaveBeenCalledWith({
      where: { issueId: ISSUE },
    });
    expect(db.issueResponsiblePartyTag.createMany).toHaveBeenCalledWith({
      data: [
        { issueId: ISSUE, partyCode: "ELECTRICIAN" },
        { issueId: ISSUE, partyCode: "PLUMBER" },
      ],
    });
    expect(db.projectIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responsiblePartyCode: "ELECTRICIAN" }),
      }),
    );
    const body = (await res.json()) as { responsibleParties: string[] };
    expect(body.responsibleParties).toEqual(["ELECTRICIAN", "PLUMBER"]);
  });

  it("returns 403 when privileged non-creator tries to change unitRef", async () => {
    const { getEffectiveSession } = await import("@/lib/masquerade");
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "im-user", role: "INSTALL_MANAGER" },
    } as never);

    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst).mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      createdById: OTHER,
      shortDescription: "S",
      unitRef: "A|1|101",
    } as never);

    const res = await patchIssue({ unitRef: "||" });
    expect(res.status).toBe(403);
    expect(db.projectIssue.update).not.toHaveBeenCalled();
  });

  it("creator can change unitRef to project level", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst)
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        createdById: CREATOR,
        shortDescription: "S",
        unitRef: "A|1|101",
      } as never)
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        shortDescription: "S",
        unitRef: null,
        attachments: [],
        createdBy: { id: CREATOR, name: null, email: "a@b.c" },
        resolvedBy: null,
        scopeTags: [],
        subScopeTags: [],
        _count: { comments: 0 },
        comments: [],
      } as never);

    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.update).mockResolvedValue({} as never);

    const res = await patchIssue({ unitRef: "||" });
    expect(res.status).toBe(200);
    expect(db.projectIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitRef: null,
          scopeRefKeys: [],
        }),
      }),
    );
  });

  const customUnitRef = "@custom|loc-1|Exterior Photos";

  it("allows PATCH with unchanged custom site unitRef", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst)
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        createdById: CREATOR,
        shortDescription: "S",
        unitRef: customUnitRef,
      } as never)
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        shortDescription: "Updated",
        unitRef: customUnitRef,
        attachments: [],
        createdBy: { id: CREATOR, name: null, email: "a@b.c" },
        resolvedBy: null,
        scopeTags: [],
        subScopeTags: [],
        responsiblePartyTags: [],
        _count: { comments: 0 },
        comments: [],
      } as never);

    vi.mocked(db.projectIssue.update).mockResolvedValue({} as never);

    const res = await patchIssue({
      shortDescription: "Updated",
      unitRef: customUnitRef,
      scopeTagIds: [],
    });
    expect(res.status).toBe(200);
    const updateData = vi.mocked(db.projectIssue.update).mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(updateData).not.toHaveProperty("unitRef");
  });

  it("returns 422 when trying to change custom site unitRef on issue", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst).mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      createdById: CREATOR,
      shortDescription: "S",
      unitRef: customUnitRef,
    } as never);

    const res = await patchIssue({ unitRef: "@custom|loc-2|Other area" });
    expect(res.status).toBe(422);
    expect(db.projectIssue.update).not.toHaveBeenCalled();
  });

  it("returns 422 when body contains no changes", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst).mockResolvedValue({
      id: ISSUE, projectId: PROJECT, createdById: CREATOR, shortDescription: "S", unitRef: null,
    } as never);

    const res = await patchIssue({});
    expect(res.status).toBe(422);
  });

  it("rejects annotation update targeting an attachment from a different issue (IDOR)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectIssue.findFirst).mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      createdById: CREATOR,
      shortDescription: "Leak",
      unitRef: null,
    } as never);

    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([]);

    const res = await patchIssue({
      updateAttachmentAnnotation: {
        attachmentId: "att-from-other-issue",
        imageAnnotation: minimalAnnotation,
      },
    });

    expect(res.status).toBe(404);
    expect(db.mediaAttachment.update).not.toHaveBeenCalled();
  });
});
