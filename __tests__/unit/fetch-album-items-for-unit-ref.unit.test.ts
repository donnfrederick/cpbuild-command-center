import { describe, it, expect, vi } from "vitest";
import { fetchAlbumItemsForUnitRef } from "@/lib/media/fetch-album-items-for-unit-ref";

function emptyFindMany() {
  return vi.fn().mockResolvedValue([]);
}

describe("fetchAlbumItemsForUnitRef", () => {
  it("does not request captureContext on inspection deficiency media", async () => {
    const inspectionSubmission = {
      findMany: vi.fn().mockResolvedValue([]),
    };
    const projectRow = {
      findMany: vi.fn().mockResolvedValue([
        { id: "row-1", scopeType: { code: "CAB" } },
      ]),
    };

    const db = {
      projectObservation: { findMany: emptyFindMany() },
      observationComment: { findMany: emptyFindMany() },
      projectIssue: { findMany: emptyFindMany() },
      issueComment: { findMany: emptyFindMany() },
      mediaAttachment: { findMany: emptyFindMany() },
      projectRow,
      inspectionSubmission,
    };

    await fetchAlbumItemsForUnitRef(
      db as Parameters<typeof fetchAlbumItemsForUnitRef>[0],
      "proj-1",
      "1|1|100.2",
    );

    expect(inspectionSubmission.findMany).toHaveBeenCalledTimes(1);
    const select = inspectionSubmission.findMany.mock.calls[0]?.[0]?.select;
    const mediaSelect = select?.answers?.select?.deficiencies?.select?.media?.select;
    expect(mediaSelect).toBeDefined();
    expect(mediaSelect).not.toHaveProperty("captureContext");
  });

  it("includes captureContext on MediaAttachment album selects", async () => {
    const mediaAttachment = {
      findMany: vi.fn().mockResolvedValue([]),
    };

    const db = {
      projectObservation: { findMany: emptyFindMany() },
      observationComment: { findMany: emptyFindMany() },
      projectIssue: { findMany: emptyFindMany() },
      issueComment: { findMany: emptyFindMany() },
      mediaAttachment,
      projectRow: { findMany: emptyFindMany() },
      inspectionSubmission: { findMany: emptyFindMany() },
    };

    await fetchAlbumItemsForUnitRef(
      db as Parameters<typeof fetchAlbumItemsForUnitRef>[0],
      "proj-1",
      "1|1|100.2",
    );

    expect(mediaAttachment.findMany).toHaveBeenCalledTimes(1);
    const select = mediaAttachment.findMany.mock.calls[0]?.[0]?.select;
    expect(select).toHaveProperty("captureContext", true);
  });
});
