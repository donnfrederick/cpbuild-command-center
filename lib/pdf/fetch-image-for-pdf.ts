/**
 * Prefetch images for Puppeteer PDFs. Local dev stores media at
 * `/api/upload/field-media/file?key=…` which requires an authenticated session;
 * a bare Node `fetch(storageUrl)` omits cookies and gets 401.
 */

const FIELD_MEDIA_FILE_PATH = "/api/upload/field-media/file";

/** Cap per-image bytes when embedding in PDFs (field uploads allow 50 MB; PDF embeds need less). */
export const PDF_IMAGE_FETCH_MAX_BYTES = 15 * 1024 * 1024;

const DEFAULT_PDF_IMAGE_PREFETCH_CONCURRENCY = 4;

export type PdfImageFetchContext = {
  /** `Cookie` header from the export POST request */
  cookieHeader?: string | null;
  /** Same origin as `absoluteAppOriginFromRequest` for that request */
  appOrigin?: string | null;
};

export type FetchImageAsBase64ForPdfOptions = PdfImageFetchContext & {
  /** When true, require `Content-Type` to start with `image/` (inspection export). */
  requireImageContentType?: boolean;
};

/** Visible for tests — rewrites local field-media URLs to the current app origin (fixes port skew). */
export function resolveUrlForPdfImageFetch(
  rawUrl: string,
  appOrigin: string | null | undefined,
): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;
  const origin = appOrigin?.replace(/\/$/, "") ?? "";

  if (trimmed.startsWith("/")) {
    return origin ? `${origin}${trimmed}` : trimmed;
  }

  try {
    const u = new URL(trimmed);
    if (u.pathname === FIELD_MEDIA_FILE_PATH) {
      return origin ? `${origin}${u.pathname}${u.search}` : trimmed;
    }
  } catch {
    /* not a valid absolute URL */
  }

  return trimmed;
}

function shouldForwardCookieForPdfFetch(
  resolvedUrl: string,
  appOrigin: string | null | undefined,
): boolean {
  if (!appOrigin) return false;
  try {
    const u = new URL(resolvedUrl);
    const base = new URL(appOrigin.replace(/\/$/, ""));
    return u.protocol === base.protocol && u.host === base.host;
  } catch {
    return false;
  }
}

function isSameOriginForPdfFetch(
  url: URL,
  appOrigin: string | null | undefined,
): boolean {
  if (!appOrigin) return false;
  try {
    const base = new URL(appOrigin.replace(/\/$/, ""));
    return url.protocol === base.protocol && url.host === base.host;
  } catch {
    return false;
  }
}

function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  const parts = h.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    const [a, b] = parts;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

export function isAllowedPdfImageFetchUrl(
  resolvedUrl: string,
  appOrigin: string | null | undefined,
): boolean {
  let u: URL;
  try {
    u = new URL(resolvedUrl);
  } catch {
    return false;
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (isSameOriginForPdfFetch(u, appOrigin)) return true;
  if (isPrivateOrLoopbackHostname(u.hostname)) return false;

  return u.protocol === "https:" && u.hostname.endsWith(".supabase.co");
}

export async function fetchImageAsBase64ForPdf(
  url: string,
  opts?: FetchImageAsBase64ForPdfOptions,
): Promise<string | null> {
  const resolved = resolveUrlForPdfImageFetch(url, opts?.appOrigin ?? null);
  if (!isAllowedPdfImageFetchUrl(resolved, opts?.appOrigin ?? null)) return null;
  const headers: Record<string, string> = {};
  if (
    opts?.cookieHeader &&
    shouldForwardCookieForPdfFetch(resolved, opts?.appOrigin ?? null)
  ) {
    headers.cookie = opts.cookieHeader;
  }

  try {
    const res = await fetch(resolved, {
      signal: AbortSignal.timeout(8000),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (opts?.requireImageContentType && !ct.startsWith("image/")) return null;

    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      const len = Number.parseInt(contentLength, 10);
      if (Number.isFinite(len) && len > PDF_IMAGE_FETCH_MAX_BYTES) return null;
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > PDF_IMAGE_FETCH_MAX_BYTES) return null;

    const b64 = Buffer.from(buf).toString("base64");
    const mime = ct.startsWith("image/")
      ? ct.split(";")[0]!.trim()
      : "image/jpeg";
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

/**
 * Prefetch de-duplicated image URLs with bounded concurrency to avoid memory/CPU
 * spikes on large log exports.
 */
export async function prefetchPdfImageCache(
  urls: string[],
  fetchOne: (url: string) => Promise<string | null>,
  concurrency = DEFAULT_PDF_IMAGE_PREFETCH_CONCURRENCY,
  onItemComplete?: (completed: number, total: number) => void,
): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(urls.filter((url) => url.trim().length > 0)));
  const cache = new Map<string, string | null>();
  if (unique.length === 0) return cache;

  let nextIndex = 0;
  let completed = 0;
  const workerCount = Math.min(Math.max(1, concurrency), unique.length);

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= unique.length) return;
      const url = unique[index]!;
      cache.set(url, await fetchOne(url));
      completed += 1;
      onItemComplete?.(completed, unique.length);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return cache;
}
