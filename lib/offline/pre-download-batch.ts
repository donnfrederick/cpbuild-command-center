/**
 * Concurrency tuning for explicit pre-download (manual warm).
 * Applies on prod and dev — higher than background resync defaults because
 * the user is waiting on the progress overlay.
 */

/** Shared + per-project core API routes (units, issues, forms, etc.). */
export const PRE_DOWNLOAD_CORE_API_BATCH_SIZE = 8;

/** Per-unit album routes — independent, safe to fetch with higher parallelism. */
export const PRE_DOWNLOAD_ALBUM_API_BATCH_SIZE = 12;

/** HTML sub-pages (fetch + pages-v1 cache). */
export const PRE_DOWNLOAD_HTML_BATCH_SIZE = 6;

/** Hub pages loaded in hidden iframes (en + es) — small parallel batch. */
export const PRE_DOWNLOAD_HUB_IFRAME_PARALLEL = 2;

/** Wait after iframe load for late JS chunks before tearing down. */
export const PRE_DOWNLOAD_HUB_CHUNK_SETTLE_MS = 1_500;

/** Field media URLs from snapshot JSON. */
export const PRE_DOWNLOAD_MEDIA_BATCH_SIZE = 10;
