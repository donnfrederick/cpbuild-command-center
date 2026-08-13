import { describe, it, expect } from "vitest";
import {
  FEEDBACK_SCREENSHOT_ALLOWED_MIME,
  FEEDBACK_SCREENSHOT_FILE_ACCEPT,
} from "@/lib/feedback/screenshot-upload";

describe("feedback screenshot upload constants", () => {
  it("accept includes MIME types and file extensions for Windows file picker", () => {
    for (const mime of FEEDBACK_SCREENSHOT_ALLOWED_MIME) {
      expect(FEEDBACK_SCREENSHOT_FILE_ACCEPT).toContain(mime);
    }
    expect(FEEDBACK_SCREENSHOT_FILE_ACCEPT).toContain(".jpg");
    expect(FEEDBACK_SCREENSHOT_FILE_ACCEPT).toContain(".jpeg");
    expect(FEEDBACK_SCREENSHOT_FILE_ACCEPT).toContain(".webp");
    expect(FEEDBACK_SCREENSHOT_FILE_ACCEPT).toContain(".gif");
  });
});
