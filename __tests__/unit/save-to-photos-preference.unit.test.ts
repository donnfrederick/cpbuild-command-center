import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SAVE_TO_PHOTOS_PREFERENCE_CHANGED_EVENT,
  SAVE_TO_PHOTOS_STORAGE_KEY,
  canUseWebShareForFiles,
  readSaveToPhotosPreference,
  saveCapturedMediaToDeviceIfEnabled,
  shareFilesToDevice,
  writeSaveToPhotosPreference,
} from "@/lib/save-to-photos-preference";

function mockLocalStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete store[k];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
    store,
  };
}

describe("save-to-photos-preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("readSaveToPhotosPreference / writeSaveToPhotosPreference", () => {
    it("defaults to false when key is absent", () => {
      const ls = mockLocalStorage();
      vi.stubGlobal("localStorage", ls);
      expect(readSaveToPhotosPreference()).toBe(false);
    });

    it("returns true when localStorage has true", () => {
      const ls = mockLocalStorage({ [SAVE_TO_PHOTOS_STORAGE_KEY]: "true" });
      vi.stubGlobal("localStorage", ls);
      expect(readSaveToPhotosPreference()).toBe(true);
    });

    it("writes true/false to localStorage and dispatches same-tab event", () => {
      const ls = mockLocalStorage();
      vi.stubGlobal("localStorage", ls);
      const handler = vi.fn();
      window.addEventListener(SAVE_TO_PHOTOS_PREFERENCE_CHANGED_EVENT, handler);

      writeSaveToPhotosPreference(true);
      expect(ls.setItem).toHaveBeenCalledWith(SAVE_TO_PHOTOS_STORAGE_KEY, "true");
      expect(handler).toHaveBeenCalledTimes(1);

      writeSaveToPhotosPreference(false);
      expect(ls.setItem).toHaveBeenCalledWith(SAVE_TO_PHOTOS_STORAGE_KEY, "false");

      window.removeEventListener(SAVE_TO_PHOTOS_PREFERENCE_CHANGED_EVENT, handler);
    });
  });

  describe("canUseWebShareForFiles", () => {
    it("returns false when navigator.share is missing", () => {
      vi.stubGlobal("navigator", {});
      expect(canUseWebShareForFiles()).toBe(false);
    });

    it("returns true when navigator.share exists", () => {
      vi.stubGlobal("navigator", { share: vi.fn() });
      expect(canUseWebShareForFiles()).toBe(true);
    });
  });

  describe("shareFilesToDevice", () => {
    const imageFile = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    const videoFile = new File(["vid"], "clip.mp4", { type: "video/mp4" });
    const audioFile = new File(["aud"], "note.m4a", { type: "audio/mp4" });

    beforeEach(() => {
      vi.stubGlobal("navigator", {
        share: vi.fn().mockResolvedValue(undefined),
        canShare: vi.fn().mockReturnValue(true),
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      });
    });

    it("shares image/video files in one batch when canShare accepts batch", async () => {
      const share = vi.mocked(navigator.share);
      const canShare = vi.mocked(navigator.canShare!);

      await shareFilesToDevice([imageFile, videoFile]);

      expect(canShare).toHaveBeenCalledWith({ files: [imageFile, videoFile] });
      expect(share).toHaveBeenCalledWith({ files: [imageFile, videoFile] });
    });

    it("falls back to per-file share when batch canShare is false", async () => {
      const share = vi.mocked(navigator.share);
      const canShare = vi.mocked(navigator.canShare!);
      canShare.mockImplementation((data: ShareData) => {
        const files = data.files ?? [];
        return files.length === 1;
      });

      await shareFilesToDevice([imageFile, videoFile]);

      expect(share).toHaveBeenCalledTimes(2);
      expect(share).toHaveBeenNthCalledWith(1, { files: [imageFile] });
      expect(share).toHaveBeenNthCalledWith(2, { files: [videoFile] });
    });

    it("still attempts share on iOS when canShare returns false", async () => {
      vi.stubGlobal("navigator", {
        share: vi.fn().mockResolvedValue(undefined),
        canShare: vi.fn().mockReturnValue(false),
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      });
      const share = vi.mocked(navigator.share);

      await shareFilesToDevice([imageFile]);

      expect(share).toHaveBeenCalledWith({ files: [imageFile] });
    });

    it("downloads on Android when share is unavailable", async () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (Linux; Android 14)",
      });
      const click = vi.fn();
      const anchor = { click, href: "", download: "", rel: "", style: { display: "" }, remove: vi.fn() };
      vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLAnchorElement);
      vi.spyOn(document.body, "appendChild").mockImplementation(() => anchor as unknown as Node);
      vi.stubGlobal("URL", {
        createObjectURL: vi.fn(() => "blob:mock"),
        revokeObjectURL: vi.fn(),
      });

      await shareFilesToDevice([imageFile]);

      expect(click).toHaveBeenCalled();
    });

    it("skips audio-only files", async () => {
      const share = vi.mocked(navigator.share);
      await shareFilesToDevice([audioFile]);
      expect(share).not.toHaveBeenCalled();
    });

    it("swallows AbortError from user cancel", async () => {
      const share = vi.mocked(navigator.share);
      share.mockRejectedValue(new DOMException("Aborted", "AbortError"));

      await expect(shareFilesToDevice([imageFile])).resolves.toBeUndefined();
    });

    it("no-ops when share API is unavailable on iOS", async () => {
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      });
      await expect(shareFilesToDevice([imageFile])).resolves.toBeUndefined();
    });
  });

  describe("saveCapturedMediaToDeviceIfEnabled", () => {
    const imageFile = new File(["img"], "photo.jpg", { type: "image/jpeg" });

    beforeEach(() => {
      vi.stubGlobal("navigator", {
        share: vi.fn().mockResolvedValue(undefined),
        canShare: vi.fn().mockReturnValue(true),
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      });
    });

    it("does nothing when preference is off", () => {
      const ls = mockLocalStorage();
      vi.stubGlobal("localStorage", ls);
      saveCapturedMediaToDeviceIfEnabled([imageFile]);
      expect(navigator.share).not.toHaveBeenCalled();
    });

    it("starts share when preference is on", async () => {
      const ls = mockLocalStorage({ [SAVE_TO_PHOTOS_STORAGE_KEY]: "true" });
      vi.stubGlobal("localStorage", ls);
      saveCapturedMediaToDeviceIfEnabled([imageFile]);
      await Promise.resolve();
      expect(navigator.share).toHaveBeenCalled();
    });
  });
});
