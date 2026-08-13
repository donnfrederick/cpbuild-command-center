/**
 * Durable offline enqueue — verified blob store + post-queue read-back (status-photo pattern).
 * Prevents mutation rows that reference blob IDs with no cc-offline-blobs payload.
 */

import {
  BlobStoreVerificationError,
  deleteBlob,
  getBlob,
  storeBlobVerified,
} from "@/lib/offline/blob-store";
import { enqueueMutation, type QueuedMutation } from "@/lib/offline/mutation-queue";

export { BlobStoreVerificationError };

export interface OfflineStagedAttachmentMeta {
  caption?: string;
  imageAnnotation?: unknown;
}

export function offlineAttachmentFieldsFromStaged(
  staged: OfflineStagedAttachmentMeta[],
): { attachmentCaptions: string[]; attachmentImageAnnotations: unknown[] } {
  return {
    attachmentCaptions: staged.map((s) => s.caption ?? ""),
    attachmentImageAnnotations: staged.map((s) => s.imageAnnotation ?? null),
  };
}

/** Store files in IDB with read-back verification; roll back partial writes on failure. */
export async function storeVerifiedBlobIds(files: File[]): Promise<string[]> {
  const ids: string[] = [];
  try {
    for (const file of files) {
      ids.push(await storeBlobVerified(file));
    }
    return ids;
  } catch (err) {
    await Promise.allSettled(ids.map((id) => deleteBlob(id)));
    throw err;
  }
}

export type EnqueueMutationWithBlobsInput = Omit<
  QueuedMutation,
  "id" | "attempts" | "queuedAt" | "blobIds"
> & {
  /** When non-empty, each file is persisted with storeBlobVerified before enqueue. */
  mediaFiles?: File[];
};

/**
 * Persist media, enqueue mutation, verify blobs still readable — rollback blobs on any failure.
 */
export async function enqueueMutationWithVerifiedBlobs(
  input: EnqueueMutationWithBlobsInput,
): Promise<void> {
  const { mediaFiles, ...rest } = input;
  const files = mediaFiles?.filter((f) => f.size > 0) ?? [];
  let blobIds: string[] | undefined;

  if (files.length > 0) {
    blobIds = await storeVerifiedBlobIds(files);
  }

  try {
    await enqueueMutation({
      ...rest,
      blobIds: blobIds && blobIds.length > 0 ? blobIds : undefined,
    });

    if (blobIds) {
      for (const id of blobIds) {
        const blob = await getBlob(id);
        if (!blob || blob.size === 0) {
          throw new BlobStoreVerificationError("Queued media blob not readable after save");
        }
      }
    }
  } catch (err) {
    if (blobIds?.length) {
      await Promise.allSettled(blobIds.map((id) => deleteBlob(id)));
    }
    throw err;
  }
}
