/**
 * Background smart sync for offline-enabled projects.
 *
 * Two mechanisms:
 *  1. Background Sync API (Chrome/Edge) — registers a SW sync tag that
 *     fires when the device reconnects, even if the tab is closed.
 *  2. 15-minute interval fallback (Safari + tab-open) — probes /api/connectivity
 *     first to confirm quality before triggering a full resync.
 *
 * Eager in-project sync:
 *  When a user navigates into a project that has offline enabled, call
 *  activateEagerSync(projectId) to start a 2-minute interval that silently
 *  re-downloads just that project's snapshot and flushes queued mutations.
 *  Call deactivateEagerSync() on unmount.
 *
 * Both mechanisms call triggerResync(), which fetches the snapshot and warms
 * the project-api-v2 SW cache for each offline-enabled project. Unit album routes:
 * full warm once per project per browser session, then only session-touched units
 * (full pre-download still warms every unit).
 *
 * Call initBackgroundSync() once from the root layout client component.
 */

import { flushMutationQueue } from "@/lib/offline/mutation-queue";
import { isConnectionGood } from "@/lib/offline/connectivity";
import {
  albumWarmApiUrls,
  projectWarmApiUrls,
  resolveWarmHtmlSubPages,
  unitRefsFromSnapshotUnits,
  warmHtmlLocales,
  type WarmHtmlMode,
} from "@/lib/offline/project-warm-paths";
import { percentInRange, runBatchedFetches } from "@/lib/offline/run-batched-fetches";
import { runBatchedFrameLoads } from "@/lib/offline/run-batched-frame-loads";
import {
  PRE_DOWNLOAD_ALBUM_API_BATCH_SIZE,
  PRE_DOWNLOAD_CORE_API_BATCH_SIZE,
  PRE_DOWNLOAD_HTML_BATCH_SIZE,
} from "@/lib/offline/pre-download-batch";
import {
  collectFieldMediaUrls,
  warmFieldMediaUrlsFromSnapshotData,
} from "@/lib/offline/warm-field-media-urls";
import {
  markSessionFullAlbumWarm,
  planBackgroundAlbumWarm,
} from "@/lib/offline/album-warm-session";
import type { PreDownloadPhase, ResyncProgressCallback } from "@/lib/offline/resync-progress";

const SNAPSHOT_URL = "/api/offline/snapshot";
const CACHE_NAME = "offline-data-v1";
const GLOBAL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes — global background tab
const EAGER_INTERVAL_MS = 2 * 60 * 1000;   // 2 minutes — while inside a project

export interface ResyncResult {
  ok: boolean;
  syncedAt: string | null;
  /**
   * True when this call was skipped because another triggerResync was already
   * in flight. The caller's data will be warmed by the in-flight call.
   * Background callers (15-min, 2-min eager) can ignore this.
   * triggerDownload treats skipped as a non-failure (keeps optimistic state).
   */
  skipped?: boolean;
  /** User cancelled via cancelActiveResync(). */
  cancelled?: boolean;
}

let activeResyncAbort: AbortController | null = null;

/** Abort an in-flight explicit pre-download / resync (no-op if none running). */
export function cancelActiveResync(): void {
  activeResyncAbort?.abort();
}

/**
 * Module-level mutex — JS is single-threaded so a boolean flag is race-safe.
 * Prevents overlapping sync calls from the three concurrent timers:
 *   • 15-min global interval (initBackgroundSync)
 *   • 2-min eager interval (activateEagerSync)
 *   • Auto-warm on project entry (EagerSyncActivator)
 * The first caller wins; all others return immediately with skipped: true.
 */
let syncInFlight = false;

/**
 * Fetch snapshot, cache it, warm per-project API endpoints, flush pending mutations.
 * Calls onProgress(pct 0-100) at each milestone.
 *
 * @param options.warmHtml  - false (default): API + snapshot only.
 *   true: full pre-download HTML (all sub-pages, en + es).
 *   "minimal": hub + units + log pages, en only — used on project entry auto-warm.
 * @param options.autoForce - When true, appends &autoWarm=1 to the snapshot
 *   fetch URL so the server bypasses the offlineProjectIds preference filter.
 *   Used by EagerSyncActivator to cache any project the user navigates to,
 *   not just ones they've explicitly opted into. The cache key always uses the
 *   clean URL (without autoWarm) so snapshots land under a consistent key.
 */
