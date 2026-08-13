import { describe, it, expect, vi } from "vitest";
import { relinkScopeTagsForProject } from "@/lib/field-notes/relink-scope-tags";

describe("relinkScopeTagsForProject", () => {
  it("creates missing issue scope tags from durable scopeRefKeys", async () => {
    const db = {
      projectRow: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "new-row",
            building: "A",
            level: "1",
            unit: "101",
            description: "Floor",
          },
        ]),
      },
      projectIssue: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "issue-1",
            scopeRefKeys: ["a|1|101|floor"],
            scopeTags: [],
          },
        ]),
      },
      projectObservation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      issueScopeTag: {
        create: vi.fn().mockResolvedValue({}),
      },
      observationScopeTag: {
        create: vi.fn(),
      },
    };

    const result = await relinkScopeTagsForProject(db as never, "p1");
    expect(result.issueTagsCreated).toBe(1);
    expect(db.issueScopeTag.create).toHaveBeenCalledWith({
      data: { issueId: "issue-1", projectRowId: "new-row" },
    });
  });

  it("skips tags that already exist on the issue", async () => {
    const db = {
      projectRow: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "row-1",
            building: "A",
            level: "1",
            unit: "101",
            description: "Floor",
          },
        ]),
      },
      projectIssue: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "issue-1",
            scopeRefKeys: ["a|1|101|floor"],
            scopeTags: [{ projectRowId: "row-1" }],
          },
        ]),
      },
      projectObservation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      issueScopeTag: {
        create: vi.fn(),
      },
      observationScopeTag: {
        create: vi.fn(),
      },
    };

    const result = await relinkScopeTagsForProject(db as never, "p1");
    expect(result.issueTagsCreated).toBe(0);
    expect(db.issueScopeTag.create).not.toHaveBeenCalled();
  });
});
