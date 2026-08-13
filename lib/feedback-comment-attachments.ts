/** Storage keys from POST /api/upload/field-media with type=feedback-comments */
export const FEEDBACK_COMMENT_STORAGE_PREFIX = "field-media/feedback-comments/";

export function isValidFeedbackCommentAttachmentKey(key: string): boolean {
  return (
    key.startsWith(FEEDBACK_COMMENT_STORAGE_PREFIX) &&
    !key.includes("..") &&
    !key.includes("\0")
  );
}

export function assertFeedbackCommentAttachmentKeys(keys: string[]): string | null {
  for (const k of keys) {
    if (!isValidFeedbackCommentAttachmentKey(k)) {
      return "Invalid attachment storage key";
    }
  }
  return null;
}
