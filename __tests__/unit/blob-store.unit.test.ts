/**
 * Unit tests for lib/offline/blob-store.ts
 *
 * Uses a real IDBFactory mock via fake-indexeddb (already in devDependencies
 * via vitest-environment-jsdom which includes indexedDB stubs).
 */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { storeBlob, getBlob, getBlobMeta, deleteBlob, pruneOldBlobs, storeBlobVerified } from "@/lib/offline/blob-store";

describe("blob-store", () => {
  describe("storeBlob / getBlob", () => {
    it("stores a file and retrieves it as a Blob", async () => {
      const file = new File(["hello"], "test.jpg", { type: "image/jpeg" });
      const id = await storeBlob(file);
      expect(typeof id).toBe("string");
      expect(id).toMatch(/^blob-/);

      const retrieved = await getBlob(id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.type).toBe("image/jpeg");
      const text = await retrieved!.text();
      expect(text).toBe("hello");
    });

    it("supports back-to-back store operations without connection errors", async () => {
      const files = Array.from({ length: 7 }, (_, i) =>
        new File([`photo-${i}`], `photo-${i}.jpg`, { type: "image/jpeg" }),
      );
      const ids = await Promise.all(files.map((file) => storeBlob(file)));
      expect(ids).toHaveLength(7);
      for (const id of ids) {
        expect(await getBlob(id)).not.toBeNull();
      }
    });

    it("returns null for an id that doesn't exist", async () => {
      const result = await getBlob("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("getBlobMeta", () => {
    it("returns metadata without the data buffer", async () => {
      const file = new File(["world"], "video.mp4", { type: "video/mp4" });
      const id = await storeBlob(file);
      const meta = await getBlobMeta(id);
      expect(meta).not.toBeNull();
      expect(meta?.mimeType).toBe("video/mp4");
      expect(meta?.fileName).toBe("video.mp4");
      expect(meta).not.toHaveProperty("data");
    });

    it("returns null for a missing id", async () => {
      const meta = await getBlobMeta("definitely-not-there");
      expect(meta).toBeNull();
    });
  });

  describe("storeBlobVerified", () => {
    it("returns id when read-back succeeds", async () => {
      const file = new File(["hello"], "a.jpg", { type: "image/jpeg" });
      const id = await storeBlobVerified(file);
      const blob = await getBlob(id);
      expect(blob).not.toBeNull();
      expect(blob!.size).toBeGreaterThan(0);
    });
  });

  describe("deleteBlob", () => {
    it("removes the blob so getBlob returns null after deletion", async () => {
      const file = new File(["bye"], "bye.jpg", { type: "image/jpeg" });
      const id = await storeBlob(file);
      expect(await getBlob(id)).not.toBeNull();

      await deleteBlob(id);
      expect(await getBlob(id)).toBeNull();
    });

    it("does not throw when deleting a non-existent id", async () => {
      await expect(deleteBlob("ghost-id")).resolves.toBeUndefined();
    });
  });

  describe("pruneOldBlobs", () => {
    it("returns 0 when there are no blobs older than maxAgeMs", async () => {
      // Fresh file — far younger than 7 days
      const file = new File(["fresh"], "fresh.jpg", { type: "image/jpeg" });
      await storeBlob(file);
      const pruned = await pruneOldBlobs(7 * 24 * 60 * 60 * 1000);
      expect(pruned).toBe(0);
    });
  });
});
