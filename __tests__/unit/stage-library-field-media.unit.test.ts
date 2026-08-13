import { describe, it, expect, vi } from "vitest";
import { processLibraryMediaFile } from "@/lib/stage-library-field-media";

vi.mock("heic2any", () => ({
  default: vi.fn(async () => new Blob(["fake-jpeg"], { type: "image/jpeg" })),
}));

describe("processLibraryMediaFile()", () => {
  it("returns video files unchanged", async () => {
    const video = new File(["mp4"], "clip.mp4", { type: "video/mp4" });
    const { file, mimeType } = await processLibraryMediaFile(video);
    expect(file).toBe(video);
    expect(mimeType).toBe("video/mp4");
  });
});
