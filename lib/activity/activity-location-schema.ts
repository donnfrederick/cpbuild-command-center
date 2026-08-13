import { z } from "zod";
import { CAPTURE_GPS_STATUS_VALUES } from "@/lib/media/capture-context-schema";

/** Events logged before this instant without stored GPS are shown as legacy. */
export const ACTIVITY_GPS_TRACKING_EPOCH = new Date("2026-07-25T00:00:00.000Z");

export const LOCATION_OUTCOME_VALUES = [
  "on_map",
  "denied",
  "timeout",
  "unavailable",
  "no_capture",
  "legacy",
] as const;

export type LocationOutcome = (typeof LOCATION_OUTCOME_VALUES)[number];

export const ACTIVITY_LOCATION_SOURCE_VALUES = [
  "activity_capture",
  "media_derived",
  "backfill",
] as const;

export type ActivityLocationSourceClient = (typeof ACTIVITY_LOCATION_SOURCE_VALUES)[number];

/** Client-submitted GPS payload on mutating API requests. */
export const ActivityClientLocationSchema = z.object({
  gpsStatus: z.enum(CAPTURE_GPS_STATUS_VALUES),
  locationRecordedAt: z.string().datetime(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  accuracyMeters: z.number().finite().nonnegative().optional(),
});

export type ActivityClientLocation = z.infer<typeof ActivityClientLocationSchema>;

export function parseActivityClientLocation(raw: unknown): ActivityClientLocation | null {
  const parsed = ActivityClientLocationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Read optional `activityLocation` from a JSON request body record. */
export function readActivityLocationFromBody(
  body: Record<string, unknown> | null | undefined,
): ActivityClientLocation | null {
  if (!body) return null;
  return parseActivityClientLocation(body.activityLocation);
}

export interface SerializedActivityLocation {
  outcome: LocationOutcome;
  gpsStatus?: "granted" | "denied" | "timeout" | "unavailable";
  latitude?: number | null;
  longitude?: number | null;
  distanceFromProjectMeters?: number | null;
  source?: ActivityLocationSourceClient;
}

export function gpsStatusDbToClient(
  status: "GRANTED" | "DENIED" | "TIMEOUT" | "UNAVAILABLE",
): "granted" | "denied" | "timeout" | "unavailable" {
  const map = {
    GRANTED: "granted",
    DENIED: "denied",
    TIMEOUT: "timeout",
    UNAVAILABLE: "unavailable",
  } as const;
  return map[status];
}

export function activityLocationSourceDbToClient(
  source: "ACTIVITY_CAPTURE" | "MEDIA_DERIVED" | "BACKFILL",
): ActivityLocationSourceClient {
  const map = {
    ACTIVITY_CAPTURE: "activity_capture",
    MEDIA_DERIVED: "media_derived",
    BACKFILL: "backfill",
  } as const;
  return map[source];
}
