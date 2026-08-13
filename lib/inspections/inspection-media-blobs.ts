/**
 * Deferred inspection media — store File blobs in cc-offline-blobs on submit;
 * upload during syncOne flush (local-first, never block UI on network uploads).
 */

import { appendCaptureMetadataToForm } from "@/lib/append-field-media-upload";
import { collectCaptureClientMetadata } from "@/lib/capture-client-metadata";
import type { AnswersMap } from "@/components/forms/FormFillClient";
import type { CapturedMediaItem } from "@/components/forms/formTypes";
import { deleteBlob, getBlob, storeBlob, storeBlobVerified } from "@/lib/offline/blob-store";
import {
  fetchWithTimeout,
  MEDIA_UPLOAD_TIMEOUT_MS,
} from "@/lib/offline/connectivity";

function isRealFile(f: unknown): f is File {
  return typeof File !== "undefined" && f instanceof File;
}

async function deferItem(item: CapturedMediaItem): Promise<CapturedMediaItem> {
  if (item.serverUrl || item.pendingBlobId || !isRealFile(item.file)) {
    const { file: _file, ...rest } = item;
    void _file;
    return rest as CapturedMediaItem;
  }
  const pendingBlobId = await storeBlobVerified(item.file);
  const { file: _file, ...rest } = item;
  void _file;
  return { ...rest, pendingBlobId };
}

async function deferItems(items: CapturedMediaItem[]): Promise<CapturedMediaItem[]> {
  return Promise.all(items.map((item) => deferItem(item)));
}

interface UploadedMediaItem {
  item: CapturedMediaItem;
  /** Local blob to delete only after every pending item in this sync batch succeeds. */
  uploadedBlobId?: string;
}

async function deleteUploadedBlobsSafely(blobIds: string[]): Promise<void> {
  await Promise.all(
    blobIds.map(async (id) => {
      try {
        await deleteBlob(id);
      } catch {
        // Blob cleanup must not fail the upload/sync path.
      }
    }),
  );
}

