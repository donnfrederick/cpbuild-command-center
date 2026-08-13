import { describe, it, expect } from "vitest";
import {
  hasFeedbackInboxAccess,
  feedbackListWhereClause,
  canChangeFeedbackAssignee,
} from "@/lib/feedback-access";
import { PERMISSIONS } from "@/lib/permissions";

describe("hasFeedbackInboxAccess()", () => {
  it("returns false for MEMBER without override", () => {
    expect(hasFeedbackInboxAccess("MEMBER")).toBe(false);
  });

  it("returns true when JWT specialPermissions grants feedback inbox", () => {
    expect(
      hasFeedbackInboxAccess("MEMBER", [PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX])
    ).toBe(true);
  });
});

describe("feedbackListWhereClause()", () => {
  it("returns undefined when special permission grants inbox", () => {
    expect(
      feedbackListWhereClause("u1", "MEMBER", [], [PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX])
    ).toBeUndefined();
  });
});

describe("canChangeFeedbackAssignee()", () => {
  it("returns true for inbox override without being submitter", () => {
    expect(
      canChangeFeedbackAssignee({
        viewerId: "other",
        role: "MEMBER",
        reportUserId: "submitter",
        specialPermissions: [PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX],
      })
    ).toBe(true);
  });
});
