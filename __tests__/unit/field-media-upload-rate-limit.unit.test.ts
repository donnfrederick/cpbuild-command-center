import { describe, it, expect, beforeEach } from "vitest";
import {
  recordFieldMediaUploadAttempt,
  resetFieldMediaRateLimitForTests,
  FIELD_MEDIA_UPLOADS_PER_MINUTE_LIMIT,
} from "@/lib/field-media-upload-rate-limit";

describe("recordFieldMediaUploadAttempt()", () => {
  beforeEach(() => {
    resetFieldMediaRateLimitForTests();
  });

  it("allows requests up to the per-minute limit", () => {
    const userId = "user-a";
    for (let i = 0; i < FIELD_MEDIA_UPLOADS_PER_MINUTE_LIMIT; i++) {
      expect(recordFieldMediaUploadAttempt(userId)).toEqual({ ok: true });
    }
    const denied = recordFieldMediaUploadAttempt(userId);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.windowKey).toBe("per_minute");
      expect(denied.count).toBeGreaterThan(FIELD_MEDIA_UPLOADS_PER_MINUTE_LIMIT);
    }
  });

  it("tracks windows independently per user", () => {
    for (let i = 0; i < 5; i++) {
      expect(recordFieldMediaUploadAttempt("u1")).toEqual({ ok: true });
      expect(recordFieldMediaUploadAttempt("u2")).toEqual({ ok: true });
    }
  });
});
