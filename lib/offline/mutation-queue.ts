/**
 * Offline mutation queue — native IndexedDB.
 *
 * DB: "cc-offline-queue", store: "mutations"
 *
 * Mutations are enqueued when the device is offline. On reconnect, the root
 * layout calls flushMutationQueue() which processes oldest-first. Automatic
 * retries cap at MAX_ATTEMPTS per mutation; rows are never deleted on client or
 * server errors — only after a successful upload. Manual flush resets counters.
 *
 * Covered mutation types:
 *   - "unit-status"        — PATCH /api/projects/:id/units/:rowId
 *   - "create-issue"       — POST  /api/projects/:id/issues
 *   - "create-observation" — POST  /api/projects/:id/observations
 *   - "update-observation" — PATCH /api/projects/:id/observations/:obsId
 *   - "add-comment"        — POST  /api/projects/:id/observations/:obsId/comments
 *                            POST  /api/projects/:id/issues/:issueId/comments
 *   - "link-status-album-photo" — POST /api/projects/:id/album?unitRef=… (status update photos)
 *   - "create-custom-site-location" — POST /api/projects/:id/custom-site-locations
 *   - "create-project-note"       — POST /api/projects/:id/notes
 *   - "edit-project-note"         — PATCH /api/projects/:id/notes/:noteId
 *   - "delete-project-note"       — DELETE /api/projects/:id/notes/:noteId
 *   - "pin-project-note"          — PATCH /api/projects/:id/notes/:noteId { pinned }
 *
 * When a mutation includes `blobIds`, the flush step uploads each blob from
 * the blob store to POST /api/upload/field-media and injects the returned
 * `storageUrl`, `storageKey`, and `mimeType` values as `attachmentUrls`,
 * `attachmentKeys`, and `attachmentMimeTypes` in the mutation body before the
 * write API is called. Blobs are only deleted from IDB after the write request
 * succeeds — never during the upload loop — so a partial failure leaves all
 * blobs intact for the next retry.
 */

import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import type { CaptureClientMetadata } from "@/lib/media/capture-context-schema";
import { appendCaptureMetadataToForm } from "@/lib/append-field-media-upload";
import { getBlob, getBlobMeta, deleteBlob } from "@/lib/offline/blob-store";
import { patchOfflineSnapshot, patchObservationInSnapshot } from "@/lib/offline/snapshot-patch";
import {
  MUTATION_SYNC_ERROR,
  formatHttpMutationError,
} from "@/lib/offline/mutation-sync-errors";
import {
  httpStatusFromMutationSyncError,
  mutationSyncErrorToDisplayMessage,
} from "@/lib/offline/mutation-sync-error-display";
import { reportMutationSyncActivityFailure } from "@/lib/offline/report-mutation-sync-activity";
import type { SyncErrorAttempt } from "@/lib/inspections/sync-error-history";

const DB_NAME = "cc-offline-queue";
const STORE_NAME = "mutations";
const DB_VERSION = 2;
const MAX_ATTEMPTS = 3;

export type MutationType =
  | "unit-status"
  | "create-issue"
  | "create-observation"
  | "update-observation"
  | "add-comment"
  | "link-status-album-photo"
  | "create-custom-site-location"
  | "create-project-note"
  | "edit-project-note"
  | "delete-project-note"
  | "pin-project-note";

export interface QueuedMutation {
  id: string;
  type: MutationType;
  url: string;
  method: "PATCH" | "POST" | "DELETE";
  /** JSON-serialisable body. After flush, `attachmentUrls` and `attachmentKeys` are injected with uploaded media data. */
  body: unknown;
  /** Session user id at enqueue time — used for offline snapshot author display; not sent to the API. */
  actorUserId?: string;
  /** IDs from blob-store that must be uploaded before this mutation fires. */
  blobIds?: string[];
  /** Capture metadata keyed by blob id — collected at enqueue time, not sync time. */
  blobCaptureMetadata?: Record<string, CaptureClientMetadata>;
  /**
   * Set after a successful blob upload run. On retry the flush skips re-uploading
   * and uses these persisted values directly, preventing duplicate storage objects.
   */
  uploadedUrls?: string[];
  uploadedKeys?: string[];
  uploadedMimeTypes?: string[];
  attempts: number;
  queuedAt: number;
  /** Set when flush fails so the upload queue UI can explain why Sync now did not clear the row. */
  lastSyncError?: string;
  /** Append-only history of failed sync attempts — surfaced in activity log. */
  syncErrorHistory?: SyncErrorAttempt[];
}