export async function triggerResync(
  projectIds?: string[],
  onProgress?: ResyncProgressCallback,
  options?: { warmHtml?: WarmHtmlMode; autoForce?: boolean; warmMedia?: boolean; signal?: AbortSignal },
): Promise<ResyncResult> {
  if (syncInFlight) {
    return { ok: true, syncedAt: null, skipped: true };
  }
  syncInFlight = true;

  const ownedAbort = options?.signal ? null : new AbortController();
  if (ownedAbort) activeResyncAbort = ownedAbort;
  const signal = options?.signal ?? ownedAbort?.signal;

  const report = (
    phase: PreDownloadPhase,
    percent: number,
    step?: number,
    stepTotal?: number,
  ) => {
    onProgress?.({ phase, percent, step, stepTotal });
  };

  try {
    report("preparing", 2);

    const baseUrl = projectIds?.length
      ? `${SNAPSHOT_URL}?projectIds=${projectIds.join(",")}`
      : SNAPSHOT_URL;
    const fetchUrl =
      options?.autoForce && projectIds?.length ? `${baseUrl}&autoWarm=1` : baseUrl;
    const cacheKey = baseUrl;

    report("fetchingSnapshot", 8);

    let res: Response;
    try {
      res = await fetch(fetchUrl, { cache: "reload", signal });
    } catch (err) {
      if (signal?.aborted) return { ok: false, syncedAt: null, cancelled: true };
      return { ok: false, syncedAt: null };
    }
    if (!res.ok) return { ok: false, syncedAt: null };

    report("fetchingSnapshot", 22);

    report("savingSnapshot", 28);
    try {
      if ("caches" in window) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheKey, res.clone());
      }
    } catch {
      // Cache write failed — non-critical
    }

    let snapshot: {
      data?: {
        projects?: Array<{ id: string }>;
        units?: unknown[];
      };
      generatedAt?: string;
    } = {};
    try {
      snapshot = (await res.json()) as typeof snapshot;
    } catch {
      return { ok: false, syncedAt: null };
    }

    report("savingSnapshot", 34);

    const ids: string[] = (snapshot.data?.projects ?? []).map((p) => p.id);
    const allUnits = snapshot.data?.units ?? [];

    const sharedApiUrls = [
      "/api/projects",
      "/api/unifier/subcontractors",
      "/api/forms?status=published",
    ];
    const coreProjectApiUrls = ids.flatMap((id) => projectWarmApiUrls(id));

    const fullPreDownload = options?.warmHtml === true;
    let albumApiUrls: string[] = [];
    let markFullAlbumWarmProjectIds: string[] = [];

    if (fullPreDownload) {
      albumApiUrls = ids.flatMap((id) =>
        albumWarmApiUrls(id, unitRefsFromSnapshotUnits(allUnits, id)),
      );
    } else if (ids.length > 0) {
      const unitRefsByProjectId: Record<string, string[]> = {};
      for (const id of ids) {
        unitRefsByProjectId[id] = unitRefsFromSnapshotUnits(allUnits, id);
      }
      const plan = planBackgroundAlbumWarm(ids, unitRefsByProjectId);
      albumApiUrls = plan.urls;
      markFullAlbumWarmProjectIds = plan.markFullWarmProjectIds;
    }
    const totalApiWarm =
      sharedApiUrls.length + coreProjectApiUrls.length + albumApiUrls.length;

    report("warmingApis", 36, 0, totalApiWarm);
    try {
      let apiWarmDone = 0;
      const reportApiWarm = (done: number) => {
        apiWarmDone = done;
        report(
          "warmingApis",
          percentInRange(apiWarmDone, totalApiWarm, 36, 52),
          apiWarmDone,
          totalApiWarm,
        );
      };

      const coreCount = sharedApiUrls.length + coreProjectApiUrls.length;
      await runBatchedFetches([...sharedApiUrls, ...coreProjectApiUrls], {
        batchSize: PRE_DOWNLOAD_CORE_API_BATCH_SIZE,
        signal,
        onBatchDone: (done) => reportApiWarm(done),
      });

      if (albumApiUrls.length > 0) {
        await runBatchedFetches(albumApiUrls, {
          batchSize: PRE_DOWNLOAD_ALBUM_API_BATCH_SIZE,
          signal,
          onBatchDone: (done) => reportApiWarm(coreCount + done),
        });
        for (const projectId of markFullAlbumWarmProjectIds) {
          markSessionFullAlbumWarm(projectId);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { ok: false, syncedAt: null, cancelled: true };
      }
      throw err;
    }

    const warmHtmlMode = options?.warmHtml ?? false;
    const htmlSubPages = resolveWarmHtmlSubPages(warmHtmlMode);
    if (htmlSubPages.length > 0 && ids.length > 0) {
      const locales = warmHtmlLocales(warmHtmlMode);
      const hubUrls = ids.flatMap((id) =>
        locales.flatMap((locale) =>
          htmlSubPages
            .filter((sub) => sub === "")
            .map((sub) => `/${locale}/projects/${id}${sub}`),
        ),
      );
      const otherHtmlUrls = ids.flatMap((id) =>
        locales.flatMap((locale) =>
          htmlSubPages
            .filter((sub) => sub !== "")
            .map((sub) => `/${locale}/projects/${id}${sub}`),
        ),
      );
      const totalHtmlWarm = hubUrls.length + otherHtmlUrls.length;

      report("warmingPages", 54, 0, totalHtmlWarm);
      try {
        let htmlWarmDone = 0;
        const reportHtmlWarm = () => {
          report(
            "warmingPages",
            percentInRange(htmlWarmDone, totalHtmlWarm, 54, 70),
            htmlWarmDone,
            totalHtmlWarm,
          );
        };

        await runBatchedFrameLoads(hubUrls, {
          signal,
          onBatchDone: (done) => {
            htmlWarmDone = done;
            reportHtmlWarm();
          },
        });

        // Iframe warm loads JS/CSS chunks but does not reliably write hub HTML into
        // pages-v1 on mobile PWAs — openCachedProjectPage needs an explicit entry.
        if (hubUrls.length > 0) {
          await runBatchedFetches(hubUrls, {
            batchSize: PRE_DOWNLOAD_HTML_BATCH_SIZE,
            signal,
            fetchInit: { headers: { Accept: "text/html" } },
            cachePages: true,
          });
        }

        const warmMedia =
          options?.warmMedia !== false && warmHtmlMode === true && snapshot.data;
        const mediaUrlCount = warmMedia
          ? collectFieldMediaUrls(snapshot.data as Record<string, unknown>).length
          : 0;
        const postHubTotal = otherHtmlUrls.length + mediaUrlCount;
        const progressEnd = mediaUrlCount > 0 ? 86 : 70;

        let htmlSubDone = 0;
        let mediaDone = 0;
        const reportPostHub = () => {
          const combined = htmlSubDone + mediaDone;
          const phase: PreDownloadPhase =
            mediaUrlCount > 0 && htmlSubDone >= otherHtmlUrls.length
              ? "warmingMedia"
              : "warmingPages";
          report(
            phase,
            percentInRange(
              hubUrls.length + combined,
              hubUrls.length + postHubTotal,
              54,
              progressEnd,
            ),
            hubUrls.length + combined,
            hubUrls.length + postHubTotal,
          );
        };

        await Promise.all([
          runBatchedFetches(otherHtmlUrls, {
            batchSize: PRE_DOWNLOAD_HTML_BATCH_SIZE,
            signal,
            fetchInit: { headers: { Accept: "text/html" } },
            cachePages: true,
            onBatchDone: (done) => {
              htmlSubDone = done;
              reportPostHub();
            },
          }),
          warmMedia
            ? warmFieldMediaUrlsFromSnapshotData(
                snapshot.data as Record<string, unknown>,
                {
                  signal,
                  onProgress: (done) => {
                    mediaDone = done;
                    reportPostHub();
                  },
                },
              )
            : Promise.resolve(),
        ]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return { ok: false, syncedAt: null, cancelled: true };
        }
        throw err;
      }
    }

    report("finishing", 88);
    try {
      await flushMutationQueue();
    } catch {
      // Non-critical
    }

    report("finishing", 100);

    return { ok: true, syncedAt: snapshot.generatedAt ?? new Date().toISOString() };
  } finally {
    syncInFlight = false;
    if (ownedAbort && activeResyncAbort === ownedAbort) {
      activeResyncAbort = null;
    }
  }
}

