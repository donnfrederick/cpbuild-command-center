/**
 * Unit tests for lib/offline/mutation-queue.ts
 *
 * Uses a lightweight in-memory IDB shim via fake-indexeddb.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Polyfill IndexedDB for jsdom
import "fake-indexeddb/auto";

import {
  enqueueMutation,
  getPendingCount,
  flushMutationQueue,
} from "@/lib/offline/mutation-queue";

// We need a fresh DB per test — fake-indexeddb persists across calls
// so we use a unique DB suffix per test run; our implementation always uses
// "cc-offline-queue" so we just clear by re-deleting the DB.
function resetIdb() {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("cc-offline-queue");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe("mutation-queue", () => {
  beforeEach(async () => {
    await resetIdb();
    vi.clearAllMocks();
  });

  it("starts with zero pending mutations", async () => {
    expect(await getPendingCount()).toBe(0);
  });

  it("enqueues a mutation and increments count", async () => {
    await enqueueMutation({
      type: "unit-status",
      url: "/api/projects/p1/units/r1",
      method: "PATCH",
      body: { scopeStatus: "INSTALL_COMPLETE" },
    });
    expect(await getPendingCount()).toBe(1);
  });

  it("enqueues multiple mutations", async () => {
    await enqueueMutation({ type: "unit-status", url: "/api/a", method: "PATCH", body: {} });
    await enqueueMutation({ type: "create-issue", url: "/api/b", method: "POST", body: {} });
    expect(await getPendingCount()).toBe(2);
  });

  describe("flushMutationQueue", () => {
    it("returns zero counts when queue is empty", async () => {
      const result = await flushMutationQueue();
      expect(result).toEqual({ flushed: 0, failed: 0 });
    });

    it("flushes successful mutations and removes them", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

      await enqueueMutation({ type: "unit-status", url: "/api/x", method: "PATCH", body: { scopeStatus: "STAGING" } });

      const result = await flushMutationQueue();
      expect(result.flushed).toBe(1);
      expect(result.failed).toBe(0);
      expect(await getPendingCount()).toBe(0);
    });

    it("preserves 4xx mutations in the queue for manual retry", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));

      await enqueueMutation({ type: "create-issue", url: "/api/y", method: "POST", body: {} });

      const result = await flushMutationQueue();
      expect(result.failed).toBe(1);
      expect(result.flushed).toBe(0);
      expect(await getPendingCount()).toBe(1);
    });

    it("increments attempt count on 5xx and leaves in queue", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      await enqueueMutation({ type: "create-observation", url: "/api/z", method: "POST", body: {} });

      const result = await flushMutationQueue();
      expect(result.flushed).toBe(0);
      expect(result.failed).toBe(1);
      expect(await getPendingCount()).toBe(1); // still in queue for retry
    });

    it("keeps mutations that exceed MAX_ATTEMPTS until manual retry reset", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

      await enqueueMutation({ type: "unit-status", url: "/api/retry", method: "PATCH", body: {} });

      await flushMutationQueue(); // attempt 1
      await flushMutationQueue(); // attempt 2
      await flushMutationQueue(); // attempt 3 — hits MAX_ATTEMPTS

      const result = await flushMutationQueue(); // skipped at MAX_ATTEMPTS, still in queue
      expect(result.failed).toBe(1);
      expect(await getPendingCount()).toBe(1);

      await flushMutationQueue(undefined, { manual: true });
      expect(await getPendingCount()).toBe(1);
    });
  });
});
