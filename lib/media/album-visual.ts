/** Shared visual-media helpers for album aggregation and coverage. */

export function isVisualMedia(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function mimeTypeFromUrl(url: string): string | null {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.(jpe?g|png|gif|webp|heic|heif)$/.test(path)) return "image/jpeg";
  if (/\.(mp4|mov|webm|m4v)$/.test(path)) return "video/mp4";
  return null;
}

export function visualMimeType(mimeType: string | null | undefined, url: string): string | null {
  const resolved = mimeType && mimeType.trim().length > 0 ? mimeType : mimeTypeFromUrl(url);
  return resolved && isVisualMedia(resolved) ? resolved : null;
}

export function extractCapturedMedia(rawAnswer: unknown): Array<{
  storageUrl: string;
  mimeType: string;
  fileSizeBytes: number | null;
}> {
  if (!isRecord(rawAnswer) || !Array.isArray(rawAnswer.capturedFiles)) return [];

  return rawAnswer.capturedFiles.flatMap((item) => {
    if (!isRecord(item)) return [];
    const url =
      stringOrNull(item.serverUrl) ??
      stringOrNull(item.storageUrl) ??
      stringOrNull(item.localUrl);
    if (!url || url.startsWith("blob:")) return [];

    const mimeType = visualMimeType(stringOrNull(item.mimeType), url);
    if (!mimeType) return [];

    return [{
      storageUrl: url,
      mimeType,
      fileSizeBytes: numberOrNull(item.fileSizeBytes),
    }];
  });
}

/** Prisma `where` clause matching image/video attachments. */
export const VISUAL_MIME_WHERE = {
  OR: [
    { mimeType: { startsWith: "image/" } },
    { mimeType: { startsWith: "video/" } },
  ],
};
