import { describe, expect, it } from "vitest";
import {
  buildIssueScopePills,
  issueAgeTone,
  issueRowStateClass,
  issueTypePillClass,
  resolveIssueTypeDisplayName,
} from "@/lib/issues/issueDisplay";

describe("issueDisplay helpers", () => {
  it("maps issue types to tokenized pill classes", () => {
    expect(issueTypePillClass("SUBSTRATE_CONDITION")).toBe(
      "issue-log-type-pill issue-log-type-pill--substrate-condition",
    );
    expect(issueTypePillClass("OTHER")).toBe(
      "issue-log-type-pill issue-log-type-pill--other",
    );
    expect(issueTypePillClass(undefined)).toBe(
      "issue-log-type-pill issue-log-type-pill--other",
    );
  });

  it("does not throw when issueType is null or empty", () => {
    expect(resolveIssueTypeDisplayName(null)).toBe("OTHER");
    expect(resolveIssueTypeDisplayName("")).toBe("OTHER");
    expect(issueTypePillClass(null)).toContain("other");
  });

  it("derives visual state from status and blocking flag", () => {
    expect(issueRowStateClass("RESOLVED", true)).toBe("resolved");
    expect(issueRowStateClass("OPEN", true)).toBe("blocking");
    expect(issueRowStateClass("OPEN", false)).toBe("open");
  });

  it("builds scope pills from scope and sub-scope tags", () => {
    const pills = buildIssueScopePills({
      scopeTags: [{ row: { scopeType: { name: "Cabinets" } } }],
      subScopeTags: [
        {
          subScopeInstance: {
            subScope: { name: "Upper" },
            row: { scopeType: { name: "Cabinets" } },
          },
        },
      ],
    });
    expect(pills).toEqual(["Cabinets: Upper"]);
  });

  it("flags overdue open issues for warning/critical age tones", () => {
    const old = new Date(Date.now() - 31 * 86400000).toISOString();
    expect(issueAgeTone({ status: "OPEN", createdAt: old })).toBe("critical");
    expect(issueAgeTone({ status: "RESOLVED", createdAt: old })).toBe("resolved");
  });
});
