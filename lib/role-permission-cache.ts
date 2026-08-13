/**
 * In-memory cache of role → permission codes loaded from role_permissions.
 * Warmed on server start (instrumentation) and invalidated after admin edits.
 *
 * DB access is dynamic-imported so client bundles that import `hasPermission`
 * from lib/permissions.ts do not pull in pg/Prisma.
 */

const TTL_MS = 60_000;

let cache: Map<string, ReadonlySet<string>> | null = null;
let cacheLoadedAt = 0;
let refreshPromise: Promise<void> | null = null;

function isCacheStale(): boolean {
  return cache === null || Date.now() - cacheLoadedAt > TTL_MS;
}

function scheduleBackgroundRefresh(): void {
  // Only refresh in the background when a prior warm has gone stale — never
  // fire DB I/O on a cold cache (tests and pre-instrumentation calls fall back to code defaults).
  if (cache !== null && isCacheStale() && !refreshPromise) {
    void refreshRolePermissionCache();
  }
}

/**
 * Returns cached permission codes for a role, or undefined when the cache has
 * not been loaded yet (caller should fall back to code defaults).
 */
export function getCachedRolePermissions(roleCode: string): readonly string[] | undefined {
  scheduleBackgroundRefresh();
  if (!cache) return undefined;
  const entry = cache.get(roleCode);
  if (entry === undefined) return undefined;
  return [...entry];
}

function syncGlobalCache(): void {
  if (typeof globalThis !== "undefined") {
    globalThis.__ccRolePermissionCache = cache ?? undefined;
  }
}

export function isRolePermissionCacheLoaded(): boolean {
  return cache !== null;
}

export async function refreshRolePermissionCache(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { db } = await import("@/lib/db");
    const roles = await db.role.findMany({
      select: {
        code: true,
        permissions: {
          select: {
            permission: { select: { code: true } },
          },
        },
      },
    });

    const map = new Map<string, ReadonlySet<string>>();
    for (const role of roles) {
      map.set(
        role.code,
        new Set(role.permissions.map((rp) => rp.permission.code)),
      );
    }

    cache = map;
    cacheLoadedAt = Date.now();
    syncGlobalCache();
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/** Clears cache so the next read triggers a refresh. */
export function invalidateRolePermissionCache(): void {
  cache = null;
  cacheLoadedAt = 0;
  syncGlobalCache();
}

/** Test helper — inject a cache map without hitting the database. */
export function setRolePermissionCacheForTests(
  entries: Record<string, readonly string[]>,
): void {
  cache = new Map(
    Object.entries(entries).map(([code, perms]) => [code, new Set(perms)]),
  );
  cacheLoadedAt = Date.now();
  syncGlobalCache();
}

export function clearRolePermissionCacheForTests(): void {
  cache = null;
  cacheLoadedAt = 0;
  syncGlobalCache();
}
