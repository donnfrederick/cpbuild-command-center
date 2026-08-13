/**
 * Open a queued mutation for editing from the upload queue sheet.
 */

export const OPEN_PENDING_MUTATION_EVENT = "offline:open-pending-mutation";

export interface OpenPendingMutationDetail {
  mutationId: string;
}

export function requestOpenPendingMutation(mutationId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenPendingMutationDetail>(OPEN_PENDING_MUTATION_EVENT, {
      detail: { mutationId },
    }),
  );
}

export function subscribeOpenPendingMutation(
  handler: (mutationId: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  function onEvent(e: Event) {
    const detail = (e as CustomEvent<OpenPendingMutationDetail>).detail;
    if (detail?.mutationId) handler(detail.mutationId);
  }

  window.addEventListener(OPEN_PENDING_MUTATION_EVENT, onEvent);
  return () => window.removeEventListener(OPEN_PENDING_MUTATION_EVENT, onEvent);
}
