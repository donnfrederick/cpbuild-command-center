import { describe, it, expect } from "vitest";
import { extractCapturedMedia, isVisualMedia, visualMimeType } from "@/lib/media/album-visual";

describe("album-visual", () => {
  it("isVisualMedia() accepts images and video only", () => {
    expect(isVisualMedia("image/jpeg")).toBe(true);
    expect(isVisualMedia("video/mp4")).toBe(true);
    expect(isVisualMedia("audio/webm")).toBe(false);
  });

  it("extractCapturedMedia() reads capturedFiles from inspection answers", () => {
    const media = extractCapturedMedia({
      capturedFiles: [{
        storageUrl: "https://example.com/photo.jpg",
        mimeType: "image/jpeg",
      }],
    });
    expect(media).toHaveLength(1);
    expect(media[0].storageUrl).toBe("https://example.com/photo.jpg");
  });

  it("visualMimeType() infers mime from file extension when missing", () => {
    expect(visualMimeType(null, "https://example.com/clip.mp4")).toBe("video/mp4");
  });
});
