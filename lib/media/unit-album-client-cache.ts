import type { AlbumItem } from "@/lib/media/album-types";

/** In-memory album rows keyed by `${projectId}::${unitRef}`. */
export const unitAlbumClientCache = new Map<string, AlbumItem[]>();

export const UNIT_ALBUM_UPDATED_EVENT = "unit-album:updated";

export function unitAlbumCacheKey(projectId: string, unitRef: string): string {
  return `${projectId}::${unitRef}`;
}

export function readUnitAlbumClientCache(
  projectId: string,
  unitRef: string,
): AlbumItem[] | undefined {
  return unitAlbumClientCache.get(unitAlbumCacheKey(projectId, unitRef));
}

export function writeUnitAlbumClientCache(
  projectId: string,
  unitRef: string,
  items: AlbumItem[],
): void {
  unitAlbumClientCache.set(unitAlbumCacheKey(projectId, unitRef), items);
}

export function invalidateUnitAlbumClientCache(
  projectId: string,
  unitRef: string,
): void {
  unitAlbumClientCache.delete(unitAlbumCacheKey(projectId, unitRef));
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(UNIT_ALBUM_UPDATED_EVENT, {
        detail: { projectId, unitRef },
      }),
    );
  }
}

/** Unit refs with no in-memory album fetch yet this session (used for bulk-load progress). */
export function unitRefsNeedingAlbumFetch(
  projectId: string,
  unitRefs: readonly string[],
): string[] {
  return unitRefs.filter((unitRef) => readUnitAlbumClientCache(projectId, unitRef) === undefined);
}
