/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  replaceOfflineEntityIdInUrl,
  remapEntityIdInQueuedMutation,
  remapOfflineEntityIdAfterSync,
} from "@/lib/offline/offline-entity-id-remap";
import type { QueuedMutation } from "@/lib/offline/mutation-queue";

describe("replaceOfflineEntityIdInUrl()", () => {
  it("rewrites observation comment urls", () => {
    expect(
      replaceOfflineEntityIdInUrl(
        "/api/projects/p1/observations/offline-1/comments",
        "p1",
        "observation",
        "offline-1",
        "server-99",
      ),
    ).toBe("/api/projects/p1/observations/server-99/comments");
  });

  it("rewrites update-observation urls", () => {
    expect(
      replaceOfflineEntityIdInUrl(
        "/api/projects/p1/observations/offline-1",
        "p1",
        "observation",
        "offline-1",
        "server-99",
      ),
    ).toBe("/api/projects/p1/observations/server-99");
  });

  it("rewrites issue comment urls", () => {
    expect(
      replaceOfflineEntityIdInUrl(
        "/api/projects/p1/issues/offline-2/comments",
        "p1",
        "issue",
        "offline-2",
        "server-55",
      ),
    ).toBe("/api/projects/p1/issues/server-55/comments");
  });

  it("leaves unrelated urls unchanged", () => {
    const url = "/api/projects/p1/units/row-1";
    expect(
      replaceOfflineEntityIdInUrl(url, "p1", "observation", "offline-1", "server-99"),
    ).toBe(url);
  });
});

describe("remapOfflineEntityIdAfterSync()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates pending add-comment mutation urls in IDB", async () => {
    const { enqueueMutation, getPendingMutations } = await import("@/lib/offline/mutation-queue");

    await enqueueMutation({
      id: "offline-obs",
      type: "add-comment",
      url: "/api/projects/p1/observations/offline-obs/comments",
      method: "POST",
      body: { body: "Comment test" },
    });

    await remapOfflineEntityIdAfterSync({
      projectId: "p1",
      kind: "observation",
      offlineId: "offline-obs",
      serverId: "server-obs",
    });

    const pending = await getPendingMutations();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.url).toBe("/api/projects/p1/observations/server-obs/comments");
  });
});

describe("remapEntityIdInQueuedMutation()", () => {
  it("returns a new mutation object when url changes", () => {
    const mutation: QueuedMutation = {
      id: "comment-1",
      type: "add-comment",
      url: "/api/projects/p1/observations/local/comments",
      method: "POST",
      body: { body: "Hi" },
      attempts: 0,
      queuedAt: Date.now(),
    };
    const next = remapEntityIdInQueuedMutation(
      mutation,
      "p1",
      "observation",
      "local",
      "real",
    );
    expect(next.url).toContain("/observations/real/comments");
    expect(next).not.toBe(mutation);
  });

  it("simulates same-flush-batch in-memory remap for a trailing comment", () => {
    const createId = "offline-obs-1";
    const serverId = "server-obs-99";
    const pending: QueuedMutation[] = [
      {
        id: createId,
        type: "create-observation",
        url: "/api/projects/p1/observations",
        method: "POST",
        body: {},
        attempts: 0,
        queuedAt: 1,
      },
      {
        id: "comment-mut",
        type: "add-comment",
        url: `/api/projects/p1/observations/${createId}/comments`,
        method: "POST",
        body: { body: "Comment test" },
        attempts: 0,
        queuedAt: 2,
      },
    ];
    for (let j = 1; j < pending.length; j++) {
      pending[j] = remapEntityIdInQueuedMutation(
        pending[j],
        "p1",
        "observation",
        createId,
        serverId,
      );
    }
    expect(pending[1]?.url).toBe(
      `/api/projects/p1/observations/${serverId}/comments`,
    );
  });
});