async function uploadOneFromFile(
  item: CapturedMediaItem,
  file: File,
): Promise<UploadedMediaItem> {
  if (item.serverUrl) return { item };

  const fd = new FormData();
  fd.append("file", file, `inspection-media.${item.mimeType.split("/")[1] ?? "bin"}`);
  fd.append("type", "inspections");
  const meta = await collectCaptureClientMetadata("file_drop");
  appendCaptureMetadataToForm(fd, meta);

  const res = await fetchWithTimeout(
    "/api/upload/field-media",
    { method: "POST", body: fd },
    MEDIA_UPLOAD_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Media upload failed (${res.status})`);
  }

  const data = (await res.json()) as { storageUrl?: string };
  const serverUrl = data.storageUrl ?? undefined;
  if (!serverUrl) {
    throw new Error("Media upload returned no storageUrl");
  }

  const pendingBlobId = item.pendingBlobId;
  const { file: _file, pendingBlobId: _blob, ...rest } = item;
  void _file;
  void _blob;

  return {
    item: { ...rest, serverUrl },
    uploadedBlobId: pendingBlobId,
  };
}

async function resolvePendingItem(item: CapturedMediaItem): Promise<UploadedMediaItem> {
  if (item.serverUrl || !item.pendingBlobId) return { item };

  const blob = await getBlob(item.pendingBlobId);
  if (!blob) {
    throw new Error(`Deferred inspection media blob missing: ${item.pendingBlobId}`);
  }

  const file = new File([blob], `inspection-media.${item.mimeType.split("/")[1] ?? "bin"}`, {
    type: item.mimeType,
  });

  return uploadOneFromFile({ ...item, file }, file);
}

async function resolveItems(
  items: CapturedMediaItem[],
  blobIdsToDelete: string[],
): Promise<CapturedMediaItem[]> {
  const results = await Promise.all(items.map((item) => resolvePendingItem(item)));
  for (const result of results) {
    if (result.uploadedBlobId) blobIdsToDelete.push(result.uploadedBlobId);
  }
  return results.map((result) => result.item);
}

async function rehydrateDisplayItem(item: CapturedMediaItem): Promise<CapturedMediaItem> {
  if (item.serverUrl || !item.pendingBlobId || isRealFile(item.file)) {
    return item;
  }

  const blob = await getBlob(item.pendingBlobId);
  if (!blob) return item;

  const file = new File([blob], `inspection-media.${item.mimeType.split("/")[1] ?? "bin"}`, {
    type: item.mimeType,
  });

  return {
    ...item,
    file,
    localUrl: URL.createObjectURL(blob),
  };
}

async function rehydrateDisplayItems(items: CapturedMediaItem[]): Promise<CapturedMediaItem[]> {
  return Promise.all(items.map((item) => rehydrateDisplayItem(item)));
}

async function mapAnswerMedia(
  answer: AnswersMap[string],
  mapItems: (items: CapturedMediaItem[]) => Promise<CapturedMediaItem[]>,
): Promise<AnswersMap[string]> {
  let updated = { ...answer };

  if (updated.capturedFiles?.length) {
    updated = { ...updated, capturedFiles: await mapItems(updated.capturedFiles) };
  }

  if (updated.deficiencies?.length) {
    updated = {
      ...updated,
      deficiencies: await Promise.all(
        updated.deficiencies.map(async (def) => {
          if (!def.capturedFiles?.length) return def;
          return { ...def, capturedFiles: await mapItems(def.capturedFiles) };
        }),
      ),
    };
  }

  if (updated.resolvedDeficiencies?.length) {
    updated = {
      ...updated,
      resolvedDeficiencies: await Promise.all(
        updated.resolvedDeficiencies.map(async (def) => {
          let next = def;
          if (def.capturedFiles?.length) {
            next = { ...next, capturedFiles: await mapItems(def.capturedFiles) };
          }
          if (def.resolutionCapturedFiles?.length) {
            next = {
              ...next,
              resolutionCapturedFiles: await mapItems(def.resolutionCapturedFiles),
            };
          }
          return next;
        }),
      ),
    };
  }

  return updated;
}

export async function deferInspectionMediaToBlobStore(answers: AnswersMap): Promise<AnswersMap> {
  const result: AnswersMap = {};
  for (const [key, answer] of Object.entries(answers)) {
    result[key] = await mapAnswerMedia(answer, deferItems);
  }
  return result;
}

export async function resolvePendingInspectionMedia(answers: AnswersMap): Promise<AnswersMap> {
  const blobIdsToDelete: string[] = [];
  try {
    const result: AnswersMap = {};
    for (const [key, answer] of Object.entries(answers)) {
      result[key] = await mapAnswerMedia(answer, (items) => resolveItems(items, blobIdsToDelete));
    }
    await deleteUploadedBlobsSafely(blobIdsToDelete);
    return result;
  } catch (err) {
    // Keep every local blob when any upload in the batch fails — slow/flaky
    // networks must be able to retry without "blob missing" data loss.
    throw err;
  }
}

/** Restore display URLs (and File handles) from cc-offline-blobs for queued inspections. */
export async function rehydratePendingInspectionMediaForDisplay(
  answers: AnswersMap,
): Promise<AnswersMap> {
  const result: AnswersMap = {};
  for (const [key, answer] of Object.entries(answers)) {
    result[key] = await mapAnswerMedia(answer, rehydrateDisplayItems);
  }
  return result;
}

export function answersHavePendingMedia(answers: AnswersMap): boolean {
  for (const answer of Object.values(answers)) {
    const hasPending = (items?: CapturedMediaItem[]) =>
      items?.some((i) => Boolean(i.pendingBlobId) && !i.serverUrl) ?? false;

    if (hasPending(answer.capturedFiles)) return true;
    for (const def of answer.deficiencies ?? []) {
      if (hasPending(def.capturedFiles)) return true;
    }
    for (const def of answer.resolvedDeficiencies ?? []) {
      if (hasPending(def.capturedFiles) || hasPending(def.resolutionCapturedFiles)) return true;
    }
  }
  return false;
}

export interface UploadInspectionMediaResult {
  answers: AnswersMap;
  /** True when any media was stored locally for later sync. */
  deferredMedia: boolean;
}

/**
 * Local-first submit: store every new File in blob store; never upload on submit.
 */
export async function prepareInspectionMediaForSubmit(
  answers: AnswersMap,
): Promise<UploadInspectionMediaResult> {
  const deferred = await deferInspectionMediaToBlobStore(answers);
  return {
    answers: deferred,
    deferredMedia: answersHavePendingMedia(deferred),
  };
}
