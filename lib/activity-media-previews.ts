/** Client-safe helpers for activity log photo previews (no server/db imports). */

export interface ActivityMediaPreview {
  id: string;
  storageUrl: string;
  mimeType: string;
}

export const ACTIVITY_MEDIA_PREVIEWS_KEY = "mediaPreviews";
export const ACTIVITY_MEDIA_PREVIEW_LIMIT = 4;

function isImageMime(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType?.startsWith("image/"));
}

export function readActivityMediaPreviews(metadata: Record<string, unknown>): ActivityMediaPreview[] {
  const raw = metadata[ACTIVITY_MEDIA_PREVIEWS_KEY];
  if (!Array.isArray(raw)) return [];
  const out: ActivityMediaPreview[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const id = row.id;
    const storageUrl = row.storageUrl;
    const mimeType = row.mimeType;
    if (typeof id !== "string" || typeof storageUrl !== "string" || typeof mimeType !== "string") continue;
    if (!isImageMime(mimeType)) continue;
    out.push({ id, storageUrl, mimeType });
    if (out.length >= ACTIVITY_MEDIA_PREVIEW_LIMIT) break;
  }
  return out;
}
