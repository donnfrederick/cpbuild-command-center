import type { Prisma } from "@prisma/client";
import {
  ACTIVITY_GPS_TRACKING_EPOCH,
  LOCATION_OUTCOME_VALUES,
  type LocationOutcome,
} from "@/lib/activity/activity-location-schema";

function outcomeToWhere(outcome: LocationOutcome): Prisma.ActivityLogWhereInput {
  switch (outcome) {
    case "on_map":
      return {
        locationContext: {
          gpsStatus: "GRANTED",
          latitude: { not: null },
          longitude: { not: null },
        },
      };
    case "denied":
      return { locationContext: { gpsStatus: "DENIED" } };
    case "timeout":
      return { locationContext: { gpsStatus: "TIMEOUT" } };
    case "unavailable":
      return { locationContext: { gpsStatus: "UNAVAILABLE" } };
    case "no_capture":
      return {
        locationContext: null,
        createdAt: { gte: ACTIVITY_GPS_TRACKING_EPOCH },
      };
    case "legacy":
      return {
        locationContext: null,
        createdAt: { lt: ACTIVITY_GPS_TRACKING_EPOCH },
      };
    default:
      return {};
  }
}

export function parseLocationOutcomeParam(raw?: string): LocationOutcome[] {
  if (!raw?.trim()) return [];
  const allowed = new Set<string>(LOCATION_OUTCOME_VALUES);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is LocationOutcome => allowed.has(s));
}

/** Prisma where for activity list/export when filtering by resolved GPS outcome. */
export function buildActivityLocationOutcomeWhere(
  outcomes: LocationOutcome[],
): Prisma.ActivityLogWhereInput {
  if (outcomes.length === 0) return {};
  const clauses = outcomes.map(outcomeToWhere);
  if (clauses.length === 1) return clauses[0]!;
  return { OR: clauses };
}
