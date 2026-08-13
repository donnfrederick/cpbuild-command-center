import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

const mockGetBlob = vi.fn();
const mockDeleteBlob = vi.fn();
const mockStoreBlob = vi.fn();

vi.mock("@/lib/offline/blob-store", () => ({
  getBlob: (...args: unknown[]) => mockGetBlob(...args),
  deleteBlob: (...args: unknown[]) => mockDeleteBlob(...args),
  storeBlob: (...args: unknown[]) => mockStoreBlob(...args),
  storeBlobVerified: vi.fn(async (file: File) => {
    const id = await mockStoreBlob(file);
    const blob = await mockGetBlob(id);
    if (!blob || blob.size === 0) {
      await mockDeleteBlob(id);
      throw new Error("BlobStoreVerificationError");
    }
    return id;
  }),
}));

beforeEach(() => {
  mockDeleteBlob.mockResolvedValue(undefined);
});

vi.mock("@/lib/offline/snapshot-patch", () => ({
  patchOfflineSnapshot: vi.fn().mockResolvedValue(undefined),
}));

describe("status-photo-queue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDeleteBlob.mockResolvedValue(undefined);
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("cc-offline-queue");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  it("parseStatusPhotoMutation extracts project, unitRef, and labels", async () => {
    const { parseStatusPhotoMutation } = await import("@/lib/offline/status-photo-queue");
    const ctx = parseStatusPhotoMutation({
      id: "1",
      type: "link-status-album-photo",
      url: "/api/projects/p1/album?unitRef=B%7C2%7C101",
      method: "POST",
      body: {
        sourceType: "status_update",
        sourceLabel: "Tile · In Staging",
      },
      attempts: 0,
      queuedAt: Date.now(),
    });
    expect(ctx).toEqual({
      projectId: "p1",
      unitRef: "B|2|101",
      sourceLabel: "Tile · In Staging",
      scopeName: "Tile",
      statusDisplayLabel: "In Staging",
      albumUrl: "/api/projects/p1/album?unitRef=B%7C2%7C101",
    });
  });

  it("enqueueStatusPhotoMutation rolls back blob when enqueue fails", async () => {
    const file = new File(["pixels"], "status.jpg", { type: "image/jpeg" });
    mockStoreBlob.mockResolvedValue("blob-1");
    mockGetBlob.mockResolvedValue(new Blob(["pixels"], { type: "image/jpeg" }));

    const mq = await import("@/lib/offline/mutation-queue");
    vi.spyOn(mq, "enqueueMutation").mockRejectedValueOnce(new Error("idb full"));

    const { enqueueStatusPhotoMutation } = await import("@/lib/offline/status-photo-queue");
    await expect(
      enqueueStatusPhotoMutation({
        albumUrl: "/api/projects/p1/album?unitRef=u",
        sourceLabel: "Tile · In Staging",
        file,
      }),
    ).rejects.toThrow("idb full");

    expect(mockDeleteBlob).toHaveBeenCalledWith("blob-1");
  });

  it("discardMutation removes queue row and blob ids", async () => {
    mockGetBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    mockStoreBlob.mockImplementation(async () => {
      const id = `blob-${Math.random()}`;
      return id;
    });

    const { enqueueStatusPhotoMutation } = await import("@/lib/offline/status-photo-queue");
    const file = new File(["pixels"], "status.jpg", { type: "image/jpeg" });
    mockStoreBlob.mockResolvedValue("blob-discard");
    mockGetBlob.mockResolvedValue(new Blob(["pixels"], { type: "image/jpeg" }));

    await enqueueStatusPhotoMutation({
      albumUrl: "/api/projects/p1/album?unitRef=u",
      sourceLabel: "Tile · In Staging",
      file,
    });

    const { getPendingMutations, discardMutation } = await import("@/lib/offline/mutation-queue");
    const pending = await getPendingMutations();
    expect(pending).toHaveLength(1);

    const ok = await discardMutation(pending[0]!.id);
    expect(ok).toBe(true);
    expect(await getPendingMutations()).toHaveLength(0);
    expect(mockDeleteBlob).toHaveBeenCalledWith("blob-discard");
  });
});
