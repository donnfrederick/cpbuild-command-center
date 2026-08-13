import { ActivityEventType } from "@prisma/client";

export const FIELD_DAILY_STATUS_EVENT_TYPES: ActivityEventType[] = [
  ActivityEventType.SCOPE_STATUS_UPDATED,
  ActivityEventType.SCOPE_STATUS_BULK_UPDATED,
  ActivityEventType.SCOPE_STATUS_BULK_UNDONE,
  ActivityEventType.SUB_SCOPE_INSTANCE_UPDATED,
];

export const FIELD_DAILY_SUBCONTRACTOR_EVENT_TYPES: ActivityEventType[] = [
  ActivityEventType.SCOPE_SUBCONTRACTOR_UPDATED,
];

export const FIELD_DAILY_INSPECTION_EVENT_TYPES: ActivityEventType[] = [
  ActivityEventType.INSPECTION_SUBMITTED,
  ActivityEventType.SCOPE_INSPECTION_UPDATED,
  ActivityEventType.SCOPE_INSPECTION_BULK_UPDATED,
];

export const FIELD_DAILY_ISSUE_EVENT_TYPES: ActivityEventType[] = [
  ActivityEventType.ISSUE_CREATED,
  ActivityEventType.ISSUE_BULK_CREATED,
  ActivityEventType.ISSUE_UPDATED,
  ActivityEventType.ISSUE_RESOLVED,
  ActivityEventType.ISSUE_REOPENED,
];

export const FIELD_DAILY_OBSERVATION_EVENT_TYPES: ActivityEventType[] = [
  ActivityEventType.OBSERVATION_CREATED,
  ActivityEventType.OBSERVATION_BULK_CREATED,
  ActivityEventType.OBSERVATION_UPDATED,
];

export const FIELD_DAILY_ALL_EVENT_TYPES: ActivityEventType[] = [
  ...FIELD_DAILY_STATUS_EVENT_TYPES,
  ...FIELD_DAILY_SUBCONTRACTOR_EVENT_TYPES,
  ...FIELD_DAILY_INSPECTION_EVENT_TYPES,
  ...FIELD_DAILY_ISSUE_EVENT_TYPES,
  ...FIELD_DAILY_OBSERVATION_EVENT_TYPES,
];
