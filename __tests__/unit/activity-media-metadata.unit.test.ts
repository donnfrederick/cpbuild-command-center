import { describe, it, expect, vi, beforeEach } from "vitest";
import { ACTIVITY_MEDIA_PREVIEWS_KEY } from "@/lib/activity-media-previews";

vi.mock("@/lib/db", () => ({
  db: {
    mediaAttachment: { findMany: vi.fn() },
    inspectionAnswerMedia: { findMany: vi.fn() },
  },
}));

describe("hydrateActivityMediaMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches issue photo previews to ISSUE_CREATED events", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      {
        id: "att1",
        storageUrl: "https://storage.example.com/issue.jpg",
        mimeType: "image/jpeg",
        issueId: "iss1",
      },
    ] as never);
    vi.mocked(db.inspectionAnswerMedia.findMany).mockResolvedValue([]);

    const { hydrateActivityMediaMetadata } = await import("@/lib/activity-media-metadata");

    const [event] = await hydrateActivityMediaMetadata([
      {
        eventType: "ISSUE_CREATED",
        metadata: { issueId: "iss1", shortDescription: "Leak" },
      },
    ] as never);

    const metadata = event.metadata as Record<string, unknown>;
    expect(metadata[ACTIVITY_MEDIA_PREVIEWS_KEY]).toEqual([
      {
        id: "att1",
        storageUrl: "https://storage.example.com/issue.jpg",
        mimeType: "image/jpeg",
      },
    ]);
  });

  it("uses only head observation attachments (excludes superseded versions)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([
      {
        id: "att-v1",
        storageUrl: "https://storage.example.com/v1.jpg",
        mimeType: "image/jpeg",
        observationId: "obs1",
        supersedesId: null,
      },
      {
        id: "att-v2",
        storageUrl: "https://storage.example.com/v2.jpg",
        mimeType: "image/jpeg",
        observationId: "obs1",
        supersedesId: "att-v1",
      },
    ] as never);
    vi.mocked(db.inspectionAnswerMedia.findMany).mockResolvedValue([]);

    const { hydrateActivityMediaMetadata } = await import("@/lib/activity-media-metadata");

    const [event] = await hydrateActivityMediaMetadata([
      {
        eventType: "OBSERVATION_CREATED",
        metadata: { observationId: "obs1", title: "Paint" },
      },
    ] as never);

    const previews = (event.metadata as Record<string, unknown>)[ACTIVITY_MEDIA_PREVIEWS_KEY];
    expect(previews).toEqual([
      {
        id: "att-v2",
        storageUrl: "https://storage.example.com/v2.jpg",
        mimeType: "image/jpeg",
      },
    ]);
  });

  it("leaves events unchanged when no media exists", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.mediaAttachment.findMany).mockResolvedValue([]);
    vi.mocked(db.inspectionAnswerMedia.findMany).mockResolvedValue([]);

    const { hydrateActivityMediaMetadata } = await import("@/lib/activity-media-metadata");

    const input = {
      eventType: "ISSUE_CREATED",
      metadata: { issueId: "iss-empty" },
    } as const;

    const [event] = await hydrateActivityMediaMetadata([input] as never);
    expect(event.metadata).toEqual(input.metadata);
  });
});

describe("readActivityMediaPreviews", () => {
  it("returns parsed image previews from hydrated metadata", async () => {
    const { readActivityMediaPreviews } = await import("@/lib/activity-media-previews");
    const previews = readActivityMediaPreviews({
      mediaPreviews: [
        { id: "a1", storageUrl: "https://example.com/a.jpg", mimeType: "image/jpeg" },
        { id: "a2", storageUrl: "https://example.com/b.mp4", mimeType: "video/mp4" },
      ],
    });
    expect(previews).toHaveLength(1);
    expect(previews[0]?.id).toBe("a1");
  });
});

describe("buildActivityEventDescription UNIT_PHOTO_UPLOADED", () => {
  it("includes source label for status-update photos", async () => {
    const { buildActivityEventDescription } = await import("@/lib/activity-event-summary");
    const text = buildActivityEventDescription({
      eventType: "UNIT_PHOTO_UPLOADED",
      metadata: {
        sourceType: "status_update",
        sourceLabel: "Framing · Completed",
      },
    });
    expect(text).toContain("Framing · Completed");
  });
});
