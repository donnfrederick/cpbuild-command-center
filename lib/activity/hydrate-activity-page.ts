import type { ActivityEventType, Prisma } from "@prisma/client";
import { hydrateInspectionActivityMetadata } from "@/lib/activity-inspection-metadata";
import { hydrateActivityMediaMetadata } from "@/lib/activity-media-metadata";
import { hydrateSubcontractorActivityMetadata } from "@/lib/activity-subcontractor-metadata";
import { hydrateActivityLocationMetadata } from "@/lib/activity/hydrate-activity-location-metadata";

interface ActivityWithMetadata {
  id: string;
  projectId: string;
  eventType: ActivityEventType;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}

/** Full read-time enrichment chain for activity list endpoints. */
export async function hydrateActivityPage<T extends ActivityWithMetadata>(
  events: T[],
  options?: { includeLocation?: boolean },
): Promise<T[]> {
  const withInspection = await hydrateInspectionActivityMetadata(events);
  const withSubcontractor = await hydrateSubcontractorActivityMetadata(withInspection);
  const withMedia = await hydrateActivityMediaMetadata(withSubcontractor);
  if (options?.includeLocation === false) {
    return withMedia;
  }
  return hydrateActivityLocationMetadata(withMedia);
}
