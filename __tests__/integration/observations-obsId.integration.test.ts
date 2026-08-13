import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/masquerade", () => ({ getEffectiveSession: vi.fn() }));
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
    projectObservation: { findFirst: vi.fn(), update: vi.fn() },
    mediaAttachment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const PROJECT = "proj1";
const OBS = "obs1";
const AUTHOR = "user-author";
const OTHER = "user-other";

async function patchObs(body: unknown) {
  const { PATCH } = await import("@/app/api/projects/[id]/observations/[obsId]/route");
  return PATCH(
    new Request(`http://localhost/api/projects/${PROJECT}/observations/${OBS}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PROJECT, obsId: OBS }) }
  );
}

describe("PATCH /api/projects/[id]/observations/[obsId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    const { getSession } = await import("@/lib/dev-session");
    const { getEffectiveSession } = await import("@/lib/masquerade");
    vi.mocked(getSession).mockResolvedValue({ user: { id: AUTHOR, role: "MEMBER" } } as never);
    vi.mocked(getEffectiveSession).mockResolvedValue({ user: { id: AUTHOR, role: "MEMBER" } } as never);

    const { db } = await import("@/lib/db");
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: AUTHOR } as never);
    vi.mocked(db.$transaction).mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops as Promise<unknown>[]);
      return (ops as (tx: typeof db) => Promise<void>)(db);
    });
  });

  it("returns 403 when caller is not the observation author", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findFirst).mockResolvedValue({
      id: OBS,
      projectId: PROJECT,
      authorId: OTHER,
      title: "T",
    } as never);

    const res = await patchObs({ title: "New" });
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

  it("updates imageAnnotation in place on the head attachment", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findFirst)
      .mockResolvedValueOnce({
        id: OBS,
        projectId: PROJECT,
        authorId: AUTHOR,
      } as never)
      .mockResolvedValueOnce({
        id: OBS,
        projectId: PROJECT,
        authorId: AUTHOR,
        title: "Obs",
        description: "",
        observationTypeCode: "QUALITY",
        unitRef: "B|L|U",
        createdAt: new Date(),
        updatedAt: new Date(),
        author: { id: AUTHOR, name: "A", email: "a@test.com" },
        attachments: [
          {
            id: "att-head",
            storageKey: "k",
            storageUrl: "https://x/img.jpg",
            mimeType: "image/jpeg",
            fileSizeBytes: 100,
            supersedesId: null,
            imageAnnotation: minimalAnnotation,
            lastMarkedById: AUTHOR,
            lastMarkedAt: new Date(),
            caption: null,
            uploadedBy: { id: AUTHOR, name: "A", email: "a@test.com" },
            lastMarkedBy: { id: AUTHOR, name: "A", email: "a@test.com" },
          },
        ],
        scopeTags: [],
        _count: { comments: 0 },
      } as never);

    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      { id: "att-head", supersedesId: null, mimeType: "image/jpeg" },
    ]);
    vi.mocked(db.mediaAttachment.update).mockResolvedValue({} as never);
    vi.mocked(db.projectObservation.update).mockResolvedValue({} as never);

    const res = await patchObs({
      updateAttachmentAnnotation: {
        attachmentId: "att-head",
        imageAnnotation: minimalAnnotation,
      },
    });

    expect(res.status).toBe(200);
    expect(db.mediaAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-head", observationId: OBS },
        data: expect.objectContaining({
          lastMarkedById: AUTHOR,
        }),
      })
    );
  });

  it("updates core fields (title, description) without touching attachments", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findFirst)
      .mockResolvedValueOnce({ id: OBS, projectId: PROJECT, authorId: AUTHOR } as never)
      .mockResolvedValueOnce({
        id: OBS,
        projectId: PROJECT,
        authorId: AUTHOR,
        title: "Updated Title",
        description: "Updated desc",
        observationTypeCode: "QUALITY",
        unitRef: null,
        author: { id: AUTHOR, name: "A", email: "a@test.com" },
        attachments: [],
        scopeTags: [],
        _count: { comments: 0 },
      } as never);

    vi.mocked(db.projectObservation.update).mockResolvedValue({} as never);

    const res = await patchObs({ title: "Updated Title", description: "Updated desc" });
    expect(res.status).toBe(200);
    expect(db.projectObservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: OBS },
        data: expect.objectContaining({ title: "Updated Title", description: "Updated desc" }),
      }),
    );
    expect(db.mediaAttachment.update).not.toHaveBeenCalled();
  });

  it("author can change unitRef and clear scope tags", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findFirst)
      .mockResolvedValueOnce({
        id: OBS,
        projectId: PROJECT,
        authorId: AUTHOR,
        unitRef: "North|L0|N010",
      } as never)
      .mockResolvedValueOnce({
        id: OBS,
        projectId: PROJECT,
        authorId: AUTHOR,
        title: "Obs",
        description: "",
        observationTypeCode: "QUALITY",
        unitRef: "North||",
        author: { id: AUTHOR, name: "A", email: "a@test.com" },
        attachments: [],
        scopeTags: [],
        _count: { comments: 0 },
      } as never);

    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.projectObservation.update).mockResolvedValue({} as never);

    const res = await patchObs({ unitRef: "North||" });
    expect(res.status).toBe(200);
    expect(db.projectObservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: OBS },
        data: expect.objectContaining({
          unitRef: "North||",
          scopeRefKeys: [],
          scopeTags: expect.objectContaining({ deleteMany: {}, create: [] }),
        }),
      }),
    );
  });

  it("returns 422 when scope tags do not match unitRef", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findFirst).mockResolvedValue({
      id: OBS,
      projectId: PROJECT,
      authorId: AUTHOR,
      unitRef: "North|L0|N010",
    } as never);

    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      { id: "row-wrong", building: "South", level: "L1", unit: "X" },
    ] as never);

    const res = await patchObs({
      unitRef: "North|L0|N010",
      scopeTagIds: ["row-wrong"],
    });
    expect(res.status).toBe(422);
    expect(db.projectObservation.update).not.toHaveBeenCalled();
  });

  const customUnitRef = "@custom|loc-1|Exterior Photos";

  it("allows PATCH with unchanged custom site unitRef and new attachments", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findFirst)
      .mockResolvedValueOnce({
        id: OBS,
        projectId: PROJECT,
        authorId: AUTHOR,
        unitRef: customUnitRef,
      } as never)
      .mockResolvedValueOnce({
        id: OBS,
        projectId: PROJECT,
        authorId: AUTHOR,
        title: "Obs",
        description: "",
        observationTypeCode: "QUALITY",
        unitRef: customUnitRef,
        author: { id: AUTHOR, name: "A", email: "a@test.com" },
        attachments: [],
        scopeTags: [],
        _count: { comments: 0 },
      } as never);

    vi.mocked(db.mediaAttachment.createMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([{ id: "att-new", storageKey: "k1" }]);

    const res = await patchObs({
      title: "Obs",
      unitRef: customUnitRef,
      scopeTagIds: [],
      addAttachmentKeys: ["k1"],
      addAttachmentUrls: ["https://x/k1.jpg"],
      addAttachmentMimeTypes: ["image/jpeg"],
      addAttachmentFileSizeBytes: [100],
      addAttachmentCaptions: [""],
    });

    expect(res.status).toBe(200);
    expect(db.projectObservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: OBS },
        data: expect.objectContaining({ title: "Obs" }),
      }),
    );
    const updateData = vi.mocked(db.projectObservation.update).mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(updateData).not.toHaveProperty("unitRef");
    expect(db.mediaAttachment.createMany).toHaveBeenCalled();
  });

  it("returns 422 when trying to change custom site unitRef", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findFirst).mockResolvedValue({
      id: OBS,
      projectId: PROJECT,
      authorId: AUTHOR,
      unitRef: customUnitRef,
    } as never);

    const res = await patchObs({ unitRef: "@custom|loc-2|Other area" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Custom site location cannot be changed here");
    expect(db.projectObservation.update).not.toHaveBeenCalled();
  });

  it("returns 409 when annotation targets a superseded attachment", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findFirst).mockResolvedValue({
      id: OBS,
      projectId: PROJECT,
      authorId: AUTHOR,
    } as never);

    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      { id: "att-old", supersedesId: null, mimeType: "image/jpeg" },
      { id: "att-new", supersedesId: "att-old", mimeType: "image/jpeg" },
    ]);

    const res = await patchObs({
      updateAttachmentAnnotation: {
        attachmentId: "att-old",
        imageAnnotation: minimalAnnotation,
      },
    });

    expect(res.status).toBe(409);
    expect(db.mediaAttachment.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects/[id]/observations/[obsId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    const { getSession } = await import("@/lib/dev-session");
    vi.mocked(getSession).mockResolvedValue({ user: { id: AUTHOR, role: "MEMBER" } } as never);
  });

  it("returns attachment heads only without priorVersions", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findFirst).mockResolvedValue({
      id: OBS,
      projectId: PROJECT,
      author: { id: AUTHOR, name: "A", email: "a@test.com" },
      attachments: [
        {
          id: "old",
          storageKey: "o",
          storageUrl: "https://o",
          mimeType: "image/jpeg",
          fileSizeBytes: 1,
          supersedesId: null,
          lastMarkedById: null,
          lastMarkedAt: null,
          caption: null,
          uploadedBy: { id: AUTHOR, name: "A", email: "a@test.com" },
          lastMarkedBy: null,
        },
        {
          id: "new",
          storageKey: "n",
          storageUrl: "https://n",
          mimeType: "image/jpeg",
          fileSizeBytes: 2,
          supersedesId: "old",
          lastMarkedById: AUTHOR,
          lastMarkedAt: new Date(),
          caption: null,
          uploadedBy: { id: AUTHOR, name: "A", email: "a@test.com" },
          lastMarkedBy: { id: AUTHOR, name: "A", email: "a@test.com" },
        },
      ],
      comments: [],
      _count: { comments: 0 },
    } as never);

    const { GET } = await import("@/app/api/projects/[id]/observations/[obsId]/route");
    const res = await GET(
      new Request(`http://localhost/api/projects/${PROJECT}/observations/${OBS}`),
      { params: Promise.resolve({ id: PROJECT, obsId: OBS }) }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      attachments: Array<{ id: string; priorVersions?: unknown[] }>;
    };
    expect(json.attachments).toHaveLength(1);
    expect(json.attachments[0].id).toBe("new");
    expect(json.attachments[0].priorVersions).toBeUndefined();
  });
});
