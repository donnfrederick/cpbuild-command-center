import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStoreBlobVerified = vi.fn<(file: File) => Promise<string>>();
const mockGetBlob = vi.fn<(id: string) => Promise<Blob | null>>();
const mockDeleteBlob = vi.fn<(id: string) => Promise<void>>();
const mockEnqueueMutation = vi.fn<(m: unknown) => Promise<void>>();

vi.mock("@/lib/offline/blob-store", () => ({
  BlobStoreVerificationError: class BlobStoreVerificationError extends Error {
    name = "BlobStoreVerificationError";
  },
  storeBlobVerified: (file: File) => mockStoreBlobVerified(file),
  getBlob: (id: string) => mockGetBlob(id),
  deleteBlob: (id: string) => mockDeleteBlob(id),
}));

vi.mock("@/lib/offline/mutation-queue", () => ({
  enqueueMutation: (m: unknown) => mockEnqueueMutation(m),
}));

import {
  BlobStoreVerificationError,
  enqueueMutationWithVerifiedBlobs,
  offlineAttachmentFieldsFromStaged,
  storeVerifiedBlobIds,
} from "@/lib/offline/enqueue-mutation-with-blobs";

describe("enqueue-mutation-with-blobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteBlob.mockResolvedValue(undefined);
  });

  it("offlineAttachmentFieldsFromStaged maps captions and annotations", () => {
    expect(
      offlineAttachmentFieldsFromStaged([
        { caption: "A", imageAnnotation: { shapes: [] } },
        {},
      ]),
    ).toEqual({
      attachmentCaptions: ["A", ""],
      attachmentImageAnnotations: [{ shapes: [] }, null],
    });
  });

  it("storeVerifiedBlobIds rolls back partial writes on failure", async () => {
    mockStoreBlobVerified
      .mockResolvedValueOnce("blob-1")
      .mockRejectedValueOnce(new Error("idb full"));

    await expect(storeVerifiedBlobIds([new File(["a"], "a.jpg"), new File(["b"], "b.jpg")])).rejects.toThrow(
      "idb full",
    );
    expect(mockDeleteBlob).toHaveBeenCalledWith("blob-1");
  });

  it("enqueueMutationWithVerifiedBlobs verifies blobs after enqueue", async () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    mockStoreBlobVerified.mockResolvedValue("blob-1");
    mockGetBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));

    await enqueueMutationWithVerifiedBlobs({
      type: "create-issue",
      url: "/api/projects/p1/issues",
      method: "POST",
      body: { shortDescription: "Test" },
      mediaFiles: [file],
    });

    expect(mockEnqueueMutation).toHaveBeenCalledWith(
      expect.objectContaining({ blobIds: ["blob-1"] }),
    );
    expect(mockGetBlob).toHaveBeenCalledWith("blob-1");
  });

  it("enqueueMutationWithVerifiedBlobs rolls back blobs when post-queue read fails", async () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    mockStoreBlobVerified.mockResolvedValue("blob-1");
    mockGetBlob.mockResolvedValue(null);

    await expect(
      enqueueMutationWithVerifiedBlobs({
        type: "create-issue",
        url: "/api/projects/p1/issues",
        method: "POST",
        body: { shortDescription: "Test" },
        mediaFiles: [file],
      }),
    ).rejects.toBeInstanceOf(BlobStoreVerificationError);

    expect(mockDeleteBlob).toHaveBeenCalledWith("blob-1");
  });
});
