import { isIosDevice } from "@/lib/deliver-pdf-blob";

/** localStorage key for "save captured photos/videos to device album" preference. */
export const SAVE_TO_PHOTOS_STORAGE_KEY = "cc-save-to-photos";

/** Same-tab sync when preference toggles in the camera (storage event only fires across tabs). */
export const SAVE_TO_PHOTOS_PREFERENCE_CHANGED_EVENT = "save-to-photos-preference-changed";

export function readSaveToPhotosPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SAVE_TO_PHOTOS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeSaveToPhotosPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVE_TO_PHOTOS_STORAGE_KEY, enabled ? "true" : "false");
    window.dispatchEvent(
      new CustomEvent(SAVE_TO_PHOTOS_PREFERENCE_CHANGED_EVENT, { detail: { enabled } }),
    );
  } catch {
    /* storage unavailable */
  }
}

/** True when the browser supports sharing files via the Web Share API. */
export function canUseWebShareForFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.share === "function";
}

function isShareCancelled(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function sanitizeDownloadFileName(name: string, fallbackExt: string): string {
  const trimmed = name.trim() || `capture.${fallbackExt}`;
  return trimmed.replace(/[/\\?%*:|"<>]/g, "-");
}

function triggerFileDownload(file: File): void {
  const ext =
    file.type.startsWith("video/") ? "mp4"
    : file.type.includes("png") ? "png"
    : "jpg";
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeDownloadFileName(file.name, ext);
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 60_000);
}

/**
 * Attempt Web Share for one payload. On iOS, try share even when canShare is false
 * (Safari often rejects canShare probes while share still works).
 */
async function tryWebShare(data: ShareData): Promise<boolean> {
  if (typeof navigator.share !== "function") return false;

  const canShareFn = navigator.canShare?.bind(navigator);
  if (canShareFn && !canShareFn(data) && !isIosDevice()) {
    return false;
  }

  try {
    await navigator.share(data);
    return true;
  } catch (err) {
    if (isShareCancelled(err)) return true;
    return false;
  }
}

/**
 * Save image/video copies locally when the preference is enabled.
 * iOS: Web Share sheet → Save to Photos. Android/desktop: download fallback when share fails.
 */
export async function shareFilesToDevice(files: File[]): Promise<void> {
  if (files.length === 0) return;

  const shareable = files.filter(
    (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
  );
  if (shareable.length === 0) return;

  if (canUseWebShareForFiles()) {
    if (await tryWebShare({ files: shareable })) return;

    let sharedAny = false;
    for (const file of shareable) {
      if (await tryWebShare({ files: [file] })) sharedAny = true;
    }
    if (sharedAny) return;
  }

  if (!isIosDevice()) {
    for (const file of shareable) {
      triggerFileDownload(file);
    }
  }
}

/** When preference is on, save copies without blocking the caller (starts within user gesture). */
export function saveCapturedMediaToDeviceIfEnabled(files: File[]): void {
  if (!readSaveToPhotosPreference() || files.length === 0) return;
  void shareFilesToDevice(files);
}
