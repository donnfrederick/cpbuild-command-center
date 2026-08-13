/** MIME types accepted by POST /api/feedback/upload-screenshot */
export const FEEDBACK_SCREENSHOT_ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/**
 * File input `accept` value — MIME types plus extensions.
 * Windows file picker often filters to PNG only when extensions are omitted.
 */
export const FEEDBACK_SCREENSHOT_FILE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";
