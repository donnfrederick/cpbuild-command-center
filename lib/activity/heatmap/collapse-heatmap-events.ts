import type { ActivityEventType } from "@prisma/client";
import type { SerializedActivityLocation } from "@/lib/activity/activity-location-schema";

export interface HeatmapActivityEvent {
  activityLogId: string;
  userId: string | null;
  userName: string | null;
  projectId: string;
  eventType: ActivityEventType;
  createdAt: Date;
  rowId: string | null;
  location: SerializedActivityLocation;
}

const STATUS_PHOTO_PAIR_WINDOW_MS = 2 * 60 * 1000;

function preferLocation(
  primary: SerializedActivityLocation,
  secondary: SerializedActivityLocation,
): SerializedActivityLocation {
  if (primary.outcome === "on_map") return primary;
  if (secondary.outcome === "on_map") return secondary;
  if (primary.outcome !== "no_capture" && primary.outcome !== "legacy") return primary;
  return secondary;
}

/** One heat-map logical action per user action — collapse status+photo pairs. */
export function collapseHeatmapEvents(events: HeatmapActivityEvent[]): HeatmapActivityEvent[] {
  if (events.length === 0) return events;

  const photoByKey = new Map<string, HeatmapActivityEvent>();
  for (const event of events) {
    if (event.eventType !== "UNIT_PHOTO_UPLOADED") continue;
    if (!event.userId || !event.rowId) continue;
    const key = `${event.userId}|${event.rowId}|${Math.floor(event.createdAt.getTime() / STATUS_PHOTO_PAIR_WINDOW_MS)}`;
    photoByKey.set(key, event);
  }

  const droppedPhotoIds = new Set<string>();
  const mergedLocation = new Map<string, SerializedActivityLocation>();

  for (const event of events) {
    if (event.eventType !== "SCOPE_STATUS_UPDATED") continue;
    if (!event.userId || !event.rowId) continue;
    const key = `${event.userId}|${event.rowId}|${Math.floor(event.createdAt.getTime() / STATUS_PHOTO_PAIR_WINDOW_MS)}`;
    const photo = photoByKey.get(key);
    if (!photo) continue;
    const timeDelta = Math.abs(event.createdAt.getTime() - photo.createdAt.getTime());
    if (timeDelta > STATUS_PHOTO_PAIR_WINDOW_MS) continue;
    droppedPhotoIds.add(photo.activityLogId);
    mergedLocation.set(
      event.activityLogId,
      preferLocation(event.location, photo.location),
    );
  }

  return events
    .filter((e) => !droppedPhotoIds.has(e.activityLogId))
    .map((e) => {
      const merged = mergedLocation.get(e.activityLogId);
      return merged ? { ...e, location: merged } : e;
    });
}

export { STATUS_PHOTO_PAIR_WINDOW_MS };
