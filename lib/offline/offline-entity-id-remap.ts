/**
 * After a queued create-observation or create-issue syncs, remap pending mutations
 * and snapshot rows that still reference the offline mutation id as the entity id.
 */

import { getPendingMutations, type QueuedMutation } from "@/lib/offline/mutation-queue";
import { SNAPSHOT_CACHE_NAME, SNAPSHOT_URL_PREFIX } from "@/lib/offline/snapshot-cache";

export type OfflineEntityKind = "observation" | "issue";

function entitySegment(kind: OfflineEntityKind): "observations" | "issues" {
  return kind === "observation" ? "observations" : "issues";
}

/** Replace offline entity id in a project-scoped observations/issues API url. */
export function replaceOfflineEntityIdInUrl(
  url: string,
  projectId: string,
  kind: OfflineEntityKind,
  offlineId: string,
  serverId: string,
): string {
  const segment = entitySegment(kind);
  const needle = `/api/projects/${projectId}/${segment}/${offlineId}`;
  if (!url.includes(needle)) return url;
  const replacement = `/api/projects/${projectId}/${segment}/${serverId}`;
  return url.replaceAll(needle, replacement);
}

export function remapEntityIdInQueuedMutation(
  mutation: QueuedMutation,
  projectId: string,
  kind: OfflineEntityKind,
  offlineId: string,
  serverId: string,
): QueuedMutation {
  const nextUrl = replaceOfflineEntityIdInUrl(mutation.url, projectId, kind, offlineId, serverId);
  if (nextUrl === mutation.url) return mutation;
  return { ...mutation, url: nextUrl };
}

async function persistPendingMutationUpdate(mutation: QueuedMutation): Promise<void> {
  const dbName = "cc-offline-queue";
  const storeName = "mutations";
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(dbName, 2);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(mutation);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    req.onerror = () => reject(req.error);
  });
}

async function patchSnapshotEntityId(
  projectId: string,
  kind: OfflineEntityKind,
  offlineId: string,
  serverId: string,
): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

  const listKey = kind === "observation" ? "observations" : "issues";
  const cache = await caches.open(SNAPSHOT_CACHE_NAME);
  const keys = await cache.keys();
  const candidates = keys.filter((k) => k.url.includes(SNAPSHOT_URL_PREFIX));
  if (candidates.length === 0) return;

  for (const key of candidates) {
    const res = await cache.match(key);
    if (!res) continue;
    let snapshot: { generatedAt?: string; data?: Record<string, unknown> };
    try {
      snapshot = (await res.json()) as { generatedAt?: string; data?: Record<string, unknown> };
    } catch {
      continue;
    }
    const data = snapshot.data;
    if (!data) continue;

    const rows = data[listKey];
    if (!Array.isArray(rows)) continue;

    let patched = false;
    data[listKey] = rows.map((row) => {
      if (typeof row !== "object" || row === null) return row;
      const r = row as Record<string, unknown>;
      if (r.id !== offlineId) return row;
      if (r.projectId !== undefined && r.projectId !== projectId) return row;
      patched = true;
      const { _pendingSync: _removed, ...rest } = r;
      return { ...rest, id: serverId };
    });

    if (!patched) continue;

    await cache.put(
      key,
      new Response(JSON.stringify({ ...snapshot, data }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
}

/** Remap pending queue rows + snapshot after server assigns a real entity id. */
export async function remapOfflineEntityIdAfterSync(params: {
  projectId: string;
  kind: OfflineEntityKind;
  offlineId: string;
  serverId: string;
}): Promise<void> {
  const { projectId, kind, offlineId, serverId } = params;
  const pending = await getPendingMutations();
  for (const mutation of pending) {
    const next = remapEntityIdInQueuedMutation(mutation, projectId, kind, offlineId, serverId);
    if (next.url === mutation.url) continue;
    await persistPendingMutationUpdate(next);
  }
  await patchSnapshotEntityId(projectId, kind, offlineId, serverId);
}
