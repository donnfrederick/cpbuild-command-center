import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswersMap } from "@/components/forms/FormFillClient";
import type { CapturedMediaItem } from "@/components/forms/formTypes";

const blobMocks = vi.hoisted(() => ({
  storeBlob: vi.fn<(file: File) => Promise<string>>(),
  getBlob: vi.fn<(id: string) => Promise<Blob | null>>(),
  deleteBlob: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock("@/lib/offline/blob-store", () => ({
  storeBlob: blobMocks.storeBlob,
  storeBlobVerified: blobMocks.storeBlob,
  getBlob: blobMocks.getBlob,
  deleteBlob: blobMocks.deleteBlob,
}));

const connectivityMocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@/lib/offline/connectivity", () => ({
  fetchWithTimeout: connectivityMocks.fetchWithTimeout,
  MEDIA_UPLOAD_TIMEOUT_MS: 8000,
}));

function makeFileItem(): CapturedMediaItem {
  const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
  return {
    localUrl: "blob:local",
    mimeType: "image/jpeg",
    file,
  };
}

function answersWithMedia(): AnswersMap {
  return {
    q1: {
      value: "fail",
      capturedFiles: [makeFileItem()],
    },
  };
}

describe("inspection-media-blobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blobMocks.storeBlob.mockResolvedValue("blob-123");
    blobMocks.getBlob.mockResolvedValue(new Blob(["photo"], { type: "image/jpeg" }));
    blobMocks.deleteBlob.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prepareInspectionMediaForSubmit defers files to blob store without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { prepareInspectionMediaForSubmit } = await import("@/lib/inspections/inspection-media-blobs");
    const { answers, deferredMedia } = await prepareInspectionMediaForSubmit(answersWithMedia());

    expect(blobMocks.storeBlob).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deferredMedia).toBe(true);
    expect(answers.q1.capturedFiles?.[0]?.pendingBlobId).toBe("blob-123");
    expect(answers.q1.capturedFiles?.[0]).not.toHaveProperty("file");
  });

  it("resolvePendingInspectionMedia uploads blob and sets serverUrl", async () => {
    connectivityMocks.fetchWithTimeout.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ storageUrl: "https://cdn.example/photo.jpg" }),
    });

    const { resolvePendingInspectionMedia } = await import("@/lib/inspections/inspection-media-blobs");
    const answers: AnswersMap = {
      q1: {
        value: "fail",
        capturedFiles: [{
          localUrl: "blob:local",
          mimeType: "image/jpeg",
          file: undefined as unknown as File,
          pendingBlobId: "blob-123",
        }],
      },
    };

    const resolved = await resolvePendingInspectionMedia(answers);
    expect(connectivityMocks.fetchWithTimeout).toHaveBeenCalledWith(
      "/api/upload/field-media",
      expect.objectContaining({ method: "POST" }),
      8000,
    );
    expect(resolved.q1.capturedFiles?.[0]?.serverUrl).toBe("https://cdn.example/photo.jpg");
    expect(resolved.q1.capturedFiles?.[0]?.pendingBlobId).toBeUndefined();
    expect(blobMocks.deleteBlob).toHaveBeenCalledWith("blob-123");
  });

  it("resolvePendingInspectionMedia still succeeds when blob delete fails", async () => {
    connectivityMocks.fetchWithTimeout.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ storageUrl: "https://cdn.example/photo.jpg" }),
    });
    blobMocks.deleteBlob.mockRejectedValue(new Error("idb locked"));

    const { resolvePendingInspectionMedia } = await import("@/lib/inspections/inspection-media-blobs");
    const resolved = await resolvePendingInspectionMedia({
      q1: {
        value: "fail",
        capturedFiles: [{
          localUrl: "blob:local",
          mimeType: "image/jpeg",
          file: undefined as unknown as File,
          pendingBlobId: "blob-123",
        }],
      },
    });

    expect(resolved.q1.capturedFiles?.[0]?.serverUrl).toBe("https://cdn.example/photo.jpg");
  });

  it("resolvePendingInspectionMedia throws when deferred blob is missing", async () => {
    blobMocks.getBlob.mockResolvedValue(null);
    const { resolvePendingInspectionMedia } = await import("@/lib/inspections/inspection-media-blobs");
    await expect(resolvePendingInspectionMedia({
      q1: {
        value: "fail",
        capturedFiles: [{
          localUrl: "blob:local",
          mimeType: "image/jpeg",
          file: undefined as unknown as File,
          pendingBlobId: "blob-missing",
        }],
      },
    })).rejects.toThrow(/blob missing/);
  });

  it("does not delete local blobs when one of several uploads fails (slow network retry)", async () => {
    connectivityMocks.fetchWithTimeout
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ storageUrl: "https://cdn.example/a.jpg" }),
      })
      .mockRejectedValueOnce(new Error("timeout"));

    blobMocks.getBlob.mockImplementation(async (id: string) =>
      new Blob([id], { type: "image/jpeg" }),
    );

    const { resolvePendingInspectionMedia } = await import("@/lib/inspections/inspection-media-blobs");
    const pendingItem = (blobId: string): CapturedMediaItem => ({
      localUrl: "blob:local",
      mimeType: "image/jpeg",
      file: undefined as unknown as File,
      pendingBlobId: blobId,
    });

    await expect(resolvePendingInspectionMedia({
      q1: {
        value: "fail",
        capturedFiles: [pendingItem("blob-a"), pendingItem("blob-b")],
      },
    })).rejects.toThrow(/timeout/);

    expect(blobMocks.deleteBlob).not.toHaveBeenCalled();
  });

  it("rehydratePendingInspectionMediaForDisplay restores localUrl from pendingBlobId", async () => {
    blobMocks.getBlob.mockResolvedValue(new Blob(["photo"], { type: "image/jpeg" }));
    const createObjectURL = vi.fn(() => "blob:rehydrated");
    vi.stubGlobal("URL", { ...URL, createObjectURL });

    const { rehydratePendingInspectionMediaForDisplay } = await import(
      "@/lib/inspections/inspection-media-blobs"
    );

    const answers = await rehydratePendingInspectionMediaForDisplay({
      q1: {
        value: "fail",
        deficiencies: [{
          id: "d1",
          description: "",
          count: 1,
          capturedFiles: [{
            localUrl: "blob:stale",
            mimeType: "image/jpeg",
            pendingBlobId: "blob-123",
          }],
        }],
      },
    });

    expect(createObjectURL).toHaveBeenCalled();
    expect(answers.q1.deficiencies?.[0]?.capturedFiles?.[0]?.localUrl).toBe("blob:rehydrated");
    expect(answers.q1.deficiencies?.[0]?.capturedFiles?.[0]?.file).toBeInstanceOf(File);
  });

  it("answersHavePendingMedia detects pendingBlobId without serverUrl", async () => {
    const { answersHavePendingMedia } = await import("@/lib/inspections/inspection-media-blobs");
    expect(answersHavePendingMedia({
      q1: {
        value: "x",
        capturedFiles: [{ localUrl: "blob:", mimeType: "image/jpeg", file: undefined as unknown as File, pendingBlobId: "b1" }],
      },
    })).toBe(true);
    expect(answersHavePendingMedia({
      q1: {
        value: "x",
        capturedFiles: [{ localUrl: "blob:", mimeType: "image/jpeg", file: undefined as unknown as File, serverUrl: "https://x" }],
      },
    })).toBe(false);
  });
});
