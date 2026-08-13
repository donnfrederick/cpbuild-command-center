import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/inspections/inspector-display", () => ({
  resolveInspectorName: vi.fn((clearInspection: { inspectedBy?: { name: string | null } | null } | null | undefined) =>
    clearInspection?.inspectedBy?.name?.trim() ?? "",
  ),
}));

import {
  attachSubmitterFromSession,
  enrichSubmissionsWithActivitySubmitters,
} from "@/lib/inspections/resolve-submission-submitter";

describe("attachSubmitterFromSession()", () => {
  it("does not replace clearInspection when inspectedById exists without a name", () => {
    const submission = {
      id: "sub-1",
      clearInspection: {
        inspectedById: "deleted-user",
        inspectedBy: null,
      },
    };

    const result = attachSubmitterFromSession(submission, {
      id: "viewer-1",
      name: "Viewer",
    });

    expect(result.clearInspection).toEqual(submission.clearInspection);
  });
});

describe("enrichSubmissionsWithActivitySubmitters()", () => {
  const findMany = vi.fn();

  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it("batches activity log lookups when many submissions lack submitters", async () => {
    const submissions = Array.from({ length: 75 }, (_, i) => ({
      id: `sub-${i}`,
      clearInspection: null,
    }));

    await enrichSubmissionsWithActivitySubmitters(
      { activityLog: { findMany } } as never,
      submissions,
    );

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0].where.OR).toHaveLength(50);
    expect(findMany.mock.calls[1][0].where.OR).toHaveLength(25);
  });
});