function mutationSyncErrorKind(
  code: string,
  httpStatus?: number,
): SyncErrorAttempt["errorKind"] {
  if (code === MUTATION_SYNC_ERROR.MAX_ATTEMPTS) return "exhausted";
  if (code === MUTATION_SYNC_ERROR.NETWORK) return "retriable";
  if (httpStatus === 401) return "auth";
  if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) return "rejected";
  return "retriable";
}

async function persistMutationSyncFailure(
  db: IDBDatabase,
  mutation: QueuedMutation,
  lastSyncError: string,
): Promise<QueuedMutation> {
  const attempts = mutation.attempts + 1;
  const httpStatus = httpStatusFromMutationSyncError(lastSyncError);
  const attemptEntry: SyncErrorAttempt = {
    attempt: attempts,
    message: mutationSyncErrorToDisplayMessage(lastSyncError),
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    errorKind: mutationSyncErrorKind(lastSyncError, httpStatus),
    recordedAt: new Date().toISOString(),
  };
  const updated: QueuedMutation = {
    ...mutation,
    attempts,
    lastSyncError,
    syncErrorHistory: [...(mutation.syncErrorHistory ?? []), attemptEntry],
  };
  await dbRequest(db, "readwrite", (store) => store.put(updated));
  reportMutationSyncActivityFailure(updated);
  return updated;
}

