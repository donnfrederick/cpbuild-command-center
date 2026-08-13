import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isFeedbackScreenshotSignedUrl,
  isFeedbackScreenshotLocalUrl,
  isFeedbackScreenshotStorageUrl,
} from "@/lib/feedback-screenshot-url-shared";

describe("isFeedbackScreenshotSignedUrl()", () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://abc123.supabase.co";
  });

  afterEach(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }
  });

  it("accepts a signed URL for field-media/feedback-screenshots on the configured host", () => {
    expect(
      isFeedbackScreenshotSignedUrl(
        "https://abc123.supabase.co/storage/v1/object/sign/field-media/feedback-screenshots/000.png?token=abc",
      ),
    ).toBe(true);
  });

  it("accepts legacy signed URLs from the dedicated feedback-screenshots bucket", () => {
    expect(
      isFeedbackScreenshotSignedUrl(
        "https://abc123.supabase.co/storage/v1/object/sign/feedback-screenshots/000.png?token=abc",
      ),
    ).toBe(true);
  });

  it("rejects third-party hosts even when the path looks correct", () => {
    expect(
      isFeedbackScreenshotSignedUrl(
        "https://evil.example.com/storage/v1/object/sign/feedback-screenshots/000.png?token=abc",
      ),
    ).toBe(false);
  });

  it("rejects URLs that do not start with the signed object path prefix", () => {
    expect(isFeedbackScreenshotSignedUrl("https://abc123.supabase.co/other/path.png")).toBe(false);
  });

  it("rejects path segments that only contain the prefix as a substring", () => {
    expect(
      isFeedbackScreenshotSignedUrl(
        "https://abc123.supabase.co/evil/storage/v1/object/sign/feedback-screenshots/x.png",
      ),
    ).toBe(false);
  });

  it("rejects paths containing parent-directory segments", () => {
    expect(
      isFeedbackScreenshotSignedUrl(
        "https://abc123.supabase.co/storage/v1/object/sign/feedback-screenshots/../secrets.png",
      ),
    ).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isFeedbackScreenshotSignedUrl("not-a-url")).toBe(false);
  });

  it("fails closed when Supabase URL is not configured", () => {
    delete process.env.SUPABASE_URL;
    expect(
      isFeedbackScreenshotSignedUrl(
        "https://abc123.supabase.co/storage/v1/object/sign/feedback-screenshots/000.png?token=abc",
      ),
    ).toBe(false);
  });

  it("rejects signed paths without a token query parameter", () => {
    expect(
      isFeedbackScreenshotSignedUrl(
        "https://abc123.supabase.co/storage/v1/object/sign/feedback-screenshots/000.png",
      ),
    ).toBe(false);
  });
});

describe("isFeedbackScreenshotLocalUrl()", () => {
  it("accepts local field-media URLs for feedback-screenshots", () => {
    expect(
      isFeedbackScreenshotLocalUrl(
        "http://localhost:3002/api/upload/field-media/file?key=field-media%2Ffeedback-screenshots%2Fabc.png",
      ),
    ).toBe(true);
  });

  it("rejects local URLs for other field-media folders", () => {
    expect(
      isFeedbackScreenshotLocalUrl(
        "http://localhost:3002/api/upload/field-media/file?key=field-media%2Fissues%2Fabc.png",
      ),
    ).toBe(false);
  });

  it("rejects path traversal in the key", () => {
    expect(
      isFeedbackScreenshotLocalUrl(
        "http://localhost:3002/api/upload/field-media/file?key=field-media%2Ffeedback-screenshots%2F..%2Fsecrets.png",
      ),
    ).toBe(false);
  });
});

describe("isFeedbackScreenshotStorageUrl()", () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://abc123.supabase.co";
  });

  afterEach(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }
  });

  it("accepts Supabase signed URLs (field-media path)", () => {
    expect(
      isFeedbackScreenshotStorageUrl(
        "https://abc123.supabase.co/storage/v1/object/sign/field-media/feedback-screenshots/000.png?token=abc",
      ),
    ).toBe(true);
  });

  it("accepts local field-media URLs", () => {
    expect(
      isFeedbackScreenshotStorageUrl(
        "http://localhost:3000/api/upload/field-media/file?key=field-media%2Ffeedback-screenshots%2F000.png",
      ),
    ).toBe(true);
  });
});
