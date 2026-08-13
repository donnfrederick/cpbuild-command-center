/** Normalize activity events for display — e.g. legacy subcontractor rows logged as UPM updates. */

import {
  subcontractorActivityBadgeKind,
  type SubcontractorActivityBadge,
} from "@/lib/activity-subcontractor-summary";

export function isLegacySubcontractorUpmEvent(
  eventType: string,
  metadata: Record<string, unknown>,
): boolean {
  if (eventType !== "UPM_ROW_UPDATED") return false;
  const changed = metadata.changedFields;
  if (!Array.isArray(changed)) return false;
  return changed.includes("unifierSubId");
}

/** True when the UI should render subcontractor assigned/updated/cleared styling. */
export function isSubcontractorActivityEvent(
  eventType: string,
  metadata: Record<string, unknown>,
): boolean {
  return eventType === "SCOPE_SUBCONTRACTOR_UPDATED" || isLegacySubcontractorUpmEvent(eventType, metadata);
}

export function subcontractorActivityBadgeForEvent(
  eventType: string,
  metadata: Record<string, unknown>,
): SubcontractorActivityBadge {
  if (eventType === "SCOPE_SUBCONTRACTOR_UPDATED") {
    return subcontractorActivityBadgeKind(metadata);
  }
  // Legacy UPM rows only recorded the field name — treat as an update.
  return "updated";
}

export function upmChangedFieldsWithoutSubcontractor(metadata: Record<string, unknown>): string[] {
  const changed = metadata.changedFields;
  if (!Array.isArray(changed)) return [];
  return (changed as string[]).filter((field) => field !== "unifierSubId");
}
