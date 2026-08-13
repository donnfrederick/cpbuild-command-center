/** Human-readable subcontractor activity summaries (project + dashboard activity logs). */

import { activityScopeDescriptionText } from "@/lib/activity-unit-chip";

export type SubcontractorActivityBadge = "assigned" | "cleared" | "updated";

export function subcontractorActivityBadgeKind(
  metadata: Record<string, unknown>,
): SubcontractorActivityBadge {
  const from = metadata.fromUnifierSubId as string | null | undefined;
  const to = metadata.toUnifierSubId as string | null | undefined;
  if (!to) return "cleared";
  if (!from) return "assigned";
  return "updated";
}

export function buildSubcontractorActivitySummary(
  metadata: Record<string, unknown>,
): string {
  const scope = activityScopeDescriptionText(metadata);
  const rawName = metadata.subcontractorName;
  const name = typeof rawName === "string" ? rawName : "";
  const hasToField = "toUnifierSubId" in metadata;
  const to = metadata.toUnifierSubId as string | null | undefined;
  const hasSubName = name.length > 0 && name !== "Unassigned";
  if (hasToField && (to === null || to === "")) {
    return scope ? `Cleared subcontractor on ${scope}` : "Cleared subcontractor";
  }
  if (!hasSubName) {
    return scope ? `Set subcontractor on ${scope}` : "Set subcontractor";
  }
  return scope
    ? `Set ${scope} subcontractor to "${name}"`
    : `Set subcontractor to "${name}"`;
}
