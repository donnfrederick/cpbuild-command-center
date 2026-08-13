import { describe, it, expect } from "vitest";
import {
  assertFeedbackCommentAttachmentKeys,
  isValidFeedbackCommentAttachmentKey,
  FEEDBACK_COMMENT_STORAGE_PREFIX,
} from "@/lib/feedback-comment-attachments";

describe("feedback-comment-attachments", () => {
  it("exports expected prefix", () => {
    expect(FEEDBACK_COMMENT_STORAGE_PREFIX).toBe("field-media/feedback-comments/");
  });

  describe("isValidFeedbackCommentAttachmentKey", () => {
    it("accepts keys under feedback-comments", () => {
      expect(isValidFeedbackCommentAttachmentKey("field-media/feedback-comments/uuid.jpg")).toBe(true);
    });

    it("rejects other folders", () => {
      expect(isValidFeedbackCommentAttachmentKey("field-media/issues/x.jpg")).toBe(false);
    });

    it("rejects path traversal", () => {
      expect(isValidFeedbackCommentAttachmentKey("field-media/feedback-comments/../issues/x.jpg")).toBe(false);
    });
  });

  describe("assertFeedbackCommentAttachmentKeys", () => {
    it("returns null when all keys valid", () => {
      expect(
        assertFeedbackCommentAttachmentKeys(["field-media/feedback-comments/a.jpg"])
      ).toBeNull();
    });

    it("returns error message when any key invalid", () => {
      expect(assertFeedbackCommentAttachmentKeys(["field-media/wrong/a.jpg"])).toBe(
        "Invalid attachment storage key"
      );
    });

    it("accepts empty array", () => {
      expect(assertFeedbackCommentAttachmentKeys([])).toBeNull();
    });
  });
});
