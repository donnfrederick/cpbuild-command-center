import { putPageInCache } from "@/lib/offline/pages-cache";

const DEFAULT_BATCH_SIZE = 6;

/**
 * Fetch URLs in small batches so progress can update and the main thread stays responsive.
 * Throws AbortError when signal is aborted between batches.
 */
export async function runBatchedFetches(
  urls: string[],
  options: {
    batchSize?: number;
    signal?: AbortSignal;
    fetchInit?: RequestInit;
    /** When true, successful HTML responses are written to pages-v1 explicitly. */
    cachePages?: boolean;
    onBatchDone?: (done: number, total: number) => void;
  } = {},
): Promise<void> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const total = urls.length;
  if (total === 0) {
    options.onBatchDone?.(0, 0);
    return;
  }

  let done = 0;
  for (let i = 0; i < urls.length; i += batchSize) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const batch = urls.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const res = await fetch(url, { ...options.fetchInit, signal: options.signal });
          if (options.cachePages && res.ok) {
            await putPageInCache(url, res);
          }
        } catch {
          // Individual URL failures are non-fatal during warm.
        }
      }),
    );
    done = Math.min(done + batch.length, total);
    options.onBatchDone?.(done, total);
  }
}

export function percentInRange(
  done: number,
  total: number,
  rangeStart: number,
  rangeEnd: number,
): number {
  if (total <= 0) return rangeEnd;
  const ratio = done / total;
  return Math.round(rangeStart + ratio * (rangeEnd - rangeStart));
}
