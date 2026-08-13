import { describe, it, expect } from "vitest";
import { filterFeedbackInboxRows } from "@/lib/feedback-inbox-filters";

const baseRow = {
  assignee: null as { id: string } | null,
  status: "OPEN",
  type: "BUG",
  priority: null as string | null,
  title: "Alpha",
  description: "Beta gamma",
  environment: "development" as string | undefined,
};

describe("filterFeedbackInboxRows()", () => {
  it("returns all rows when only default criteria", () => {
    const rows = [baseRow, { ...baseRow, title: "Other" }];
    const got = filterFeedbackInboxRows(rows, {
      view: "all",
      currentUserId: "u1",
      typeFilter: "ALL",
      priorityFilter: "ALL",
      environmentFilter: "ALL",
      search: "",
    });
    expect(got).toHaveLength(2);
  });

  it("mine view keeps only rows assigned to current user", () => {
    const rows = [
      { ...baseRow, assignee: { id: "u1" } },
      { ...baseRow, assignee: { id: "u2" }, title: "B" },
    ];
    const got = filterFeedbackInboxRows(rows, {
      view: "mine",
      currentUserId: "u1",
      typeFilter: "ALL",
      priorityFilter: "ALL",
      environmentFilter: "ALL",
      search: "",
    });
    expect(got).toHaveLength(1);
    expect(got[0].title).toBe("Alpha");
  });

  it("filters by type, priority NONE, environment, and search", () => {
    const rows = [
      { ...baseRow, type: "FEATURE_REQUEST", priority: null, environment: "production", title: "X", description: "Y" },
      { ...baseRow, type: "BUG", priority: "HIGH", title: "Bug", description: "text" },
    ];
    const byType = filterFeedbackInboxRows(rows, {
      view: "all",
      currentUserId: "u1",
      typeFilter: "BUG",
      priorityFilter: "ALL",
      environmentFilter: "ALL",
      search: "",
    });
    expect(byType).toHaveLength(1);
    expect(byType[0].type).toBe("BUG");

    const byPriorityNone = filterFeedbackInboxRows(rows, {
      view: "all",
      currentUserId: "u1",
      typeFilter: "ALL",
      priorityFilter: "NONE",
      environmentFilter: "ALL",
      search: "",
    });
    expect(byPriorityNone).toHaveLength(1);
    expect(byPriorityNone[0].priority).toBeNull();

    const byEnv = filterFeedbackInboxRows(rows, {
      view: "all",
      currentUserId: "u1",
      typeFilter: "ALL",
      priorityFilter: "ALL",
      environmentFilter: "production",
      search: "",
    });
    expect(byEnv).toHaveLength(1);
    expect(byEnv[0].environment).toBe("production");

    const bySearch = filterFeedbackInboxRows(rows, {
      view: "all",
      currentUserId: "u1",
      typeFilter: "ALL",
      priorityFilter: "ALL",
      environmentFilter: "ALL",
      search: "text",
    });
    expect(bySearch).toHaveLength(1);
    expect(bySearch[0].title).toBe("Bug");
  });
});
