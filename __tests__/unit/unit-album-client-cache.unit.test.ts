import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  invalidateUnitAlbumClientCache,
  readUnitAlbumClientCache,
  unitAlbumClientCache,
  UNIT_ALBUM_UPDATED_EVENT,
  unitRefsNeedingAlbumFetch,
  writeUnitAlbumClientCache,
} from "@/lib/media/unit-album-client-cache";
import type { AlbumItem } from "@/lib/media/album-types";

const sampleItem: AlbumItem = {
  id: "a1",
  storageUrl: "https://example.com/photo.jpg",
  mimeType: "image/jpeg",
  fileSizeBytes: null,
  caption: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  source: { type: "general", label: null, entityId: null },
};

describe("unitAlbumClientCache", () => {
  beforeEach(() => {
    unitAlbumClientCache.clear();
  });

  it("writes and reads cached album rows", () => {
    writeUnitAlbumClientCache("proj", "B|1|101", [sampleItem]);
    expect(readUnitAlbumClientCache("proj", "B|1|101")).toEqual([sampleItem]);
  });

  it("dispatches update event when cache is invalidated", () => {
    const handler = vi.fn();
    window.addEventListener(UNIT_ALBUM_UPDATED_EVENT, handler);
    writeUnitAlbumClientCache("proj", "B|1|101", [sampleItem]);

    invalidateUnitAlbumClientCache("proj", "B|1|101");

    expect(readUnitAlbumClientCache("proj", "B|1|101")).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNIT_ALBUM_UPDATED_EVENT, handler);
  });

  it("returns only unit refs without a cached album fetch", () => {
    writeUnitAlbumClientCache("proj", "B|1|101", [sampleItem]);
    writeUnitAlbumClientCache("proj", "B|1|102", []);

    expect(unitRefsNeedingAlbumFetch("proj", ["B|1|101", "B|1|102", "B|1|103"])).toEqual([
      "B|1|103",
    ]);
  });
});
