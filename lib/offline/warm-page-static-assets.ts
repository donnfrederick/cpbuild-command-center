/** Matches Workbox CacheFirst rule for /_next/static/ in next.config.ts. */
export const STATIC_ASSETS_CACHE_NAME = "next-static-assets";

const STATIC_ASSET_PATH_RE = /\/_next\/static\/[^\s"'<>\\)]+/g;
const MAX_ASSETS_PER_PAGE = 64;

export function extractStaticAssetPaths(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(STATIC_ASSET_PATH_RE)) {
    const path = match[0].split("?")[0];
    if (path) found.add(path);
    if (found.size >= MAX_ASSETS_PER_PAGE) break;
  }
  return [...found];
}

/**
 * Prefetch CSS/JS chunks referenced by warmed HTML so offline document navigation
 * can load styled pages (HTML alone is not enough).
 */
export async function warmStaticAssetsFromHtml(html: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

  const paths = extractStaticAssetPaths(html);
  if (paths.length === 0) return;

  const cache = await caches.open(STATIC_ASSETS_CACHE_NAME);
  await Promise.allSettled(
    paths.map(async (path) => {
      const url = new URL(path, window.location.origin).href;
      const existing = await cache.match(url, { ignoreSearch: true });
      if (existing?.ok) return;
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) await cache.put(url, res.clone());
    }),
  );
}
