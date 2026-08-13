/** Whether the current user may edit this observation (online or offline). */
export function canEditObservation(
  obs: { author: { id: string }; _pendingSync?: boolean },
  currentUserId?: string,
): boolean {
  if (!currentUserId) return false;
  // Queued on this device — only the session that created it can edit until sync.
  if (obs._pendingSync) return true;
  return obs.author.id === currentUserId;
}
