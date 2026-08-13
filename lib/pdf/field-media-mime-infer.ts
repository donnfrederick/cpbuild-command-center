/** Pure helpers for inferring field-media MIME types in PDF/export pipelines. */

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
};

export function storageKeyFromFieldMediaUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const key = parsed.searchParams.get("key");
    if (key) {
      try {
        return decodeURIComponent(key);
      } catch {
        return key;
      }
    }
    const marker = "/field-media/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      return `field-media/${parsed.pathname.slice(markerIndex + marker.length)}`;
    }
  } catch {
    const marker = "field-media/";
    const markerIndex = url.indexOf(marker);
    if (markerIndex >= 0) return url.slice(markerIndex).split(/[?#]/)[0] ?? null;
  }
  return null;
}

export function inferFieldMediaMimeType(input: {
  storageUrl: string;
  storageKey?: string | null;
  mimeType?: string | null;
}): string {
  const explicit = input.mimeType?.trim();
  if (explicit) return explicit;

  const key = input.storageKey ?? storageKeyFromFieldMediaUrl(input.storageUrl);
  if (key) {
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]!;
  }

  if (/\.(jpe?g|png|gif|webp|heic|heif)(\?|#|$)/i.test(input.storageUrl)) {
    const withoutQuery = input.storageUrl.split(/[?#]/)[0] ?? input.storageUrl;
    const ext = withoutQuery.split(".").pop()?.toLowerCase() ?? "";
    if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]!;
  }

  if (input.storageUrl.includes("field-media") || input.storageUrl.includes("/inspections/")) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

export function isImageMimeType(mimeType: string | undefined | null): boolean {
  return Boolean(mimeType && mimeType.startsWith("image/"));
}
