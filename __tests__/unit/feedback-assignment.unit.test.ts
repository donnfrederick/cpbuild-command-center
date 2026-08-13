import { describe, it, expect } from "vitest";
import {
  FEEDBACK_ASSIGNEE_ROLE_CODES,
  filterTeamMembersForFeedbackAssignee,
  isAllowedFeedbackAssigneeRole,
} from "@/lib/feedback-assignment";

describe("feedback-assignment", () => {
  it("lists three assignable role codes", () => {
    expect(FEEDBACK_ASSIGNEE_ROLE_CODES).toEqual(["ADMIN", "DEVELOPER", "DESIGNER"]);
  });

  it("isAllowedFeedbackAssigneeRole accepts ADMIN, DEVELOPER, DESIGNER and SUPER_ADMIN alias", () => {
    expect(isAllowedFeedbackAssigneeRole("ADMIN")).toBe(true);
    expect(isAllowedFeedbackAssigneeRole("DEVELOPER")).toBe(true);
    expect(isAllowedFeedbackAssigneeRole("DESIGNER")).toBe(true);
    expect(isAllowedFeedbackAssigneeRole("SUPER_ADMIN")).toBe(true);
    expect(isAllowedFeedbackAssigneeRole("MEMBER")).toBe(false);
  });

  it("filterTeamMembersForFeedbackAssignee keeps only assignable roles", () => {
    const members = [
      { id: "a", role: "ADMIN", name: "A", email: "a@test.com" },
      { id: "m", role: "MEMBER", name: "M", email: "m@test.com" },
      { id: "d", role: "DEVELOPER", name: "D", email: "d@test.com" },
    ];
    const filtered = filterTeamMembersForFeedbackAssignee(members);
    expect(filtered.map((x) => x.id)).toEqual(["a", "d"]);
  });
});
