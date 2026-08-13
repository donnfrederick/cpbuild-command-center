import { PRE_DOWNLOAD_HUB_CHUNK_SETTLE_MS } from "@/lib/offline/pre-download-batch";

/**
 * Load a page in a hidden iframe while online so the browser (and SW) cache
 * the full document plus CSS/JS/font chunks — a fetch() of HTML alone misses
 * dynamically loaded chunks.
 */
export function warmPageViaHiddenFrame(
  url: string,
  signal?: AbortSignal,
  options?: { chunkSettleMs?: number },
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const absolute = new URL(url, window.location.origin).href;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      iframe.remove();
      resolve();
    };

    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none";
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.title = "";

    const loadTimeout: number = window.setTimeout(finish, 14_000);
    const onAbort = () => {
      window.clearTimeout(loadTimeout);
      if (chunkTimeout !== undefined) window.clearTimeout(chunkTimeout);
      finish();
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    const chunkSettleMs = options?.chunkSettleMs ?? PRE_DOWNLOAD_HUB_CHUNK_SETTLE_MS;
    let chunkTimeout: number | undefined;
    iframe.onload = () => {
      window.clearTimeout(loadTimeout);
      chunkTimeout = window.setTimeout(finish, chunkSettleMs);
    };
    iframe.onerror = () => {
      window.clearTimeout(loadTimeout);
      finish();
    };

    document.body.appendChild(iframe);
    iframe.src = absolute;
  });
}
