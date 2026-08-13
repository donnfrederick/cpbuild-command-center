import { warmStaticAssetsFromHtml } from "@/lib/offline/warm-page-static-assets";

/** Matches Workbox runtime cache in next.config.ts (pages-v1). */
export const PAGES_CACHE_NAME = "pages-v1";

function resolvePageCacheUrl(url: string): string {
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).href;
}

async function matchCachedPageResponse(
  cache: Cache,
  path: string,
): Promise<Response | undefined> {
  const absolute = resolvePageCacheUrl(path);
  return (
    (await cache.match(absolute)) ??
    (await cache.match(path)) ??
    (await cache.match(
      new Request(absolute, { headers: { Accept: "text/html,application/xhtml+xml" } }),
    )) ??
    undefined
  );
}

/**
 * Store warmed HTML in pages-v1 and prefetch linked /_next/static/ assets.
 */
export async function putPageInCache(url: string, response: Response): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  if (!response.ok) return;
  try {
    const cache = await caches.open(PAGES_CACHE_NAME);
    const absolute = resolvePageCacheUrl(url);
    const html = await response.clone().text();
    await cache.put(absolute, new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }));
    await warmStaticAssetsFromHtml(html);
  } catch {
    // Non-critical — SW may still have cached via NetworkFirst intercept.
  }
}

/**
 * Navigate to a pre-downloaded project using a real document load so CSS/JS apply.
 * Requires pages-v1 HTML and next-static-assets (warmed during pre-download).
 */
export async function openCachedProjectPage(
  locale: string,
  projectId: string,
): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) return false;

  const path = `/${locale}/projects/${projectId}`;

  try {
    const cache = await caches.open(PAGES_CACHE_NAME);
    const response = await matchCachedPageResponse(cache, path);
    if (!response?.ok) return false;

    window.location.assign(resolvePageCacheUrl(path));
    return true;
  } catch {
    return false;
  }
}

export async function hasCachedProjectPage(
  locale: string,
  projectId: string,
): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) return false;
  const path = `/${locale}/projects/${projectId}`;
  try {
    const cache = await caches.open(PAGES_CACHE_NAME);
    const response = await matchCachedPageResponse(cache, path);
    return response?.ok === true;
  } catch {
    return false;
  }
}