// ─── IDB helpers ─────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      // v1 → v2: no structural change needed; blobIds is an additive optional field
      void event;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = action(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Blob upload helper ───────────────────────────────────────────────────────

interface BlobUploadResult {
  urls: string[];
  keys: string[];
  mimeTypes: string[];
  fileSizeBytes: number[];
}

function uploadFolderType(mutationType: MutationType, mutationUrl: string): string {
  if (mutationType === "add-comment") {
    if (mutationUrl.includes("/observations/")) return "obs-comments";
    if (mutationUrl.includes("/issues/")) return "issue-comments";
  }
  switch (mutationType) {
    case "create-observation":
    case "update-observation":
      return "observations";
    case "create-issue":
      return "issues";
    case "link-status-album-photo":
      return "album";
    case "create-custom-site-location":
      return "issues";
    default:
      return "issues";
  }
}

/**
 * Upload all blobs referenced by a mutation and return the resulting storage
 * URLs and keys. Does NOT delete blobs — deletion happens in flushMutationQueue
 * only after the write request succeeds, so a mid-batch failure leaves all
 * blobs intact for the next retry.
 * Returns null if any blob is missing or any upload fails (caller retries later).
 */
function projectIdFromMutationUrl(url: string): string | null {
  const m = url.match(/\/api\/projects\/([^/]+)\//);
  return m?.[1] ?? null;
}

interface BlobUploadFailure {
  failed: true;
  reason: string;
}

type BlobUploadOutcome = BlobUploadResult | BlobUploadFailure;

function isBlobUploadFailure(result: BlobUploadOutcome): result is BlobUploadFailure {
  return "failed" in result && result.failed === true;
}

async function uploadBlobs(
  blobIds: string[],
  mutationType: MutationType,
  mutationUrl: string,
  blobCaptureMetadata?: Record<string, CaptureClientMetadata>,
): Promise<BlobUploadOutcome> {
  const folderType = uploadFolderType(mutationType, mutationUrl);
  const urls: string[] = [];
  const keys: string[] = [];
  const mimeTypes: string[] = [];
  const fileSizeBytes: number[] = [];
  for (const id of blobIds) {
    const blob = await getBlob(id);
    if (!blob) {
      return { failed: true, reason: MUTATION_SYNC_ERROR.BLOB_MISSING };
    }
    const meta = await getBlobMeta(id);
    const fileName = meta?.fileName ?? `upload-${id}`;

    try {
      const form = new FormData();
      form.append("file", blob, fileName);
      form.append("type", folderType);
      const pid = projectIdFromMutationUrl(mutationUrl);
      if (pid) form.append("projectId", pid);
      const captureMeta = blobCaptureMetadata?.[id];
      if (captureMeta) {
        appendCaptureMetadataToForm(form, captureMeta, pid ?? undefined);
      }
      const res = await fetch("/api/upload/field-media", {
        method: "POST",
        body: form,
      });
      if (!res.ok) return { failed: true, reason: MUTATION_SYNC_ERROR.UPLOAD_FAILED };
      const json = (await res.json()) as {
        storageUrl?: string;
        storageKey?: string;
        mimeType?: string;
        fileSizeBytes?: number;
      };
      if (!json.storageUrl || !json.storageKey) {
        // Both fields are required — storageKey creates the DB attachment record,
        // storageUrl is used for display. Treat either missing as a hard failure
        // so the mutation retries rather than uploading without a valid DB key.
        return { failed: true, reason: MUTATION_SYNC_ERROR.UPLOAD_FAILED };
      }
      urls.push(json.storageUrl);
      keys.push(json.storageKey);
      // Prefer server-resolved mimeType (most accurate); fall back to the value
      // stored in the blob meta at capture time. The API always returns mimeType
      // but the fallback guards against future API changes.
      mimeTypes.push(json.mimeType ?? meta?.mimeType ?? "application/octet-stream");
      fileSizeBytes.push(
        typeof json.fileSizeBytes === "number"
          ? json.fileSizeBytes
          : blob.size,
      );
      // Blob is intentionally NOT deleted here — see flushMutationQueue
    } catch {
      return { failed: true, reason: MUTATION_SYNC_ERROR.NETWORK };
    }
  }
  return { urls, keys, mimeTypes, fileSizeBytes };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Mutation types that write activity logs — enrich body with GPS at enqueue time. */
const ACTIVITY_LOCATION_MUTATION_TYPES = new Set<MutationType>([
  "unit-status",
  "create-issue",
  "create-observation",
  "update-observation",
]);

/** Add a mutation to the queue. */
export async function enqueueMutation(
  m: Omit<QueuedMutation, "id" | "attempts" | "queuedAt"> & { id?: string },
): Promise<void> {
  let body = m.body;
  if (
    ACTIVITY_LOCATION_MUTATION_TYPES.has(m.type) &&
    typeof body === "object" &&
    body !== null &&
    !("activityLocation" in (body as Record<string, unknown>))
  ) {
    const { enrichBodyWithActivityLocation } = await import(
      "@/lib/activity/enrich-body-with-activity-location"
    );
    body = await enrichBodyWithActivityLocation(body as Record<string, unknown>);
  }

  const db = await openDb();
  const entry: QueuedMutation = {
    ...m,
    body,
    id: m.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    attempts: 0,
    queuedAt: Date.now(),
  };
  await dbRequest(db, "readwrite", (store) => store.put(entry));
  db.close();

  // Write-through to the offline snapshot cache so the UI reflects the change
  // immediately while still offline. Awaited so that callers (e.g. AddObservationModal)
  // can call onCreated() right after enqueueMutation and know the snapshot is ready
  // for refreshCounts() to read. Errors are swallowed — non-critical UX enhancement.
  await patchOfflineSnapshot(entry).catch(() => {/* non-critical */});
}

/** How many mutations are currently pending. */
export async function getPendingCount(): Promise<number> {
  const db = await openDb();
  const count = await dbRequest(db, "readonly", (store) => store.count());
  db.close();
  return count;
}

/** Snapshot all pending mutations for read-only UI surfaces such as pending activity. */
export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const db = await openDb();
  const all = await dbRequest<QueuedMutation[]>(db, "readonly", (store) =>
    store.getAll() as IDBRequest<QueuedMutation[]>
  );
  db.close();
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function getMutationById(id: string): Promise<QueuedMutation | null> {
  const db = await openDb();
  const row = await dbRequest<QueuedMutation | undefined>(db, "readonly", (store) =>
    store.get(id) as IDBRequest<QueuedMutation | undefined>,
  );
  db.close();
  return row ?? null;
}

/** Update an existing queued mutation (e.g. revise a pending create-observation before sync). */
export async function updateQueuedMutation(
  id: string,
  patch: {
    body?: Record<string, unknown>;
    blobIds?: string[];
    appendBlobIds?: string[];
  },
): Promise<boolean> {
  const db = await openDb();
  const mutation = await dbRequest<QueuedMutation | undefined>(db, "readonly", (store) =>
    store.get(id) as IDBRequest<QueuedMutation | undefined>,
  );
  if (!mutation) {
    db.close();
    return false;
  }

  const priorBody =
    typeof mutation.body === "object" && mutation.body !== null
      ? (mutation.body as Record<string, unknown>)
      : {};
  const nextBody = patch.body ? { ...priorBody, ...patch.body } : priorBody;

  let nextBlobIds = mutation.blobIds;
  if (patch.blobIds !== undefined) {
    nextBlobIds = patch.blobIds;
  } else if (patch.appendBlobIds?.length) {
    nextBlobIds = [...(mutation.blobIds ?? []), ...patch.appendBlobIds];
  }

  const updated: QueuedMutation = {
    ...mutation,
    body: nextBody,
    blobIds: nextBlobIds,
    uploadedUrls: undefined,
    uploadedKeys: undefined,
    uploadedMimeTypes: undefined,
    lastSyncError: undefined,
    attempts: 0,
  };

  await dbRequest(db, "readwrite", (store) => store.put(updated));
  db.close();

  if (mutation.type === "create-observation") {
    const projectId = projectIdFromMutationUrl(mutation.url);
    if (!projectId) return false;
    const body =
      typeof updated.body === "object" && updated.body !== null
        ? (updated.body as Record<string, unknown>)
        : {};
    await patchObservationInSnapshot(projectId, id, {
      ...body,
      projectRowIds: body.projectRowIds,
    }).catch(() => undefined);
  } else if (mutation.type === "create-project-note") {
    const projectId = projectIdFromMutationUrl(mutation.url);
    if (!projectId) return false;
    const body =
      typeof updated.body === "object" && updated.body !== null
        ? (updated.body as Record<string, unknown>)
        : {};
    const { patchProjectNoteBodyInSnapshot } = await import("@/lib/offline/snapshot-patch");
    await patchProjectNoteBodyInSnapshot(projectId, id, String(body.body ?? "")).catch(() => undefined);
  } else {
    await patchOfflineSnapshot(updated).catch(() => undefined);
  }

  return true;
}

/** Remove a queued mutation and any blobs that only it references. */
export async function discardMutation(id: string): Promise<boolean> {
  const db = await openDb();
  const mutation = await dbRequest<QueuedMutation | undefined>(db, "readonly", (store) =>
    store.get(id) as IDBRequest<QueuedMutation | undefined>,
  );
  if (!mutation) {
    db.close();
    return false;
  }
  await dbRequest(db, "readwrite", (store) => store.delete(id));
  db.close();
  if (mutation.blobIds?.length) {
    await Promise.allSettled(mutation.blobIds.map((blobId) => deleteBlob(blobId)));
  }
  return true;
}

export interface FlushMutationQueueOptions {
  /** Resets attempt counters so manual Sync can retry past MAX_ATTEMPTS. */
  manual?: boolean;
}

export async function resetMutationAttemptsForManualRetry(): Promise<number> {
  const db = await openDb();
  const all = await dbRequest<QueuedMutation[]>(db, "readonly", (store) =>
    store.getAll() as IDBRequest<QueuedMutation[]>,
  );
  let reset = 0;
  for (const mutation of all) {
    if (mutation.attempts > 0 || mutation.lastSyncError) {
      await dbRequest(db, "readwrite", (store) =>
        store.put({ ...mutation, attempts: 0, lastSyncError: undefined }),
      );
      reset += 1;
    }
  }
  db.close();
  return reset;
}

export interface FlushResult {
  flushed: number;
  failed: number;
}

export interface FlushProgress {
  done: number;
  total: number;
  /** Type of the mutation currently being processed. */
  currentType: MutationType;
  /** Queue row id — matches QueuedUploadItem.id for mutations. */
  currentMutationId: string;
  /** media = uploading blobs; request = PATCH/POST in flight. */
  phase: "media" | "request";
}

/**
 * Flush all queued mutations oldest-first.
 * Calls onProgress after each mutation is processed.
 * Returns counts of flushed and failed.
 */
export async function flushMutationQueue(
  onProgress?: (progress: FlushProgress) => void,
  options?: FlushMutationQueueOptions,
): Promise<FlushResult> {
  if (options?.manual) {
    await resetMutationAttemptsForManualRetry();
  }
  const db = await openDb();
  const all = await dbRequest<QueuedMutation[]>(db, "readonly", (store) =>
    store.getAll() as IDBRequest<QueuedMutation[]>
  );
  db.close();

  if (all.length === 0) return { flushed: 0, failed: 0 };

  all.sort((a, b) => a.queuedAt - b.queuedAt);

  let flushed = 0;
  let failed = 0;
  const total = all.length;

  for (let mutationIndex = 0; mutationIndex < all.length; mutationIndex++) {
    const mutation = all[mutationIndex];
    const db2 = await openDb();

    const reportProgress = (phase: FlushProgress["phase"]) => {
      onProgress?.({
        done: flushed + failed,
        total,
        currentType: mutation.type,
        currentMutationId: mutation.id,
        phase,
      });
    };

    reportProgress("request");

    if (mutation.attempts >= MAX_ATTEMPTS) {
      if (!mutation.lastSyncError) {
        await persistMutationSyncFailure(db2, mutation, MUTATION_SYNC_ERROR.MAX_ATTEMPTS);
      } else {
        reportMutationSyncActivityFailure(mutation);
      }
      failed++;
      db2.close();
      onProgress?.({
        done: flushed + failed,
        total,
        currentType: mutation.type,
        currentMutationId: mutation.id,
        phase: "request",
      });
      continue;
    }

    // Upload any pending blobs first
    let resolvedBody = mutation.body;
    let uploadedBlobIds: string[] | undefined;
    if (mutation.blobIds && mutation.blobIds.length > 0) {
      let urls: string[];
      let keys: string[];
      let mimes: string[];

      if (mutation.uploadedUrls && mutation.uploadedKeys) {
        // Blobs were already uploaded on a previous attempt — reuse persisted
        // values to avoid creating duplicate storage objects on retry.
        urls = mutation.uploadedUrls;
        keys = mutation.uploadedKeys;
        if (mutation.uploadedMimeTypes) {
          mimes = mutation.uploadedMimeTypes;
        } else {
          // Backward compat: mutations persisted by the previous version stored
          // uploadedUrls/Keys but not mimeTypes. Reconstruct from blob meta
          // rather than re-uploading (which would create duplicate storage
          // objects). Blobs are still in IDB at this point because they are
          // only deleted after a successful write request.
          mimes = await Promise.all(
            (mutation.blobIds ?? []).map(async (id) => {
              const meta = await getBlobMeta(id);
              return meta?.mimeType ?? "application/octet-stream";
            }),
          );
          // Persist reconstructed mimeTypes so the next retry skips this path.
          await dbRequest(db2, "readwrite", (store) =>
            store.put({ ...mutation, uploadedMimeTypes: mimes }),
          );
        }
      } else {
        reportProgress("media");
        const uploadResult = await uploadBlobs(
          mutation.blobIds,
          mutation.type,
          mutation.url,
          mutation.blobCaptureMetadata,
        );
        if (isBlobUploadFailure(uploadResult)) {
          await persistMutationSyncFailure(db2, mutation, uploadResult.reason);
          failed++;
          db2.close();
          onProgress?.({
            done: flushed + failed,
            total,
            currentType: mutation.type,
            currentMutationId: mutation.id,
            phase: "media",
          });
          continue;
        }
        urls = uploadResult.urls;
        keys = uploadResult.keys;
        mimes = uploadResult.mimeTypes;

        // Persist uploaded URLs/keys/mimeTypes back into the mutation record so
        // that if the write request below fails, the next retry skips re-uploading.
        await dbRequest(db2, "readwrite", (store) =>
          store.put({ ...mutation, uploadedUrls: urls, uploadedKeys: keys, uploadedMimeTypes: mimes })
        );
      }

      if (mutation.type === "link-status-album-photo") {
        let fileSize: number | null = null;
        if (mutation.blobIds?.[0]) {
          const blob = await getBlob(mutation.blobIds[0]);
          if (blob) fileSize = blob.size;
        }
        resolvedBody = {
          ...(typeof mutation.body === "object" && mutation.body !== null ? mutation.body : {}),
          storageKey: keys[0],
          storageUrl: urls[0],
          mimeType: mimes[0],
          fileSizeBytes: fileSize,
        };
      } else if (mutation.type === "update-observation") {
        const baseBody =
          typeof mutation.body === "object" && mutation.body !== null
            ? (mutation.body as Record<string, unknown>)
            : {};
        const pendingCaptions = Array.isArray(baseBody.addAttachmentCaptions)
          ? (baseBody.addAttachmentCaptions as string[])
          : [];
        resolvedBody = {
          ...baseBody,
          addAttachmentUrls: urls,
          addAttachmentKeys: keys,
          addAttachmentMimeTypes: mimes,
          addAttachmentCaptions: urls.map((_, i) => pendingCaptions[i] ?? ""),
        };
      } else {
        const baseBody =
          typeof mutation.body === "object" && mutation.body !== null
            ? (mutation.body as Record<string, unknown>)
            : {};
        const pendingCaptions = Array.isArray(baseBody.attachmentCaptions)
          ? (baseBody.attachmentCaptions as string[])
          : [];
        const pendingAnnotations = Array.isArray(baseBody.attachmentImageAnnotations)
          ? baseBody.attachmentImageAnnotations
          : [];
        // Inject storageUrls, storageKeys, and mimeTypes so the write API creates
        // attachment DB records with the correct mimeType. Without mimeTypes the
        // API defaults to "application/octet-stream" which prevents thumbnails
        // from rendering (MediaGrid filters on "image/" and "video/" prefixes).
        resolvedBody = {
          ...baseBody,
          attachmentUrls: urls,
          attachmentKeys: keys,
          attachmentMimeTypes: mimes,
          attachmentCaptions: urls.map((_, i) => pendingCaptions[i] ?? ""),
          attachmentImageAnnotations: urls.map((_, i) => pendingAnnotations[i] ?? null),
        };
      }
      uploadedBlobIds = mutation.blobIds;
    }

    try {
      reportProgress("request");
      const res = await fetch(mutation.url, {
        method: mutation.method,
        headers: {
          "Content-Type": "application/json",
          "X-Offline-Mutation-Id": mutation.id,
          "X-Client-Queued-At": new Date(mutation.queuedAt).toISOString(),
        },
        body: mutation.method === "DELETE" ? undefined : JSON.stringify(resolvedBody),
      });

      if (res.ok) {
        let responseBody: unknown;
        const readsResponseBody =
          mutation.type === "create-custom-site-location" ||
          mutation.type === "create-observation" ||
          mutation.type === "create-issue" ||
          mutation.type === "create-project-note";
        if (readsResponseBody) {
          try {
            responseBody = await res.json();
          } catch {
            responseBody = undefined;
          }
        }

        const pid = projectIdFromMutationUrl(mutation.url);
        if (mutation.type === "link-status-album-photo" && pid && typeof window !== "undefined") {
          try {
            const parsed = new URL(mutation.url, "https://local.invalid");
            const unitRef = parsed.searchParams.get("unitRef");
            if (unitRef) {
              const { invalidateUnitAlbumClientCache } = await import(
                "@/lib/media/unit-album-client-cache"
              );
              invalidateUnitAlbumClientCache(pid, unitRef);
            }
          } catch {
            // Non-blocking — OFFLINE_SYNC_COMPLETE still triggers a full refresh.
          }
        }

        if (pid && responseBody && typeof responseBody === "object" && responseBody !== null) {
          if (mutation.type === "create-custom-site-location") {
            try {
              const json = responseBody as { location?: CustomSiteLocation };
              if (json.location?.id) {
                const { remapCustomSiteUnitRefsAfterSync } = await import(
                  "@/lib/offline/custom-site-unit-ref-remap"
                );
                await remapCustomSiteUnitRefsAfterSync(pid, mutation.id, json.location);
              }
            } catch {
              // Non-blocking — snapshot refresh on reconnect still heals drift.
            }
          }

          const serverEntityId =
            "id" in responseBody && typeof (responseBody as { id: unknown }).id === "string"
              ? (responseBody as { id: string }).id
              : undefined;

          if (serverEntityId && mutation.type === "create-observation") {
            try {
              const { remapOfflineEntityIdAfterSync, remapEntityIdInQueuedMutation } =
                await import("@/lib/offline/offline-entity-id-remap");
              await remapOfflineEntityIdAfterSync({
                projectId: pid,
                kind: "observation",
                offlineId: mutation.id,
                serverId: serverEntityId,
              });
              for (let j = mutationIndex + 1; j < all.length; j++) {
                all[j] = remapEntityIdInQueuedMutation(
                  all[j],
                  pid,
                  "observation",
                  mutation.id,
                  serverEntityId,
                );
              }
            } catch {
              // Non-blocking — next manual sync retries with remapped IDB rows.
            }
          }

          if (serverEntityId && mutation.type === "create-issue") {
            try {
              const { remapOfflineEntityIdAfterSync, remapEntityIdInQueuedMutation } =
                await import("@/lib/offline/offline-entity-id-remap");
              await remapOfflineEntityIdAfterSync({
                projectId: pid,
                kind: "issue",
                offlineId: mutation.id,
                serverId: serverEntityId,
              });
              for (let j = mutationIndex + 1; j < all.length; j++) {
                all[j] = remapEntityIdInQueuedMutation(
                  all[j],
                  pid,
                  "issue",
                  mutation.id,
                  serverEntityId,
                );
              }
            } catch {
              // Non-blocking — next manual sync retries with remapped IDB rows.
            }
          }

          if (mutation.type === "create-project-note") {
            try {
              const json = responseBody as { note?: { id?: string } };
              const serverNoteId = json.note?.id;
              if (serverNoteId) {
                const { remapProjectNoteIdAfterSync } = await import(
                  "@/lib/offline/project-note-id-remap"
                );
                await remapProjectNoteIdAfterSync({
                  projectId: pid,
                  offlineId: mutation.id,
                  serverId: serverNoteId,
                });
                for (let j = mutationIndex + 1; j < all.length; j++) {
                  const m = all[j];
                  const needle = `/api/projects/${pid}/notes/${mutation.id}`;
                  if (m.url.includes(needle)) {
                    all[j] = {
                      ...m,
                      url: m.url.replaceAll(needle, `/api/projects/${pid}/notes/${serverNoteId}`),
                    };
                  }
                }
              }
            } catch {
              // Non-blocking
            }
          }
        }

        await dbRequest(db2, "readwrite", (store) => store.delete(mutation.id));
        // Delete blobs only after the write request succeeds so a partial
        // upload failure on retry still has all blobs available.
        if (uploadedBlobIds?.length) {
          await Promise.allSettled(uploadedBlobIds.map((id) => deleteBlob(id)));
        }
        flushed++;
      } else {
        let serverMessage: string | undefined;
        try {
          const json = (await res.json()) as { error?: string };
          if (typeof json.error === "string") serverMessage = json.error;
        } catch {
          // ignore non-JSON bodies
        }
        const lastSyncError = formatHttpMutationError(res.status, serverMessage);
        await persistMutationSyncFailure(db2, mutation, lastSyncError);
        failed++;
      }
    } catch {
      await persistMutationSyncFailure(db2, mutation, MUTATION_SYNC_ERROR.NETWORK);
      failed++;
    } finally {
      db2.close();
    }

    onProgress?.({
      done: flushed + failed,
      total,
      currentType: mutation.type,
      currentMutationId: mutation.id,
      phase: "request",
    });
  }

  return { flushed, failed };
}
