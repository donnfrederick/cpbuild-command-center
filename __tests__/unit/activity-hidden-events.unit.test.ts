import { describe, it, expect } from "vitest";
import { ActivityEventType } from "@prisma/client";
import {
  ACTIVITY_LOCATION_BUILDER_HIDDEN_EVENTS,
  LEGACY_CLEAR_TOGGLE_ACTIVITY_EVENTS,
  activityAlwaysExclude,
  baseActivityHiddenEvents,
} from "@/lib/activity-hidden-events";
import { FILTERABLE_ACTIVITY_EVENT_TYPES } from "@/lib/activity-filter-event-types";

describe("activity-hidden-events", () => {
  it("includes legacy clear toggle events in the base hidden set", () => {
    expect(baseActivityHiddenEvents()).toEqual(
      expect.arrayContaining(LEGACY_CLEAR_TOGGLE_ACTIVITY_EVENTS)
    );
    expect(LEGACY_CLEAR_TOGGLE_ACTIVITY_EVENTS).toContain(
      ActivityEventType.CLEAR_INSPECTION_SET
    );
    expect(LEGACY_CLEAR_TOGGLE_ACTIVITY_EVENTS).toContain(
      ActivityEventType.CLEAR_INSPECTION_DELETED
    );
  });

  it("hides Location Builder event types from activity feeds", () => {
    expect(baseActivityHiddenEvents()).toEqual(
      expect.arrayContaining(ACTIVITY_LOCATION_BUILDER_HIDDEN_EVENTS)
    );
    expect(ACTIVITY_LOCATION_BUILDER_HIDDEN_EVENTS).toContain(
      ActivityEventType.UPM_ROW_UPDATED
    );
  });

  it("hides annotation markup events from activity feeds", () => {
    expect(baseActivityHiddenEvents()).toContain(
      ActivityEventType.ISSUE_ANNOTATION_UPDATED,
    );
    expect(baseActivityHiddenEvents()).toContain(
      ActivityEventType.OBSERVATION_ANNOTATION_UPDATED,
    );
    expect(baseActivityHiddenEvents()).toContain(
      ActivityEventType.OBSERVATION_IMAGE_VERSION_ADDED,
    );
  });

  it("adds security events for non-squad roles only", () => {
    const squad = activityAlwaysExclude({ squadRole: true });
    const member = activityAlwaysExclude({ squadRole: false });

    expect(squad).not.toContain(ActivityEventType.FIELD_MEDIA_UPLOAD_RATE_LIMITED);
    expect(member).toContain(ActivityEventType.FIELD_MEDIA_UPLOAD_RATE_LIMITED);
    expect(member).toContain(ActivityEventType.CLEAR_INSPECTION_SET);
  });
});

describe("FILTERABLE_ACTIVITY_EVENT_TYPES", () => {
  it("does not offer Location Builder or legacy installer filters", () => {
    for (const hidden of [
      "UNIT_ROW_CREATED",
      "UNIT_ROW_DELETED",
      "UNIT_ROWS_BULK_DELETED",
      "UPM_ROW_UPDATED",
      "UNIT_INSTALLER_BULK_UPDATED",
      "CLEAR_INSPECTION_SET",
      "ISSUE_ANNOTATION_UPDATED",
      "OBSERVATION_ANNOTATION_UPDATED",
      "OBSERVATION_IMAGE_VERSION_ADDED",
    ]) {
      expect(FILTERABLE_ACTIVITY_EVENT_TYPES).not.toContain(hidden);
    }
    expect(FILTERABLE_ACTIVITY_EVENT_TYPES).toContain("SCOPE_SUBCONTRACTOR_UPDATED");
    expect(FILTERABLE_ACTIVITY_EVENT_TYPES).toContain("UNIT_PHOTO_UPLOADED");
  });

  it("uses only defined string event type ids", () => {
    for (const type of FILTERABLE_ACTIVITY_EVENT_TYPES) {
      expect(typeof type).toBe("string");
      expect(type.length).toBeGreaterThan(0);
    }
  });
});
