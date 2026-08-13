import { warmPageViaHiddenFrame } from "@/lib/offline/warm-page-via-frame";
import { PRE_DOWNLOAD_HUB_IFRAME_PARALLEL } from "@/lib/offline/pre-download-batch";

/**
 * Load URLs in hidden iframes. Default parallelism is tuned for hub pages
 * (en + es) during pre-download — each iframe triggers many subresource fetches.
 */
export async function runBatchedFrameLoads(
  urls: string[],
  options: {
    signal?: AbortSignal;
    /** Max concurrent iframes per batch (default: pre-download hub tuning). */
    parallel?: number;
    onBatchDone?: (done: number, total: number) => void;
  } = {},
): Promise<void> {
  const total = urls.length;
  if (total === 0) {
    options.onBatchDone?.(0, 0);
    return;
  }

  const parallel = Math.max(1, options.parallel ?? PRE_DOWNLOAD_HUB_IFRAME_PARALLEL);
  let done = 0;

  for (let i = 0; i < urls.length; i += parallel) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const batch = urls.slice(i, i + parallel);
    await Promise.all(
      batch.map((url) => warmPageViaHiddenFrame(url, options.signal)),
    );
    done = Math.min(done + batch.length, total);
    options.onBatchDone?.(done, total);
  }
}
