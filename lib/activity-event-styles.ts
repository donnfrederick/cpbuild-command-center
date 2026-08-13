/**
 * Design-system palettes for activity log event badges and icons.
 *
 * Primary (orange) is reserved for scope/status changes. Inspection, issues,
 * observations, and admin actions each get a distinct semantic palette so
 * the timeline is scannable at a glance.
 */
import type { ActivityEventType } from "@prisma/client";

export type ActivityEventPalette = {
  color: string;
  bg: string;
};

export type ActivityEventCategory =
  | "status"
  | "inspection"
  | "inspectionPass"
  | "calibration"
  | "issue"
  | "issueResolved"
  | "destructive"
  | "undo"
  | "observation"
  | "unit"
  | "devTest"
  | "fallback";

/** Light-background + dark-text badge pairs — matches existing activity chip pattern. */
export const ACTIVITY_EVENT_PALETTES: Record<
  ActivityEventCategory,
  ActivityEventPalette
> = {
  /** Scope install status / stage changes */
  status: {
    color: "var(--primary-700)",
    bg: "var(--primary-100)",
  },
  /** Scope inspection status updates and form submissions */
  inspection: {
    color: "var(--inspection-start-fg)",
    bg: "var(--inspection-start-bg)",
  },
  /** Clear inspection set, backfill applied — positive inspection outcomes */
  inspectionPass: {
    color: "var(--success-700)",
    bg: "var(--success-100)",
  },
  /** Calibration inspection submissions */
  calibration: {
    color: "var(--blue-700)",
    bg: "var(--blue-100)",
  },
  /** Issues reported or edited */
  issue: {
    color: "var(--warning-600)",
    bg: "var(--warning-100)",
  },
  /** Issue resolved */
  issueResolved: {
    color: "var(--success-700)",
    bg: "var(--success-100)",
  },
  /** Deletes, rate limits, destructive actions */
  destructive: {
    color: "var(--error-700)",
    bg: "var(--error-100)",
  },
  /** Undos, reopens, reversals */
  undo: {
    color: "var(--neutral-600)",
    bg: "var(--neutral-200)",
  },
  /** Field observations */
  observation: {
    color: "var(--violet-600)",
    bg: "var(--violet-100)",
  },
  /** Unit rows, installers, UPM, sub-scopes */
  unit: {
    color: "var(--neutral-700)",
    bg: "var(--neutral-100)",
  },
  /** Test-project admin actions */
  devTest: {
    color: "var(--neutral-600)",
    bg: "var(--neutral-200)",
  },
  fallback: {
    color: "var(--neutral-700)",
    bg: "var(--neutral-200)",
  },
};

const EVENT_CATEGORY: Record<ActivityEventType, ActivityEventCategory> = {
  SCOPE_STATUS_UPDATED: "status",
  SCOPE_STATUS_BULK_UPDATED: "status",
  SCOPE_STATUS_BULK_UNDONE: "undo",
  SCOPE_INSPECTION_BULK_UPDATED: "inspection",
  SCOPE_INSPECTION_UPDATED: "inspection",
  ISSUE_CREATED: "issue",
  ISSUE_BULK_CREATED: "issue",
  ISSUE_UPDATED: "issue",
  ISSUE_ANNOTATION_UPDATED: "issue",
  ISSUE_DELETED: "destructive",
  ISSUE_RESOLVED: "issueResolved",
  ISSUE_REOPENED: "undo",
  CLEAR_INSPECTION_SET: "inspectionPass",
  CLEAR_INSPECTION_DELETED: "destructive",
  INSPECTION_BACKFILL_SET: "inspectionPass",
  INSPECTION_BACKFILL_DELETED: "undo",
  INSPECTION_SUBMITTED: "inspection",
  INSPECTION_SYNC_FAILED: "destructive",
  MUTATION_SYNC_FAILED: "destructive",
  OBSERVATION_CREATED: "observation",
  OBSERVATION_BULK_CREATED: "observation",
  OBSERVATION_UPDATED: "observation",
  OBSERVATION_IMAGE_VERSION_ADDED: "observation",
  OBSERVATION_ANNOTATION_UPDATED: "observation",
  UNIT_ROW_CREATED: "unit",
  UNIT_ROW_DELETED: "destructive",
  UNIT_ROWS_BULK_DELETED: "destructive",
  UNIT_INSTALLER_BULK_UPDATED: "unit",
  SCOPE_SUBCONTRACTOR_UPDATED: "unit",
  UPM_ROW_UPDATED: "unit",
  SUB_SCOPE_INSTANCE_UPDATED: "unit",
  FIELD_MEDIA_UPLOAD_RATE_LIMITED: "destructive",
  PROJECT_CLONED_AS_TEST: "devTest",
  PROJECT_TEST_DATA_SEEDED: "devTest",
  PROJECT_TEST_DATA_BATCH_REMOVED: "undo",
  CUSTOM_SITE_LOCATION_CREATED: "unit",
  CUSTOM_SITE_LOCATION_UPDATED: "unit",
  CUSTOM_SITE_LOCATION_DELETED: "destructive",
  UNIT_PHOTO_UPLOADED: "unit",
  FIELD_DAILY_DAILY_MANPOWER_SET: "unit",
};

export function getActivityEventCategory(
  eventType: ActivityEventType
): ActivityEventCategory {
  return EVENT_CATEGORY[eventType] ?? "fallback";
}

export function getActivityEventColors(
  eventType: ActivityEventType,
  options?: { isCalibration?: boolean }
): ActivityEventPalette {
  if (options?.isCalibration) {
    return ACTIVITY_EVENT_PALETTES.calibration;
  }
  return ACTIVITY_EVENT_PALETTES[getActivityEventCategory(eventType)];
}

/** Unit/location chip — primary scan line; listed before the event-type badge. */
export const ACTIVITY_UNIT_CHIP_STYLE = {
  color: "var(--neutral-900)",
  backgroundColor: "var(--neutral-200)",
  border: "1px solid var(--neutral-400)",
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 6,
  padding: "3px 8px 3px 6px",
} as const;

/** @deprecated Use ACTIVITY_UNIT_CHIP_STYLE — kept for imports during transition */
export const ACTIVITY_LOCATION_CHIP_STYLE = ACTIVITY_UNIT_CHIP_STYLE;

export const ACTIVITY_PENDING_SYNC_CHIP_STYLE = {
  color: "var(--warning-600)",
  backgroundColor: "var(--warning-100)",
} as const;

export const ACTIVITY_SYNC_FAILED_CHIP_STYLE = {
  color: "var(--error-700)",
  backgroundColor: "var(--error-100)",
} as const;

export const ACTIVITY_OFFLINE_REPLAY_CHIP_STYLE = {
  color: "var(--primary-700)",
  backgroundColor: "var(--primary-100)",
} as const;
