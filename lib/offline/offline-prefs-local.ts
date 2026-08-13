/** Client-side mirror of offline preferences — survives reload while offline. */
const STORAGE_KEY = "cc-offline-prefs-v1";

export interface LocalOfflinePrefs {
  offlineProjectIds: string[];
  projectSyncedAt: Record<string, string>;
}

export const EMPTY_LOCAL_OFFLINE_PREFS: LocalOfflinePrefs = {
  offlineProjectIds: [],
  projectSyncedAt: {},
};

type PrefsListener = () => void;

const listeners = new Set<PrefsListener>();
/** In-memory cache so subscribers see writes without re-parsing localStorage. */
let clientCache: LocalOfflinePrefs | null = null;

function emitPrefsChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** SSR + hydration first paint — must match server HTML (no localStorage). */
export function getLocalOfflinePrefsServerSnapshot(): LocalOfflinePrefs {
  return EMPTY_LOCAL_OFFLINE_PREFS;
}

/** Client snapshot — must return a stable reference until prefs actually change. */
export function getLocalOfflinePrefsSnapshot(): LocalOfflinePrefs {
  if (clientCache) return clientCache;
  const read = readLocalOfflinePrefs();
  if (read) {
    clientCache = read;
    return clientCache;
  }
  return EMPTY_LOCAL_OFFLINE_PREFS;
}

export function subscribeLocalOfflinePrefs(listener: PrefsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readLocalOfflinePrefs(): LocalOfflinePrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalOfflinePrefs>;
    if (!Array.isArray(parsed.offlineProjectIds)) return null;
    return {
      offlineProjectIds: parsed.offlineProjectIds,
      projectSyncedAt: parsed.projectSyncedAt ?? {},
    };
  } catch {
    return null;
  }
}

export function writeLocalOfflinePrefs(prefs: LocalOfflinePrefs): void {
  const normalized: LocalOfflinePrefs = {
    offlineProjectIds: [...prefs.offlineProjectIds],
    projectSyncedAt: { ...prefs.projectSyncedAt },
  };
  const serialized = JSON.stringify(normalized);
  if (clientCache && JSON.stringify(clientCache) === serialized) {
    return;
  }
  clientCache = normalized;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Quota or private mode — non-critical.
    }
  }
  emitPrefsChange();
}

export function isProjectPreDownloaded(
  projectId: string,
  offlineProjectIds: Set<string>,
  projectSyncedAt: Record<string, string>,
): boolean {
  return offlineProjectIds.has(projectId) || projectSyncedAt[projectId] != null;
}

/** Vitest reset — clears in-memory cache and listeners between tests. */
export function resetLocalOfflinePrefsStoreForTests(): void {
  clientCache = null;
  listeners.clear();
}
