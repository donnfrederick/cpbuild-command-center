import type { ActivityEventType } from "@prisma/client";
import type { SerializedActivityLocation } from "@/lib/activity/activity-location-schema";
import {
  type ActivityRowForLocation,
  buildMediaLookupMaps,
  resolveActivityLocationForEvent,
} from "@/lib/activity/activity-location-resolver";
import { db } from "@/lib/db";

export interface ActivityEventWithLocation<T = ActivityRowForLocation> extends ActivityRowForLocation {
  activityLocation: SerializedActivityLocation;
  /** Preserve extra fields from T (userName, project, etc.) */
  [key: string]: unknown;
}

export async function hydrateActivityLocationMetadata<T extends ActivityRowForLocation>(
  events: T[],
): Promise<(T & { activityLocation: SerializedActivityLocation })[]> {
  if (events.length === 0) return [];

  const ids = events.map((e) => e.id);
  const storedRows = await db.activityLocationContext.findMany({
    where: { activityLogId: { in: ids } },
    select: {
      activityLogId: true,
      gpsStatus: true,
      latitude: true,
      longitude: true,
      distanceFromProjectMeters: true,
      source: true,
    },
  });
  const storedByLogId = new Map(storedRows.map((r) => [r.activityLogId, r]));

  const mediaLookup = await buildMediaLookupMaps(events);

  const results: (T & { activityLocation: SerializedActivityLocation })[] = [];
  for (const event of events) {
    const activityLocation = await resolveActivityLocationForEvent(
      event,
      storedByLogId.get(event.id) ?? null,
      mediaLookup,
    );

    if (
      activityLocation.source === "media_derived"
      && !storedByLogId.has(event.id)
      && activityLocation.outcome === "on_map"
    ) {
      void db.activityLocationContext
        .create({
          data: {
            activityLogId: event.id,
            gpsStatus: "GRANTED",
            latitude: activityLocation.latitude ?? null,
            longitude: activityLocation.longitude ?? null,
            distanceFromProjectMeters: activityLocation.distanceFromProjectMeters ?? null,
            locationRecordedAt: event.createdAt,
            source: "BACKFILL",
          },
        })
        .catch(() => undefined);
    }

    results.push({ ...event, activityLocation });
  }

  return results;
}

export type { ActivityRowForLocation };
