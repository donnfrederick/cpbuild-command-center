/** Fallback when a Unifier UXSUB id cannot be resolved to a company name. */
export const UNKNOWN_SUBCONTRACTOR_LABEL = "Unknown subcontractor";

/** True when the label is a raw id or unresolved placeholder — not a real company name. */
export function isOpaqueSubcontractorId(label: string): boolean {
  const trimmed = label.trim();
  return trimmed === UNKNOWN_SUBCONTRACTOR_LABEL || /^[0-9]+$/.test(trimmed);
}

export function resolveSubcontractorLabelFromLookup(
  subId: string | null | undefined,
  nameBySubId: Map<string, string>,
): string | undefined {
  if (!subId) return undefined;
  const name = nameBySubId.get(subId)?.trim();
  if (name) return name;
  return UNKNOWN_SUBCONTRACTOR_LABEL;
}
