/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QueuedMutation } from "@/lib/offline/mutation-queue";
import {
  buildCommentEditContext,
  buildIssueSummaryFromMutation,
  buildUnitStatusEditContext,
  canEditQueuedMutation,
  fetchCurrentUserId,
  projectIdFromMutationUrl,
} from "@/lib/offline/pending-mutation-edit";

function mutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: "mut-1",
    type: "add-comment",
    method: "POST",
    url: "/api/projects/proj-1/observations/obs-1/comments",
    body: { text: "Hello" },
    queuedAt: Date.now(),
    actorUserId: "user-a",
    ...overrides,
  };
}

describe("canEditQueuedMutation()", () => {
  it("returns false when no current user", () => {
    expect(canEditQueuedMutation(mutation(), undefined)).toBe(false);
  });

  it("allows edit when actor matches current user", () => {
    expect(canEditQueuedMutation(mutation({ actorUserId: "user-a" }), "user-a")).toBe(true);
  });

  it("denies edit when actor differs from current user", () => {
    expect(canEditQueuedMutation(mutation({ actorUserId: "user-a" }), "user-b")).toBe(false);
  });

  it("allows edit for legacy rows without actorUserId", () => {
    expect(canEditQueuedMutation(mutation({ actorUserId: undefined }), "user-a")).toBe(true);
  });
});

describe("projectIdFromMutationUrl()", () => {
  it("extracts project id from mutation url", () => {
    expect(projectIdFromMutationUrl("/api/projects/abc-123/issues")).toBe("abc-123");
  });
});

describe("buildCommentEditContext()", () => {
  it("builds observation comment context", () => {
    const ctx = buildCommentEditContext(
      mutation({
        type: "add-comment",
        url: "/api/projects/p1/observations/o1/comments",
        body: { body: "Comment test" },
      }),
    );
    expect(ctx).toEqual({
      mutationId: "mut-1",
      projectId: "p1",
      target: "observation",
      body: "Comment test",
    });
  });

  it("builds issue comment context", () => {
    const ctx = buildCommentEditContext(
      mutation({
        url: "/api/projects/p1/issues/i1/comments",
        body: { body: "Issue comment" },
      }),
    );
    expect(ctx?.target).toBe("issue");
    expect(ctx?.body).toBe("Issue comment");
  });
});

describe("buildUnitStatusEditContext()", () => {
  it("parses scope stage and status from body", () => {
    const ctx = buildUnitStatusEditContext(
      mutation({
        type: "unit-status",
        url: "/api/projects/p1/units/row-1/scope-progress",
        body: { scopeStage: "INSTALL", scopeStatus: "IN_PROGRESS", building: "B", level: "L", unit: "U" },
      }),
    );
    expect(ctx).toMatchObject({
      mutationId: "mut-1",
      projectId: "p1",
      rowId: "row-1",
      scopeStage: "INSTALL",
      scopeStatus: "IN_PROGRESS",
    });
  });
});

describe("buildIssueSummaryFromMutation()", () => {
  it("builds issue summary from create-issue mutation", () => {
    const issue = buildIssueSummaryFromMutation(
      mutation({
        type: "create-issue",
        url: "/api/projects/p1/issues",
        body: {
          shortDescription: "Test",
          notes: "Details",
          unitRef: "B|L|N205",
          projectRowIds: ["row-1"],
        },
      }),
    );
    expect(issue?.shortDescription).toBe("Test");
    expect(issue?.notes).toBe("Details");
    expect(issue?.id).toBe("mut-1");
  });
});

describe("fetchCurrentUserId()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns user id from session endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { id: "session-user" } }),
      }),
    );
    await expect(fetchCurrentUserId()).resolves.toBe("session-user");
  });

  it("returns undefined when session request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false }),
    );
    await expect(fetchCurrentUserId()).resolves.toBeUndefined();
  });
});
