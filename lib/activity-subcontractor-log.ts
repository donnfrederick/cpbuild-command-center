import { UNKNOWN_SUBCONTRACTOR_LABEL, resolveSubcontractorLabelFromLookup } from "@/lib/subcontractor-display";
import { getSubcontractorNameLookup } from "@/lib/unifier/subcontractors";

/** Resolve Unifier UXSUB id to a display name for activity log metadata. */
export async function resolveSubcontractorDisplayName(
  unifierSubId: string | null | undefined,
): Promise<string> {
  if (!unifierSubId) return "Unassigned";
  const lookup = await getSubcontractorNameLookup().catch(() => new Map<string, string>());
  return resolveSubcontractorLabelFromLookup(unifierSubId, lookup) ?? UNKNOWN_SUBCONTRACTOR_LABEL;
}
