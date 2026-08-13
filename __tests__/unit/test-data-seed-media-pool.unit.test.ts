import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    mediaAttachment: { findMany: vi.fn() },
    inspectionAnswerMedia: { findMany: vi.fn() },
    inspectionDeficiencyMedia: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import {
  loadExistingFieldMediaFromDb,
  resolveSeedMediaPool,
  TEST_MEDIA_POOL,
} from "@/lib/test-data-seed/media-pool";

const mockMediaFindMany = vi.mocked(db.mediaAttachment.findMany);
const mockAnswerMediaFindMany = vi.mocked(db.inspectionAnswerMedia.findMany);
const mockDefMediaFindMany = vi.mocked(db.inspectionDeficiencyMedia.findMany);

describe("test-data-seed/media-pool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnswerMediaFindMany.mockResolvedValue([]);
    mockDefMediaFindMany.mockResolvedValue([]);
  });

  it("prefers project-scoped image attachments over bootstrap placeholders", async () => {
    mockMediaFindMany.mockResolvedValueOnce([
      {
        storageKey: "field-media/issues/real-upload-abc.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 120_000,
      },
    ] as Awaited<ReturnType<typeof mockMediaFindMany>>);

    const entries = await loadExistingFieldMediaFromDb("proj-1");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.storageKey).toBe("field-media/issues/real-upload-abc.jpg");
  });

  it("falls back to bootstrap pool when no DB media exists", async () => {
    mockMediaFindMany.mockResolvedValue([]);
    mockAnswerMediaFindMany.mockResolvedValue([]);
    mockDefMediaFindMany.mockResolvedValue([]);

    const ctx = await resolveSeedMediaPool("proj-empty");
    expect(ctx.pool.length).toBeGreaterThanOrEqual(TEST_MEDIA_POOL.length);
    expect(ctx.pool.some((e) => e.storageKey === TEST_MEDIA_POOL[0]!.storageKey)).toBe(true);
  });
});
