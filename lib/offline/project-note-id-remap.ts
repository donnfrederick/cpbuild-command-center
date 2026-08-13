import { getPendingMutations, type QueuedMutation } from "@/lib/offline/mutation-queue";
import { SNAPSHOT_CACHE_NAME, SNAPSHOT_URL_PREFIX } from "@/lib/offline/snapshot-cache";
import type { ProjectNoteDto } from "@/lib/project-notes/types";

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

async function patchSnapshotProjectNoteId(
  projectId: string,
  offlineId: string,
  serverId: string,
): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;

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

    const notesByProject = data["project-notes"];
    if (!notesByProject || typeof notesByProject !== "object") continue;
    const groups = notesByProject as Record<string, ProjectNoteDto[]>;
    const notes = groups[projectId];
    if (!Array.isArray(notes)) continue;

    let patched = false;
    groups[projectId] = notes.map((note) => {
      if (note.id !== offlineId) return note;
      patched = true;
      const { _pendingSync, ...rest } = note;
      void _pendingSync;
      return { ...rest, id: serverId };
    });

    if (!patched) continue;

    data["project-notes"] = groups;
    await cache.put(
      key,
      new Response(JSON.stringify({ ...snapshot, data }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
}

export async function remapProjectNoteIdAfterSync(params: {
  projectId: string;
  offlineId: string;
  serverId: string;
}): Promise<void> {
  const { projectId, offlineId, serverId } = params;
  const needle = `/api/projects/${projectId}/notes/${offlineId}`;
  const replacement = `/api/projects/${projectId}/notes/${serverId}`;

  const pending = await getPendingMutations();
  for (const mutation of pending) {
    if (!mutation.url.includes(needle)) continue;
    await persistPendingMutationUpdate({
      ...mutation,
      url: mutation.url.replaceAll(needle, replacement),
    });
  }

  await patchSnapshotProjectNoteId(projectId, offlineId, serverId);
}
