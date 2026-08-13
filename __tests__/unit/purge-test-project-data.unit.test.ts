import { describe, it, expect } from "vitest";
import { testProjectSelectionWhere } from "../../scripts/purge-test-project-data";

describe("testProjectSelectionWhere()", () => {
  it("includes soft-deleted projects when --all is set", () => {
    expect(testProjectSelectionWhere({ all: true })).toEqual({
      isTestProject: true,
    });
  });

  it("includes soft-deleted project when --project-id is explicit", () => {
    expect(testProjectSelectionWhere({ all: false, projectId: "proj-soft-deleted" })).toEqual({
      isTestProject: true,
      id: "proj-soft-deleted",
    });
  });

  it("always requires isTestProject even with explicit id", () => {
    const where = testProjectSelectionWhere({ all: false, projectId: "x" });
    expect(where.isTestProject).toBe(true);
    expect(where).not.toHaveProperty("deletedAt");
  });
});
