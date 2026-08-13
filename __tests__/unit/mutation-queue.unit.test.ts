/**
 * Unit tests for lib/offline/mutation-queue.ts
 *
 * Covers: enqueue, getPendingCount, flush (success + client error + retry),
 * add-comment mutation type, and blob upload behaviour (storageKey injection,
 * deferred blob deletion).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

// Mock blob-store so blob-related flush paths don't call IDB
const mockGetBlob     = vi.fn().mockResolvedValue(null);
const mockGetBlobMeta = vi.fn().mockResolvedValue(null);
const mockDeleteBlob  = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/offline/blob-store", () => ({
  getBlob:     mockGetBlob,
  getBlobMeta: mockGetBlobMeta,
  deleteBlob:  mockDeleteBlob,
}));

// Mock patchOfflineSnapshot so write-through doesn't need Cache Storage in these tests
vi.mock("@/lib/offline/snapshot-patch", () => ({
  patchOfflineSnapshot: vi.fn().mockResolvedValue(undefined),
}));

describe("mutation-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues a mutation and getPendingCount returns 1", async () => {
    const { enqueueMutation, getPendingCount } = await import("@/lib/offline/mutation-queue");
    await enqueueMutation({
      type: "unit-status",
      url: "/api/projects/p1/units/u1",
      method: "PATCH",
      body: { scopeStage: "COMPLETE" },
    });
    const count = await getPendingCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("flush removes the mutation on a 200 OK response", async () => {
    const { enqueueMutation, flushMutationQueue, getPendingCount } =
      await import("@/lib/offline/mutation-queue");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );

    await enqueueMutation({
      type: "create-observation",
      url: "/api/projects/p1/observations",
      method: "POST",
      body: { observationType: "HAZARD", description: "Spill" },
    });

    const before = await getPendingCount();
    const result = await flushMutationQueue();
    const after = await getPendingCount();

    expect(result.flushed).toBeGreaterThanOrEqual(1);
    expect(after).toBeLessThan(before);
  });

  it("flush keeps the mutation on a 400 client error for manual retry", async () => {
    const { enqueueMutation, flushMutationQueue, getPendingCount } =
      await import("@/lib/offline/mutation-queue");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400 })
    );

    await enqueueMutation({
      type: "add-comment",
      url: "/api/projects/p1/observations/o1/comments",
      method: "POST",
      body: { body: "Looks good" },
    });

    const before = await getPendingCount();
    const result = await flushMutationQueue();
    const after = await getPendingCount();

    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(after).toBe(before);
  });

  it("calls onProgress callback with (done, total) after each mutation", async () => {
    const { enqueueMutation, flushMutationQueue } =
      await import("@/lib/offline/mutation-queue");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );

    await enqueueMutation({
      type: "create-issue",
      url: "/api/projects/p1/issues",
      method: "POST",
      body: { shortDescription: "Test issue", issueType: "SAFETY" },
    });

    const progressCalls: Array<{ done: number; total: number }> = [];
    await flushMutationQueue(({ done, total }) => {
      progressCalls.push({ done, total });
    });

    expect(progressCalls.length).toBeGreaterThanOrEqual(1);
    const last = progressCalls[progressCalls.length - 1];
    expect(last.done).toBeGreaterThanOrEqual(1);
    expect(last.total).toBeGreaterThanOrEqual(1);
  });

  // ── Blob upload behaviour ──────────────────────────────────────────────────

  describe("blob upload", () => {
    it("injects both attachmentUrls and attachmentKeys into the write request body", async () => {
      const { enqueueMutation, flushMutationQueue } =
        await import("@/lib/offline/mutation-queue");

      const fakeBlob = new Blob(["pixel"], { type: "image/png" });
      mockGetBlob.mockResolvedValue(fakeBlob);
      mockGetBlobMeta.mockResolvedValue({ id: "blob-1", fileName: "photo.png", mimeType: "image/png", createdAt: Date.now() });

      const uploadRes = { storageUrl: "https://cdn.example.com/photo.png", storageKey: "observations/photo.png", mimeType: "image/png" };
      let capturedWriteInit: RequestInit | undefined;

      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("field-media")) {
          return { ok: true, status: 200, json: async () => uploadRes };
        }
        // This is the write API call — capture the init for assertions
        capturedWriteInit = init;
        return { ok: true, status: 201 };
      }));

      await enqueueMutation({
        type: "create-observation",
        url: "/api/projects/p1/observations",
        method: "POST",
        body: { title: "Observation", observationType: "HAZARD" },
        blobIds: ["blob-1"],
      });

      await flushMutationQueue();

      expect(capturedWriteInit).toBeDefined();
      const writeBody = JSON.parse(capturedWriteInit!.body as string) as Record<string, unknown>;
      expect(writeBody.attachmentUrls).toEqual(["https://cdn.example.com/photo.png"]);
      expect(writeBody.attachmentKeys).toEqual(["observations/photo.png"]);
      // mimeType from the upload API must be forwarded so the observations API
      // creates attachment records with the correct mimeType — without this,
      // it defaults to "application/octet-stream" and thumbnails never render.
      expect(writeBody.attachmentMimeTypes).toEqual(["image/png"]);
    });

    it("deletes blobs only AFTER the write request succeeds, not during upload", async () => {
      const { enqueueMutation, flushMutationQueue } =
        await import("@/lib/offline/mutation-queue");

      const fakeBlob = new Blob(["px"], { type: "image/jpeg" });
      mockGetBlob.mockResolvedValue(fakeBlob);
      mockGetBlobMeta.mockResolvedValue({ id: "blob-2", fileName: "img.jpg", mimeType: "image/jpeg", createdAt: Date.now() });

      // Simulate: blob upload succeeds, write request succeeds
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (String(url).includes("field-media")) {
          return { ok: true, status: 200, json: async () => ({ storageUrl: "https://cdn.example.com/img.jpg", storageKey: "observations/img.jpg" }) };
        }
        return { ok: true, status: 201 };
      }));

      await enqueueMutation({
        type: "create-observation",
        url: "/api/projects/p1/observations",
        method: "POST",
        body: { title: "Obs", observationType: "GENERAL" },
        blobIds: ["blob-2"],
      });

      expect(mockDeleteBlob).not.toHaveBeenCalled();

      await flushMutationQueue();

      // deleteBlob called once, AFTER write succeeded
      expect(mockDeleteBlob).toHaveBeenCalledWith("blob-2");
    });

    it("does NOT delete blobs when the upload fails — leaves them for retry", async () => {
      const { enqueueMutation, flushMutationQueue } =
        await import("@/lib/offline/mutation-queue");

      const fakeBlob = new Blob(["px"], { type: "image/jpeg" });
      mockGetBlob.mockResolvedValue(fakeBlob);
      mockGetBlobMeta.mockResolvedValue({ id: "blob-fail", fileName: "bad.jpg", mimeType: "image/jpeg", createdAt: Date.now() });

      // Upload endpoint fails
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));

      await enqueueMutation({
        type: "create-issue",
        url: "/api/projects/p1/issues",
        method: "POST",
        body: { shortDescription: "Issue", issueType: "GENERAL" },
        blobIds: ["blob-fail"],
      });

      await flushMutationQueue();

      // Blob must still be in IDB — not deleted
      expect(mockDeleteBlob).not.toHaveBeenCalled();
    });

    it("treats a missing storageKey in upload response as failure (no fallback to storageUrl)", async () => {
      const { enqueueMutation, flushMutationQueue } =
        await import("@/lib/offline/mutation-queue");

      const fakeBlob = new Blob(["px"], { type: "image/png" });
      mockGetBlob.mockResolvedValue(fakeBlob);
      mockGetBlobMeta.mockResolvedValue({ id: "blob-nokey", fileName: "img.png", mimeType: "image/png", createdAt: Date.now() });

      // Upload returns storageUrl but NOT storageKey
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ storageUrl: "https://cdn.example.com/img.png" }),
      }));

      await enqueueMutation({
        type: "create-observation",
        url: "/api/projects/p1/observations",
        method: "POST",
        body: { title: "Obs", observationType: "GENERAL" },
        blobIds: ["blob-nokey"],
      });

      const result = await flushMutationQueue();

      // Should NOT have created the write request (upload treated as failed)
      // Mutation stays in queue (incremented attempt) — not flushed, not deleted
      expect(result.flushed).toBe(0);
      expect(mockDeleteBlob).not.toHaveBeenCalled();
    });

    it("persists lastSyncError when blob upload fails", async () => {
      const { enqueueMutation, flushMutationQueue, getPendingMutations } =
        await import("@/lib/offline/mutation-queue");
      const { MUTATION_SYNC_ERROR } = await import("@/lib/offline/mutation-sync-errors");

      mockGetBlob.mockResolvedValue(null);

      await enqueueMutation({
        type: "link-status-album-photo",
        url: "/api/projects/p1/album?unitRef=sync-error-blob-test",
        method: "POST",
        body: { sourceType: "status_update", sourceLabel: "Tile · In Staging" },
        blobIds: ["missing-blob"],
      });

      const result = await flushMutationQueue(undefined, { manual: true });
      const pending = await getPendingMutations();
      const row = pending.find((m) => m.url.includes("sync-error-blob-test"));

      expect(result.failed).toBeGreaterThanOrEqual(1);
      expect(row?.lastSyncError).toBe(MUTATION_SYNC_ERROR.BLOB_MISSING);
    });

    it("persists lastSyncError on HTTP write failure", async () => {
      const { enqueueMutation, flushMutationQueue, getPendingMutations } =
        await import("@/lib/offline/mutation-queue");

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ error: "Unauthorized" }),
        }),
      );

      await enqueueMutation({
        type: "unit-status",
        url: "/api/projects/p1/units/sync-error-http-test",
        method: "PATCH",
        body: { scopeStage: "INSTALL", scopeStatus: "IN_PROGRESS" },
      });

      const result = await flushMutationQueue(undefined, { manual: true });
      const pending = await getPendingMutations();
      const row = pending.find((m) => m.url.includes("sync-error-http-test"));

      expect(result.failed).toBeGreaterThanOrEqual(1);
      expect(row?.lastSyncError).toBe("mutation:http:401:Unauthorized");
    });

    it("injects storageKey/storageUrl/mimeType for link-status-album-photo mutations", async () => {
      const { enqueueMutation, flushMutationQueue } =
        await import("@/lib/offline/mutation-queue");

      const fakeBlob = new Blob(["pixel"], { type: "image/jpeg" });
      mockGetBlob.mockResolvedValue(fakeBlob);
      mockGetBlobMeta.mockResolvedValue({
        id: "blob-album",
        fileName: "status.jpg",
        mimeType: "image/jpeg",
        createdAt: Date.now(),
      });

      let capturedWriteInit: RequestInit | undefined;

      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("field-media")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              storageUrl: "https://cdn.example.com/status.jpg",
              storageKey: "album/status.jpg",
              mimeType: "image/jpeg",
              fileSizeBytes: 2048,
            }),
          };
        }
        capturedWriteInit = init;
        return { ok: true, status: 201 };
      }));

      await enqueueMutation({
        type: "link-status-album-photo",
        url: "/api/projects/p1/album?unitRef=A%7C1%7C101",
        method: "POST",
        body: {
          caption: null,
          sourceType: "status_update",
          sourceLabel: "Countertops · In Progress",
        },
        blobIds: ["blob-album"],
      });

      await flushMutationQueue();

      expect(capturedWriteInit).toBeDefined();
      const writeBody = JSON.parse(capturedWriteInit!.body as string) as Record<string, unknown>;
      expect(writeBody.storageKey).toBe("album/status.jpg");
      expect(writeBody.storageUrl).toBe("https://cdn.example.com/status.jpg");
      expect(writeBody.mimeType).toBe("image/jpeg");
      expect(writeBody.sourceType).toBe("status_update");
      expect(writeBody.attachmentUrls).toBeUndefined();
    });
  });
});
