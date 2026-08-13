/**
 * Unit tests — HEIC large-file warning in modal handleFileChange paths.
 *
 * All six upload modals (AddObservationModal, AddIssueModal,
 * AddProjectIssueModal, CommentThread, BulkActionsSheet,
 * FeedbackCommentThread) share the same handleFileChange pattern:
 *
 *   - Non-HEIC images → burnTimestamp() → staged at compressed size
 *   - HEIC/HEIF files → skip burnTimestamp (browser can't decode)
 *   - HEIC/HEIF files > HEIC_LARGE_FILE_WARNING_BYTES → toast warning
 *
 * Rather than rendering each complex modal, these tests verify the
 * shared logic by exercising the underlying utilities directly and
 * asserting the branching conditions that produce the warning.
 */
import { describe, it, expect } from "vitest";
import { HEIC_LARGE_FILE_WARNING_BYTES, resolveClientMime } from "@/lib/image-utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(name: string, type: string, sizeBytes: number): File {
  // Create a File whose .size matches the requested value.
  // Uint8Array is limited to available memory in test env, so we use a
  // realistic-but-small backing array and override size via a custom File
  // subclass (jsdom honours the constructor size, not the blob data length).
  const buf = new Uint8Array(Math.min(sizeBytes, 64)); // tiny backing data
  const f = new File([buf], name, { type });
  // Simulate the real size by defining a non-configurable descriptor
  Object.defineProperty(f, "size", { value: sizeBytes, configurable: false });
  return f;
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("HEIC_LARGE_FILE_WARNING_BYTES", () => {
  it("is 8 MB", () => {
    expect(HEIC_LARGE_FILE_WARNING_BYTES).toBe(8 * 1024 * 1024);
  });
});

// ── HEIC file detection ───────────────────────────────────────────────────────

describe("resolveClientMime() — HEIC/HEIF edge cases", () => {
  it("detects image/heic from file extension when type is empty", () => {
    const f = makeFile("IMG_4291.heic", "", 6 * 1024 * 1024);
    expect(resolveClientMime(f)).toBe("image/heic");
  });

  it("detects image/heif from file extension when type is empty", () => {
    const f = makeFile("photo.heif", "", 6 * 1024 * 1024);
    expect(resolveClientMime(f)).toBe("image/heif");
  });

  it("passes through declared image/heic MIME type", () => {
    const f = makeFile("photo.heic", "image/heic", 6 * 1024 * 1024);
    expect(resolveClientMime(f)).toBe("image/heic");
  });

  it("does NOT treat a JPEG as HEIC even if named .heic", () => {
    // If the file declares image/jpeg, that takes precedence
    const f = makeFile("converted.heic", "image/jpeg", 2 * 1024 * 1024);
    expect(resolveClientMime(f)).toBe("image/jpeg");
  });
});

// ── Warning threshold logic ───────────────────────────────────────────────────

describe("HEIC warning trigger conditions", () => {
  /**
   * Mirrors the exact conditional used in all six modals:
   *   } else if ((mime.includes("heic") || mime.includes("heif")) && file.size > HEIC_LARGE_FILE_WARNING_BYTES) {
   *     toast(...)
   *   }
   */
  function shouldWarn(file: File): boolean {
    const mime = resolveClientMime(file);
    return (mime.includes("heic") || mime.includes("heif")) &&
      file.size > HEIC_LARGE_FILE_WARNING_BYTES;
  }

  it("warns for a HEIC file above the 8 MB threshold", () => {
    const f = makeFile("large.heic", "image/heic", 10 * 1024 * 1024);
    expect(shouldWarn(f)).toBe(true);
  });

  it("does NOT warn for a HEIC file exactly at the threshold (boundary)", () => {
    const f = makeFile("boundary.heic", "image/heic", HEIC_LARGE_FILE_WARNING_BYTES);
    expect(shouldWarn(f)).toBe(false);
  });

  it("does NOT warn for a HEIC file below the threshold", () => {
    const f = makeFile("small.heic", "image/heic", 4 * 1024 * 1024);
    expect(shouldWarn(f)).toBe(false);
  });

  it("warns for a HEIF file above the threshold", () => {
    const f = makeFile("large.heif", "image/heif", 9 * 1024 * 1024);
    expect(shouldWarn(f)).toBe(true);
  });

  it("does NOT warn for a normal JPEG even if large", () => {
    const f = makeFile("large.jpg", "image/jpeg", 20 * 1024 * 1024);
    expect(shouldWarn(f)).toBe(false);
  });

  it("does NOT warn for a video file", () => {
    const f = makeFile("clip.mp4", "video/mp4", 30 * 1024 * 1024);
    expect(shouldWarn(f)).toBe(false);
  });

  it("HEIC file with no explicit MIME is still detected via extension", () => {
    const f = makeFile("no-mime.heic", "", 12 * 1024 * 1024);
    expect(shouldWarn(f)).toBe(true);
  });
});

// ── HEIC detection for library processing ─────────────────────────────────────

describe("isHeicOrHeifFile() and isFieldMediaImageFile()", () => {
  it("detects HEIC by extension when MIME is application/octet-stream", async () => {
    const { isHeicOrHeifFile, isFieldMediaImageFile } = await import("@/lib/image-utils");
    const f = makeFile("photo.heic", "application/octet-stream", 1024);
    expect(isHeicOrHeifFile(f)).toBe(true);
    expect(isFieldMediaImageFile(f)).toBe(true);
  });

  it("detects HEIC by MIME type", async () => {
    const { isHeicOrHeifFile } = await import("@/lib/image-utils");
    const f = makeFile("photo.heic", "image/heic", 1024);
    expect(isHeicOrHeifFile(f)).toBe(true);
  });
});

// ── Library image processing path ───────────────────────────────────────────────

describe("HEIC library images are converted before staging", () => {
  /**
   * Field modals route library picks through processLibraryMediaFile →
   * prepareLibraryImageForFieldUpload, which converts HEIC to JPEG first.
   */
  it("isFieldMediaImageFile includes HEIC with octet-stream MIME", async () => {
    const { isFieldMediaImageFile } = await import("@/lib/image-utils");
    const f = makeFile("library.heic", "application/octet-stream", 6 * 1024 * 1024);
    expect(isFieldMediaImageFile(f)).toBe(true);
  });
});
