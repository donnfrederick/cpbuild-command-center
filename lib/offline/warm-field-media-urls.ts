/**
 * Best-effort prefetch of field-media URLs found in an offline snapshot payload.
 * Runs during explicit pre-download only — warms the browser cache for thumbnails.
 */

import { runBatchedFetches } from "@/lib/offline/run-batched-fetches";
import { PRE_DOWNLOAD_MEDIA_BATCH_SIZE } from "@/lib/offline/pre-download-batch";

const MAX_URLS = 120;

function collectUrls(value: unknown, out: Set<string>): void {
  if (out.size >= MAX_URLS) return;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) && /\.(jpe?g|png|gif|webp|heic|heif|mp4|mov|webm)(\?|$)/i.test(value)) {
      out.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === "storageUrl" && typeof nested === "string" && nested.startsWith("http")) {
        out.add(nested);
      } else {
        collectUrls(nested, out);
      }
    }
  }
}

/** URLs to warm from snapshot JSON (capped at MAX_URLS). */
export function collectFieldMediaUrls(
  data: Record<string, unknown> | undefined,
): string[] {
  if (!data) return [];
  const urls = new Set<string>();
  collectUrls(data, urls);
  return [...urls].slice(0, MAX_URLS);
}

export async function warmFieldMediaUrlsFromSnapshotData(
  data: Record<string, unknown> | undefined,
  options?: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<void> {
  if (typeof window === "undefined" || !data) return;

  const list = collectFieldMediaUrls(data);
  if (list.length === 0) {
    options?.onProgress?.(0, 0);
    return;
  }

  await runBatchedFetches(list, {
    batchSize: PRE_DOWNLOAD_MEDIA_BATCH_SIZE,
    signal: options?.signal,
    fetchInit: { mode: "no-cors", cache: "force-cache" },
    onBatchDone: options?.onProgress,
  });
}
