import { ActivityEventType, type Prisma } from "@prisma/client";

/** Markup/annotation churn — never surfaced in activity feeds or exports. */
export const ACTIVITY_ANNOTATION_HIDDEN_EVENTS: ActivityEventType[] = [
  ActivityEventType.ISSUE_ANNOTATION_UPDATED,
  ActivityEventType.OBSERVATION_ANNOTATION_UPDATED,
  ActivityEventType.OBSERVATION_IMAGE_VERSION_ADDED,
];

/**
 * Location Builder row CRUD and spreadsheet-field edits — not field-work activity.
 * Legacy rows may remain in the DB but are hidden from feeds/exports and no longer logged.
 */
export const ACTIVITY_LOCATION_BUILDER_HIDDEN_EVENTS: ActivityEventType[] = [
  ActivityEventType.UNIT_ROW_CREATED,
  ActivityEventType.UNIT_ROW_DELETED,
  ActivityEventType.UNIT_ROWS_BULK_DELETED,
  ActivityEventType.UPM_ROW_UPDATED,
];

/** Replaced by per-row SCOPE_SUBCONTRACTOR_UPDATED — hide legacy bulk installer rows. */
export const ACTIVITY_LEGACY_INSTALLER_HIDDEN_EVENTS: ActivityEventType[] = [
  ActivityEventType.UNIT_INSTALLER_BULK_UPDATED,
];

/**
 * Legacy pre-form clear inspection toggles (`POST /clear-inspections`).
 * Orphan rows are soft-deleted from `clear_inspections`; hide the matching
 * activity noise from feeds and exports.
 */
export const LEGACY_CLEAR_TOGGLE_ACTIVITY_EVENTS: ActivityEventType[] = [
  ActivityEventType.CLEAR_INSPECTION_SET,
  ActivityEventType.CLEAR_INSPECTION_DELETED,
];

/** Hidden event types for all roles (before optional security-event gating). */
export function baseActivityHiddenEvents(): ActivityEventType[] {
  return [
    ...ACTIVITY_ANNOTATION_HIDDEN_EVENTS,
    ...LEGACY_CLEAR_TOGGLE_ACTIVITY_EVENTS,
    ...ACTIVITY_LOCATION_BUILDER_HIDDEN_EVENTS,
    ...ACTIVITY_LEGACY_INSTALLER_HIDDEN_EVENTS,
  ];
}

/**
 * Event types excluded from activity list queries.
 * Non-squad roles also lose security/rate-limit events.
 */
export function activityAlwaysExclude(options: { squadRole: boolean }): ActivityEventType[] {
  const hidden = baseActivityHiddenEvents();
  return options.squadRole
    ? hidden
    : [...hidden, ActivityEventType.FIELD_MEDIA_UPLOAD_RATE_LIMITED];
}

/**
 * Legacy subcontractor assignments were logged as UPM_ROW_UPDATED before
 * SCOPE_SUBCONTRACTOR_UPDATED existed. Keep those rows visible while hiding
 * other Location Builder UPM edits.
 */
export function legacySubcontractorUpmVisibilityWhere(): Prisma.ActivityLogWhereInput {
  return {
    eventType: ActivityEventType.UPM_ROW_UPDATED,
    metadata: {
      path: ["changedFields"],
      array_contains: "unifierSubId",
    },
  };
}
