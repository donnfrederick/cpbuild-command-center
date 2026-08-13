import "server-only";

import {
  contentTypeForFieldMediaKey,
  isSupabaseFieldMediaConfigured,
  isValidFieldMediaStorageKey,
  readLocalFieldMediaFileWithinMaxBytes,
} from "@/lib/field-media-local";
import {
  isAllowedPdfImageFetchUrl,
  PDF_IMAGE_FETCH_MAX_BYTES,
  resolveUrlForPdfImageFetch,
} from "@/lib/pdf/fetch-image-for-pdf";
import { getSupabaseUrl } from "@/lib/supabase-url";

export interface FieldMediaReference {
  storageUrl: string;
  storageKey?: string | null;
  mimeType?: string;
}

export interface FieldMediaFetchOptions {
  /** Same origin as the export request — used to allow same-origin HTTP fallback. */
  appOrigin?: string | null;
}

function bufferWithinPdfLimit(buf: Buffer): boolean {
  return buf.byteLength <= PDF_IMAGE_FETCH_MAX_BYTES;
}

function toDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Parse storage key from local file proxy URL or Supabase object paths. */
export function storageKeyFromFieldMediaUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const keyParam = parsed.searchParams.get("key");
    if (keyParam) {
      if (isValidFieldMediaStorageKey(keyParam)) return keyParam;
    }

    const pathname = parsed.pathname;
    for (const marker of [
      "/storage/v1/object/sign/field-media/",
      "/storage/v1/object/public/field-media/",
      "/storage/v1/object/authenticated/field-media/",
      "/storage/v1/object/field-media/",
    ]) {
      const idx = pathname.indexOf(marker);
      if (idx >= 0) {
        const key = `field-media/${pathname.slice(idx + marker.length)}`;
        if (isValidFieldMediaStorageKey(key.split("?")[0] ?? key)) {
          return (key.split("?")[0] ?? key);
        }
      }
    }

    const bareMarker = "/field-media/";
    const bareIdx = pathname.indexOf(bareMarker);
    if (bareIdx >= 0) {
      const key = `field-media/${pathname.slice(bareIdx + bareMarker.length)}`;
      const clean = key.split("?")[0] ?? key;
      if (isValidFieldMediaStorageKey(clean)) return clean;
    }
  } catch {
    const marker = "field-media/";
    const markerIndex = url.indexOf(marker);
    if (markerIndex >= 0) {
      const key = url.slice(markerIndex).split(/[?#]/)[0] ?? "";
      if (isValidFieldMediaStorageKey(key)) return key;
    }
  }
  return null;
}

function resolveStorageKey(ref: FieldMediaReference): string | null {
  if (ref.storageKey && isValidFieldMediaStorageKey(ref.storageKey)) {
    return ref.storageKey;
  }
  return storageKeyFromFieldMediaUrl(ref.storageUrl);
}

function supabaseStorageHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
}

async function readSupabaseObject(storageKey: string): Promise<Buffer | null> {
  if (!isSupabaseFieldMediaConfigured()) return null;
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) return null;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const objectUrl = `${supabaseUrl}/storage/v1/object/${storageKey}`;
  const headers = supabaseStorageHeaders(serviceRoleKey);

  try {
    const headRes = await fetch(objectUrl, {
      method: "HEAD",
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (headRes.ok) {
      const headLen = headRes.headers.get("content-length");
      if (headLen) {
        const len = Number.parseInt(headLen, 10);
        if (Number.isFinite(len) && len > PDF_IMAGE_FETCH_MAX_BYTES) return null;
      }
    }

    const res = await fetch(objectUrl, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      const len = Number.parseInt(contentLength, 10);
      if (Number.isFinite(len) && len > PDF_IMAGE_FETCH_MAX_BYTES) return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!bufferWithinPdfLimit(buf)) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Load field-media bytes for PDF/export pipelines.
 * Prefers storageKey (local disk or Supabase service role) so server-side fetch
 * does not depend on session cookies on /api/upload/field-media/file.
 */
export async function fetchFieldMediaImageAsBase64(
  ref: FieldMediaReference,
  opts?: FieldMediaFetchOptions,
): Promise<string | null> {
  const mimeFallback =
    ref.mimeType && ref.mimeType.startsWith("image/") ? ref.mimeType : "image/jpeg";
  const key = resolveStorageKey(ref);

  if (key) {
    const local = await readLocalFieldMediaFileWithinMaxBytes(key, PDF_IMAGE_FETCH_MAX_BYTES);
    if (local) {
      const mime = ref.mimeType ?? contentTypeForFieldMediaKey(key);
      return toDataUrl(local, mime);
    }

    const remote = await readSupabaseObject(key);
    if (remote) {
      const mime = ref.mimeType ?? contentTypeForFieldMediaKey(key);
      return toDataUrl(remote, mime);
    }
  }

  if (!ref.storageUrl) return null;

  const resolved = resolveUrlForPdfImageFetch(ref.storageUrl, opts?.appOrigin ?? null);
  if (!isAllowedPdfImageFetchUrl(resolved, opts?.appOrigin ?? null)) return null;

  try {
    const res = await fetch(resolved, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      const len = Number.parseInt(contentLength, 10);
      if (Number.isFinite(len) && len > PDF_IMAGE_FETCH_MAX_BYTES) return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!bufferWithinPdfLimit(buf)) return null;

    const mime = res.headers.get("content-type") ?? mimeFallback;
    return toDataUrl(buf, mime);
  } catch {
    return null;
  }
}
