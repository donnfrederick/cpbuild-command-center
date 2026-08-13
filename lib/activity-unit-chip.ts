/** Build location chip segments: building · level · unit · scope (when present). */
export function activityLocationChipParts(metadata: Record<string, unknown>): string[] {
  return [metadata.building, metadata.level, metadata.unit, metadata.scopeName].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
}

/** True when scopeName is on the location chip alongside unit location — omit from description. */
export function scopeNameInLocationChip(metadata: Record<string, unknown>): boolean {
  const scopeName = metadata.scopeName;
  if (typeof scopeName !== "string" || scopeName.trim().length === 0) return false;
  const chipParts = activityLocationChipParts(metadata);
  if (!chipParts.includes(scopeName.trim())) return false;
  const hasUnitLocation = [metadata.building, metadata.level, metadata.unit].some(
    (part) => typeof part === "string" && part.trim().length > 0,
  );
  return hasUnitLocation;
}

/**
 * Scope label for activity description text.
 * Returns empty when the scope already appears on the location chip.
 */
export function activityScopeDescriptionText(
  metadata: Record<string, unknown>,
  fallback = "scope",
): string {
  if (scopeNameInLocationChip(metadata)) return "";
  const scope = typeof metadata.scopeName === "string" ? metadata.scopeName.trim() : "";
  return scope || fallback;
}

/** Format actor for activity summaries — prefer the viewer's name for their own events. */
export function formatActivityActor(
  event: { userId: string | null; userName: string | null; metadata: Record<string, unknown> },
  currentUserId?: string,
  pendingActorLabel = "Pending sync",
  currentUserDisplayName?: string,
): string {
  if (event.userId && currentUserId && event.userId === currentUserId) {
    const viewerName = currentUserDisplayName?.trim();
    if (viewerName) return viewerName;
    return "You";
  }
  const storedName = event.userName?.trim();
  if (storedName) return storedName;
  const pendingSync = Boolean(event.metadata.pendingSync);
  return pendingSync ? pendingActorLabel : "Someone";
}