// ─── Global background interval ───────────────────────────────────────────────

let globalIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize global background sync. Safe to call multiple times — second call is a no-op.
 * Must be called from a client component (requires window/navigator).
 */
export function initBackgroundSync(): void {
  if (typeof window === "undefined") return;
  if (globalIntervalId !== null) return;

  // Mechanism 1 — Background Sync API (Chrome/Edge)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        if ("sync" in reg) {
          return (reg.sync as { register: (tag: string) => Promise<void> }).register(
            "cc-offline-resync"
          );
        }
      })
      .catch(() => {/* SW not ready or sync not supported */});
  }

  // Mechanism 2 — 15-minute interval fallback (Safari + tab-open)
  globalIntervalId = setInterval(async () => {
    if (!navigator.onLine) return;
    const good = await isConnectionGood();
    if (good) {
      await triggerResync();
    }
  }, GLOBAL_INTERVAL_MS);
}

// ─── Eager in-project sync ────────────────────────────────────────────────────

let eagerIntervalId: ReturnType<typeof setInterval> | null = null;
let eagerProjectId: string | null = null;

/**
 * Start a 2-minute eager sync loop scoped to a single project.
 * Silently re-downloads the project snapshot and flushes the mutation queue.
 * Safe to call multiple times with the same projectId (no-op if already active).
 * Replaces any existing eager interval if called with a different projectId.
 */
export function activateEagerSync(
  projectId: string,
  onProgress?: ResyncProgressCallback,
): void {
  if (typeof window === "undefined") return;
  if (eagerIntervalId !== null && eagerProjectId === projectId) return;

  // Replace any stale eager interval for a different project
  if (eagerIntervalId !== null) {
    clearInterval(eagerIntervalId);
    eagerIntervalId = null;
  }

  eagerProjectId = projectId;

  eagerIntervalId = setInterval(async () => {
    if (!navigator.onLine) return;
    const good = await isConnectionGood();
    if (good) {
      await triggerResync([projectId], onProgress);
    }
  }, EAGER_INTERVAL_MS);
}

/**
 * Stop the eager in-project sync loop.
 * Call from the project page's cleanup (useEffect return / onUnmount).
 */
export function deactivateEagerSync(): void {
  if (eagerIntervalId !== null) {
    clearInterval(eagerIntervalId);
    eagerIntervalId = null;
    eagerProjectId = null;
  }
}
