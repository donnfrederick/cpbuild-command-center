/**
 * Event bridge — upload queue "Retake photo" → StatusPhotoRetakeHost camera overlay.
 */

export const STATUS_PHOTO_RETAKE_EVENT = "status-photo:retake-request";

export function requestStatusPhotoRetake(mutationId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(STATUS_PHOTO_RETAKE_EVENT, { detail: { mutationId } }),
  );
}

export function subscribeStatusPhotoRetake(
  listener: (mutationId: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const id = (event as CustomEvent<{ mutationId?: string }>).detail?.mutationId;
    if (typeof id === "string" && id.length > 0) listener(id);
  };
  window.addEventListener(STATUS_PHOTO_RETAKE_EVENT, handler);
  return () => window.removeEventListener(STATUS_PHOTO_RETAKE_EVENT, handler);
}
