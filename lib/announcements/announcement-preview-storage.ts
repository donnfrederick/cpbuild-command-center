import {
  ANNOUNCEMENT_PREVIEW_STORAGE_KEY,
  type AnnouncementPreviewPayload,
} from "@/lib/announcements/types";

export function readAnnouncementPreviewPayload(): AnnouncementPreviewPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ANNOUNCEMENT_PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AnnouncementPreviewPayload;
  } catch {
    return null;
  }
}

export function writeAnnouncementPreviewPayload(payload: AnnouncementPreviewPayload): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ANNOUNCEMENT_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable */
  }
}

export function clearAnnouncementPreviewPayload(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ANNOUNCEMENT_PREVIEW_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Fired after writeAnnouncementPreviewPayload so AnnouncementHost opens on the same page. */
export const ANNOUNCEMENT_PREVIEW_OPEN_EVENT = "announcement:preview-open";

export function notifyAnnouncementPreviewOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ANNOUNCEMENT_PREVIEW_OPEN_EVENT));
}
