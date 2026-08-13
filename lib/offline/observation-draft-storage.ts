/**
 * Observation form draft persistence (unit-level AddObservationModal).
 *
 * Text fields live in localStorage; staged photo/video blobs are stored in the
 * offline blob store (IndexedDB) so they survive accidental modal close /
 * navigation on mobile field walks.
 */

import type { ImageAnnotationPayload } from "@/lib/image-annotation-schema";
import { draftAgeLabel } from "@/lib/feedback/draft-storage";
import { deleteBlob, getBlob, getBlobMeta, storeBlobVerified } from "@/lib/offline/blob-store";

const DRAFT_KEY_PREFIX = "cc-observation-draft:";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type ObservationDraftType = string;

export interface ObservationDraftMediaEntry {
  clientId: string;
  blobId: string;
  mimeType: string;
  caption: string;
  imageAnnotation?: ImageAnnotationPayload;
}

export interface ObservationDraftRecord {
  version: 1;
  selectedRowIds: string[];
  title: string;
  obsType: ObservationDraftType;
  description: string;
  media: ObservationDraftMediaEntry[];
  savedAt: number;
}

export interface StagedMediaForDraft {
  clientId: string;
  file: File;
  mimeType: string;
  caption: string;
  imageAnnotation?: ImageAnnotationPayload;
}

export interface RestoredStagedMedia {
  clientId: string;
  file: File;
  localUrl: string;
  mimeType: string;
  caption: string;
  imageAnnotation?: ImageAnnotationPayload;
}

export function observationDraftStorageKey(projectId: string, unitRef: string): string {
  return `${DRAFT_KEY_PREFIX}${projectId}:${unitRef}`;
}

export { draftAgeLabel as observationDraftAgeLabel };

export function hasMeaningfulObservationDraft(draft: ObservationDraftRecord): boolean {
  return (
    draft.title.trim().length > 0 ||
    draft.description.trim().length > 0 ||
    draft.obsType !== "" ||
    draft.media.length > 0
  );
}

export function loadObservationDraft(
  projectId: string,
  unitRef: string,
): ObservationDraftRecord | null {
  if (typeof window === "undefined") return null;
  const key = observationDraftStorageKey(projectId, unitRef);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ObservationDraftRecord>;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
      if (Array.isArray(parsed.media)) {
        void Promise.all(
          parsed.media
            .filter(
              (m): m is ObservationDraftMediaEntry =>
                !!m && typeof (m as ObservationDraftMediaEntry).blobId === "string",
            )
            .map((m) => deleteBlob(m.blobId).catch(() => undefined)),
        );
      }
      return null;
    }

    const obsType = parsed.obsType;
    const validType: ObservationDraftType =
      typeof obsType === "string" ? obsType : "";

    return {
      version: 1,
      selectedRowIds: Array.isArray(parsed.selectedRowIds)
        ? parsed.selectedRowIds.filter((id): id is string => typeof id === "string")
        : [],
      title: typeof parsed.title === "string" ? parsed.title : "",
      obsType: validType,
      description: typeof parsed.description === "string" ? parsed.description : "",
      media: Array.isArray(parsed.media)
        ? parsed.media
            .filter(
              (m): m is ObservationDraftMediaEntry =>
                !!m &&
                typeof m === "object" &&
                typeof (m as ObservationDraftMediaEntry).clientId === "string" &&
                typeof (m as ObservationDraftMediaEntry).blobId === "string" &&
                typeof (m as ObservationDraftMediaEntry).mimeType === "string",
            )
            .map((m) => ({
              clientId: m.clientId,
              blobId: m.blobId,
              mimeType: m.mimeType,
              caption: typeof m.caption === "string" ? m.caption : "",
              imageAnnotation: m.imageAnnotation,
            }))
        : [],
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export async function clearObservationDraft(
  projectId: string,
  unitRef: string,
): Promise<void> {
  if (typeof window === "undefined") return;
  const key = observationDraftStorageKey(projectId, unitRef);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ObservationDraftRecord>;
      if (Array.isArray(parsed.media)) {
        await Promise.all(
          parsed.media
            .filter(
              (m): m is ObservationDraftMediaEntry =>
                !!m && typeof (m as ObservationDraftMediaEntry).blobId === "string",
            )
            .map((m) => deleteBlob(m.blobId).catch(() => undefined)),
        );
      }
    }
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable or malformed */
  }
}

/**
 * Persist draft text + staged media blobs. Returns updated clientId → blobId map.
 */
export async function saveObservationDraft(params: {
  projectId: string;
  unitRef: string;
  selectedRowIds: string[];
  title: string;
  obsType: ObservationDraftType;
  description: string;
  stagedMedia: StagedMediaForDraft[];
  blobIdsByClientId: Map<string, string>;
}): Promise<Map<string, string>> {
  const {
    projectId,
    unitRef,
    selectedRowIds,
    title,
    obsType,
    description,
    stagedMedia,
    blobIdsByClientId,
  } = params;

  const nextBlobMap = new Map(blobIdsByClientId);
  const stagedClientIds = new Set(stagedMedia.map((m) => m.clientId));

  for (const [clientId, blobId] of nextBlobMap) {
    if (!stagedClientIds.has(clientId)) {
      await deleteBlob(blobId).catch(() => undefined);
      nextBlobMap.delete(clientId);
    }
  }

  const mediaEntries: ObservationDraftMediaEntry[] = [];

  for (const item of stagedMedia) {
    let blobId = nextBlobMap.get(item.clientId);
    if (!blobId) {
      blobId = await storeBlobVerified(item.file);
      nextBlobMap.set(item.clientId, blobId);
    }

    mediaEntries.push({
      clientId: item.clientId,
      blobId,
      mimeType: item.mimeType,
      caption: item.caption,
      imageAnnotation: item.imageAnnotation,
    });
  }

  const record: ObservationDraftRecord = {
    version: 1,
    selectedRowIds,
    title,
    obsType,
    description,
    media: mediaEntries,
    savedAt: Date.now(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        observationDraftStorageKey(projectId, unitRef),
        JSON.stringify(record),
      );
    } catch {
      /* quota / private mode */
    }
  }

  return nextBlobMap;
}

/** Rehydrate staged media from blob store for restore. Skips missing blobs. */
export async function restoreObservationDraftMedia(
  draft: ObservationDraftRecord,
): Promise<RestoredStagedMedia[]> {
  const restored: RestoredStagedMedia[] = [];

  for (const entry of draft.media) {
    const blob = await getBlob(entry.blobId);
    const meta = await getBlobMeta(entry.blobId);
    if (!blob || !meta) continue;

    const fileName = meta.fileName || `draft-${entry.clientId}`;
    const file = new File([blob], fileName, { type: entry.mimeType || meta.mimeType });
    restored.push({
      clientId: entry.clientId,
      file,
      localUrl: URL.createObjectURL(blob),
      mimeType: entry.mimeType || meta.mimeType,
      caption: entry.caption,
      imageAnnotation: entry.imageAnnotation,
    });
  }

  return restored;
}
