import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswersMap } from "@/components/forms/FormFillClient";

const prepareMock = vi.hoisted(() =>
  vi.fn<(answers: AnswersMap) => Promise<{ answers: AnswersMap; deferredMedia: boolean }>>(),
);

vi.mock("@/lib/inspections/inspection-media-blobs", () => ({
  prepareInspectionMediaForSubmit: prepareMock,
}));

describe("uploadInspectionMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareMock.mockResolvedValue({
      answers: { q1: { value: "pass" } },
      deferredMedia: true,
    });
  });

  it("delegates to prepareInspectionMediaForSubmit (local-first, no network on submit)", async () => {
    const input: AnswersMap = { q1: { value: "pass" } };
    const { uploadInspectionMedia, uploadInspectionMediaWithMeta } =
      await import("@/lib/inspections/uploadInspectionMedia");

    const answers = await uploadInspectionMedia(input);
    expect(prepareMock).toHaveBeenCalledWith(input);
    expect(answers).toEqual({ q1: { value: "pass" } });

    const withMeta = await uploadInspectionMediaWithMeta(input);
    expect(withMeta.deferredMedia).toBe(true);
  });

  it("sanitizeAnswersForStorage strips file but keeps pendingBlobId", async () => {
    const { sanitizeAnswersForStorage } = await import("@/lib/inspections/uploadInspectionMedia");
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const sanitized = sanitizeAnswersForStorage({
      q1: {
        value: "fail",
        capturedFiles: [{
          localUrl: "blob:x",
          mimeType: "image/jpeg",
          file,
          pendingBlobId: "blob-1",
        }],
      },
    });

    expect(sanitized.q1.capturedFiles?.[0]?.pendingBlobId).toBe("blob-1");
    expect(sanitized.q1.capturedFiles?.[0]).not.toHaveProperty("file");
  });
});
