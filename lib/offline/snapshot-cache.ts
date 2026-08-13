/**
 * Canonical client-side reader for offline-data-v1 snapshot entries.
 * Prefer project-scoped cache keys when projectId is known.
 */

export const SNAPSHOT_CACHE_NAME = "offline-data-v1";
export const SNAPSHOT_URL_PREFIX = "/api/offline/snapshot";

export interface SnapshotPayload {
  generatedAt?: string;
  data?: Record<string, unknown>;
}

/** Find the best-matched snapshot Request in Cache Storage. */
export async function findSnapshotCacheKey(projectId?: string): Promise<Request | undefined> {
  if (typeof window === "undefined" || !("caches" in window)) return undefined;

  const cache = await caches.open(SNAPSHOT_CACHE_NAME);
  const cacheKeys = await cache.keys();
  const snapshotCandidates = cacheKeys.filter((req) => req.url.includes(SNAPSHOT_URL_PREFIX));
  if (snapshotCandidates.length === 0) return undefined;

  if (projectId) {
    const scopedCandidates = snapshotCandidates.filter((req) => {
      try {
        const ids = new URL(req.url).searchParams.get("projectIds");
        return ids ? ids.split(",").map((s) => s.trim()).includes(projectId) : false;
      } catch {
        return false;
      }
    });
    if (scopedCandidates.length > 0) {
      return pickLatestSnapshotRequest(cache, scopedCandidates);
    }
  }

  return pickLatestSnapshotRequest(cache, snapshotCandidates);
}

async function pickLatestSnapshotRequest(
  cache: Cache,
  candidates: Request[],
): Promise<Request | undefined> {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  let latest: Request | undefined;
  let latestTime = -Infinity;
  for (const req of candidates) {
    try {
      const res = await cache.match(req);
      if (!res) continue;
      const json = (await res.json()) as SnapshotPayload;
      const parsed = json.generatedAt ? Date.parse(json.generatedAt) : 0;
      const t = Number.isFinite(parsed) ? parsed : 0;
      if (t >= latestTime) {
        latestTime = t;
        latest = req;
      }
    } catch {
      // skip unreadable entries
    }
  }
  return latest ?? candidates[0];
}

/** Read parsed snapshot JSON, optionally scoped to a project-scoped cache key. */
export async function readSnapshotData(
  projectId?: string,
  snapshotKey?: Request,
): Promise<SnapshotPayload | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;

  try {
    const cache = await caches.open(SNAPSHOT_CACHE_NAME);
    const key = snapshotKey ?? (await findSnapshotCacheKey(projectId));
    if (!key) return null;
    const cached = await cache.match(key);
    if (!cached) return null;
    return (await cached.json()) as SnapshotPayload;
  } catch {
    return null;
  }
}

/** Extract one module array/object from the snapshot bundle. */
export async function readSnapshotModule<T>(
  moduleId: string,
  projectId?: string,
): Promise<{ data: T; generatedAt: string | null } | null> {
  const snapshot = await readSnapshotData(projectId);
  if (!snapshot?.data) return null;
  const moduleData = snapshot.data[moduleId];
  if (moduleData === undefined) return null;
  return {
    data: moduleData as T,
    generatedAt: snapshot.generatedAt ?? null,
  };
}

/** Load units for a project from snapshot — used when live fetch fails. */
export async function readSnapshotUnitsForProject<T extends { projectId?: string }>(
  projectId: string,
): Promise<{ units: T[]; generatedAt: string | null } | null> {
  const snapshot = await readSnapshotData(projectId);
  if (!snapshot?.data) return null;
  if (!Array.isArray(snapshot.data.units)) return null;
  const allUnits = snapshot.data.units as T[];
  const units = allUnits.filter((u) => u.projectId === projectId);
  return { units, generatedAt: snapshot.generatedAt ?? null };
}
