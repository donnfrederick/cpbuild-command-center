/**
 * Status-update album photo queue — verified blob store + parse helpers for retake.
 */

import { getBlob, storeBlobVerified, deleteBlob } from "@/lib/offline/blob-store";
import { enqueueMutation, type QueuedMutation } from "@/lib/offline/mutation-queue";

export interface StatusPhotoQueueContext {
  projectId: string;
  unitRef: string;
  sourceLabel: string;
  scopeName: string;
  statusDisplayLabel: string;
  albumUrl: string;
}

export function parseSourceLabel(sourceLabel: string): {
  scopeName: string;
  statusDisplayLabel: string;
} {
  const parts = sourceLabel.split(" · ").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      scopeName: parts.slice(0, -1).join(" · "),
      statusDisplayLabel: parts[parts.length - 1]!,
    };
  }
  return { scopeName: sourceLabel, statusDisplayLabel: "" };
}

export function parseStatusPhotoMutation(mutation: QueuedMutation): StatusPhotoQueueContext | null {
  if (mutation.type !== "link-status-album-photo") return null;

  const projectMatch = mutation.url.match(/\/api\/projects\/([^/]+)\/album/);
  const projectId = projectMatch?.[1];
  if (!projectId) return null;

  let unitRef = "";
  try {
    const parsed = new URL(mutation.url, "https://local.invalid");
    unitRef = parsed.searchParams.get("unitRef") ?? "";
  } catch {
    return null;
  }
  if (!unitRef) return null;

  const body =
    typeof mutation.body === "object" && mutation.body !== null
      ? (mutation.body as Record<string, unknown>)
      : {};
  const sourceLabel = String(body.sourceLabel ?? "").trim();
  if (!sourceLabel) return null;

  const { scopeName, statusDisplayLabel } = parseSourceLabel(sourceLabel);

  return {
    projectId,
    unitRef,
    sourceLabel,
    scopeName,
    statusDisplayLabel,
    albumUrl: mutation.url,
  };
}

/** Store blob, read back to confirm persistence, then enqueue — rollback blob on any failure. */
export async function enqueueStatusPhotoMutation(params: {
  albumUrl: string;
  sourceLabel: string;
  file: File;
}): Promise<void> {
  let blobId: string | null = null;
  try {
    blobId = await storeBlobVerified(params.file);
    await enqueueMutation({
      type: "link-status-album-photo",
      url: params.albumUrl,
      method: "POST",
      body: {
        caption: null,
        sourceType: "status_update",
        sourceLabel: params.sourceLabel,
        fileSizeBytes: params.file.size,
      },
      blobIds: [blobId],
    });
    const stillThere = await getBlob(blobId);
    if (!stillThere || stillThere.size === 0) {
      throw new Error("Status photo blob not readable after queue");
    }
  } catch (err) {
    if (blobId) {
      await deleteBlob(blobId).catch(() => undefined);
    }
    throw err;
  }
}
