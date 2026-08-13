/**
 * After a queued custom site location syncs, remap pending mutations and snapshot
 * rows that still reference the offline mutation id in @custom|id|name unitRefs.
 */

import {
  customSiteUnitRef,
  isCustomSiteUnitRef,
  parseCustomSiteUnitRef,
  type CustomSiteLocation,
} from "@/lib/custom-site-locations";
import { getPendingMutations, type QueuedMutation } from "@/lib/offline/mutation-queue";
import { SNAPSHOT_CACHE_NAME, SNAPSHOT_URL_PREFIX } from "@/lib/offline/snapshot-cache";

function remapUnitRef(oldMutationId: string, serverLocation: CustomSiteLocation, unitRef: unknown): unknown {
  if (typeof unitRef !== "string" || !isCustomSiteUnitRef(unitRef)) return unitRef;
  const parsed = parseCustomSiteUnitRef(unitRef);
  if (!parsed || parsed.id !== oldMutationId) return unitRef;
  return customSiteUnitRef(serverLocation);
}

function remapMutationBody(
  oldMutationId: string,
  serverLocation: CustomSiteLocation,
  body: unknown,
): unknown {
  if (typeof body !== "object" || body === null) return body;
  const next = { ...(body as Record<string, unknown>) };
  if ("unitRef" in next) {
    next.unitRef = remapUnitRef(oldMutationId, serverLocation, next.unitRef);
  }
  return next;
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

async function patchSnapshotUnitRefs(
  projectId: string,
  oldMutationId: string,
  serverLocation: CustomSiteLocation,
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

    let patched = false;

    for (const listKey of ["issues", "observations"] as const) {
      const rows = data[listKey];
      if (!Array.isArray(rows)) continue;
      data[listKey] = rows.map((row) => {
        if (typeof row !== "object" || row === null) return row;
        const r = row as Record<string, unknown>;
        if (r.projectId !== projectId) return row;
        const nextRef = remapUnitRef(oldMutationId, serverLocation, r.unitRef);
        if (nextRef === r.unitRef) return row;
        patched = true;
        return { ...r, unitRef: nextRef };
      });
    }

    const csl = data["custom-site-locations"] as Record<string, CustomSiteLocation[]> | undefined;
    if (csl?.[projectId]) {
      data["custom-site-locations"] = {
        ...csl,
        [projectId]: csl[projectId].map((loc) =>
          loc.id === oldMutationId
            ? { ...serverLocation, unitRef: customSiteUnitRef(serverLocation) }
            : loc,
        ),
      };
      patched = true;
    }

    if (!patched) continue;

    await cache.put(
      key,
      new Response(JSON.stringify({ ...snapshot, data }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
}

/** Remap pending queue rows + snapshot after server assigns a real location id. */
export async function remapCustomSiteUnitRefsAfterSync(
  projectId: string,
  offlineMutationId: string,
  serverLocation: CustomSiteLocation,
): Promise<void> {
  const pending = await getPendingMutations();
  for (const mutation of pending) {
    const nextBody = remapMutationBody(offlineMutationId, serverLocation, mutation.body);
    if (nextBody === mutation.body) continue;
    await persistPendingMutationUpdate({ ...mutation, body: nextBody });
  }
  await patchSnapshotUnitRefs(projectId, offlineMutationId, serverLocation);
}
