import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    projectObservation: { findMany: vi.fn() },
    observationComment: { findMany: vi.fn() },
    projectIssue: { findMany: vi.fn() },
    issueComment: { findMany: vi.fn() },
    projectRow: { findMany: vi.fn() },
    inspectionSubmission: { findMany: vi.fn() },
    mediaAttachment: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/lib/production-project-access", () => ({
  enforceProjectReadVisibility: vi.fn().mockResolvedValue(null),
  enforceProductionProjectMutation: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  resolveActivityActorName: vi.fn().mockResolvedValue({ actorId: "user1", userName: "Wayne" }),
}));

const PROJECT_ID = "proj_test";
const UNIT_REF = "BuildingA|1|101";

async function makeGet(unitRef = UNIT_REF) {
  const { GET } = await import("@/app/api/projects/[id]/album/route");
  return GET(
    new Request(`http://localhost/api/projects/${PROJECT_ID}/album?unitRef=${encodeURIComponent(unitRef)}`),
    { params: Promise.resolve({ id: PROJECT_ID }) },
  );
}

async function makePost(body: unknown, unitRef = UNIT_REF) {
  const { POST } = await import("@/app/api/projects/[id]/album/route");
  return POST(
    new Request(`http://localhost/api/projects/${PROJECT_ID}/album?unitRef=${encodeURIComponent(unitRef)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: PROJECT_ID }) },
  );
}

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/projects/[id]/album", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";

    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([]);
    vi.mocked(db.observationComment.findMany).mockResolvedValue([]);
    vi.mocked(db.projectIssue.findMany).mockResolvedValue([]);
    vi.mocked(db.issueComment.findMany).mockResolvedValue([]);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([]);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([]);
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([]);
  });

  it("returns empty items when no photos exist", async () => {
    const res = await makeGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toEqual([]);
  });

  it("returns 400 when unitRef is missing", async () => {
    const { GET } = await import("@/app/api/projects/[id]/album/route");
    const res = await GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/album`),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("aggregates observation attachments into items", async () => {
    const { db } = await import("@/lib/db");
    const fakeAttachment = {
      id: "att1",
      storageUrl: "https://storage.example.com/img.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 100000,
      caption: null,
      createdAt: new Date("2026-01-01T10:00:00Z"),
      supersedesId: null,
    };
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([
      { id: "obs1", title: "Paint issue", attachments: [fakeAttachment] } as never,
    ]);

    const res = await makeGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].source.type).toBe("observation");
    expect(data.items[0].id).toBe("att1");
  });

  it("excludes superseded observation attachments — only shows the head of each version chain", async () => {
    const { db } = await import("@/lib/db");
    const base = {
      storageUrl: "https://storage.example.com/img.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 10000,
      caption: null,
      createdAt: new Date("2026-01-01T10:00:00Z"),
    };
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([
      {
        id: "obs1",
        title: "Paint issue",
        attachments: [
          { ...base, id: "att-v1", supersedesId: null },
          { ...base, id: "att-v2", supersedesId: "att-v1" },
        ],
      } as never,
    ]);

    const res = await makeGet();
    const data = await res.json();
    // Only the head (att-v2 supersedes att-v1, so att-v2 is the head)
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe("att-v2");
  });

  it("excludes non-visual media (audio) from results", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([
      {
        id: "obs2",
        title: null,
        attachments: [
          { id: "aud1", storageUrl: "https://storage.example.com/rec.mp3", mimeType: "audio/mpeg", fileSizeBytes: 50000, caption: null, createdAt: new Date() },
        ],
      } as never,
    ]);

    const res = await makeGet();
    const data = await res.json();
    expect(data.items).toHaveLength(0);
  });

  it("includes standalone album photos with source type 'general'", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      { id: "sa1", storageUrl: "https://storage.example.com/photo.jpg", mimeType: "image/jpeg", fileSizeBytes: 80000, caption: "Lobby", createdAt: new Date("2026-02-01T09:00:00Z") } as never,
    ]);

    const res = await makeGet();
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].source.type).toBe("general");
    expect(data.items[0].caption).toBe("Lobby");
  });

  it("sorts results newest first across sources", async () => {
    const { db } = await import("@/lib/db");
    const old = { id: "a1", storageUrl: "https://s.example.com/old.jpg", mimeType: "image/jpeg", fileSizeBytes: null, caption: null, createdAt: new Date("2026-01-01T00:00:00Z") };
    const fresh = { id: "a2", storageUrl: "https://s.example.com/new.jpg", mimeType: "image/jpeg", fileSizeBytes: null, caption: null, createdAt: new Date("2026-03-01T00:00:00Z") };
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([
      { id: "obs3", title: null, attachments: [old] } as never,
    ]);
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([fresh as never]);

    const res = await makeGet();
    const data = await res.json();
    expect(data.items[0].id).toBe("a2");
    expect(data.items[1].id).toBe("a1");
  });

  it("includes visual media captured during inspections for the location", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectRow.findMany).mockResolvedValue([{ id: "scope-row-1" }] as never);
    vi.mocked(db.inspectionSubmission.findMany).mockResolvedValue([
      {
        id: "submission-1",
        submittedAt: new Date("2026-05-18T12:00:00Z"),
        form: { name: "Clear Inspection" },
        answers: [
          {
            id: "answer-1",
            rawAnswer: {
              capturedFiles: [
                { serverUrl: "https://storage.example.com/inspection.jpg", mimeType: "image/jpeg" },
                { serverUrl: "https://storage.example.com/audio.m4a", mimeType: "audio/mp4" },
              ],
            },
            formVersionQuestion: { title: "Tile quality" },
            deficiencies: [
              {
                id: "def-1",
                description: "Missing grout.",
                media: [
                  {
                    id: "def-media-1",
                    storageUrl: "https://storage.example.com/deficiency.mp4",
                    mimeType: "video/mp4",
                    fileSizeBytes: null,
                    caption: null,
                    createdAt: new Date("2026-05-18T12:05:00Z"),
                  },
                ],
              },
            ],
          },
        ],
      },
    ] as never);

    const res = await makeGet();
    const data = await res.json();

    expect(data.items).toHaveLength(2);
    expect(data.items.map((item: { source: { type: string } }) => item.source.type)).toEqual([
      "inspection",
      "inspection",
    ]);
    expect(data.items.map((item: { storageUrl: string }) => item.storageUrl)).toContain(
      "https://storage.example.com/inspection.jpg"
    );
    expect(data.items.map((item: { storageUrl: string }) => item.storageUrl)).toContain(
      "https://storage.example.com/deficiency.mp4"
    );
  });

  it("includes scopeCodes on observation items when scope ref keys resolve", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.projectObservation.findMany).mockResolvedValue([
      {
        id: "obs1",
        title: "Paint issue",
        scopeRefKeys: ["b|1|101|cab"],
        attachments: [{
          id: "att1",
          storageUrl: "https://storage.example.com/img.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 100000,
          caption: null,
          createdAt: new Date("2026-01-01T10:00:00Z"),
          supersedesId: null,
        }],
      } as never,
    ]);
    vi.mocked(db.projectRow.findMany).mockResolvedValue([
      {
        building: "B",
        level: "1",
        unit: "101",
        description: "CAB",
        scopeType: { code: "CAB" },
      } as never,
    ]);

    const res = await makeGet();
    const data = await res.json();
    expect(data.items[0].source.scopeCodes).toEqual(["CAB"]);
  });

  it("includes scopeCodes on status_update standalone photos from label", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      {
        id: "sa1",
        storageUrl: "https://storage.example.com/photo.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 80000,
        caption: null,
        createdAt: new Date("2026-02-01T09:00:00Z"),
        unitPhotoSourceType: "status_update",
        unitPhotoSourceLabel: "TIL · Completed",
      } as never,
    ]);

    const res = await makeGet();
    const data = await res.json();
    expect(data.items[0].source.scopeCodes).toEqual(["TIL"]);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/projects/[id]/album", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "true";
    process.env.DEV_USER_ROLE = "ADMIN";
  });

  it("creates a standalone album attachment and returns 201", async () => {
    const { db } = await import("@/lib/db");
    const { voidLogFieldActivity } = await import("@/lib/activity/log-field-activity");
    const created = {
      id: "new1",
      storageUrl: "https://storage.example.com/photo.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 200000,
      caption: null,
      createdAt: new Date("2026-04-01T12:00:00Z"),
      captureContext: null,
    };
    vi.mocked(db.mediaAttachment.create).mockResolvedValue(created as never);
    vi.mocked(db.mediaAttachment.findUnique).mockResolvedValue(created as never);

    const res = await makePost({
      storageKey: "album/photo.jpg",
      storageUrl: "https://storage.example.com/photo.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 200000,
      caption: null,
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.item.id).toBe("new1");
    expect(data.item.source.type).toBe("general");

    expect(voidLogFieldActivity).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ user: expect.any(Object) }),
      expect.objectContaining({
        eventType: "UNIT_PHOTO_UPLOADED",
        attachmentId: "new1",
      }),
      expect.objectContaining({ attachmentIds: ["new1"] }),
    );
  });

  it("returns 400 when unitRef is missing", async () => {
    const { POST } = await import("@/app/api/projects/[id]/album/route");
    const res = await POST(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/album`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey: "k", storageUrl: "https://s.example.com/x.jpg", mimeType: "image/jpeg" }),
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects audio files with 400", async () => {
    const res = await makePost({
      storageKey: "audio/rec.mp3",
      storageUrl: "https://storage.example.com/rec.mp3",
      mimeType: "audio/mpeg",
      fileSizeBytes: null,
      caption: null,
    });
    expect(res.status).toBe(400);
  });

  it("accepts null fileSizeBytes (nullable field)", async () => {
    const { db } = await import("@/lib/db");
    const created = {
      id: "new2",
      storageUrl: "https://storage.example.com/img.png",
      mimeType: "image/png",
      fileSizeBytes: null,
      caption: null,
      createdAt: new Date(),
      captureContext: null,
    };
    vi.mocked(db.mediaAttachment.create).mockResolvedValue(created as never);
    vi.mocked(db.mediaAttachment.findUnique).mockResolvedValue(created as never);

    const res = await makePost({
      storageKey: "album/img.png",
      storageUrl: "https://storage.example.com/img.png",
      mimeType: "image/png",
      fileSizeBytes: null,
      caption: null,
    });
    expect(res.status).toBe(201);
  });

  it("returns 401 when not authenticated", async () => {
    process.env.DEV_BYPASS_AUTH = "false";
    const res = await makePost({ storageKey: "k", storageUrl: "https://s.example.com/x.jpg", mimeType: "image/jpeg" });
    expect(res.status).toBe(401);
  });
});
