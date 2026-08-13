import { ActivityEventType, type Prisma } from "@prisma/client";
import { legacySubcontractorUpmVisibilityWhere } from "@/lib/activity-hidden-events";

/** Date bounds for activity list queries — cursor applies only to paginated reads, not counts. */
export function buildActivityCreatedAtWhere(options: {
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  includeCursor?: boolean;
}): Prisma.ActivityLogWhereInput["createdAt"] | undefined {
  const { dateFrom, dateTo, cursor, includeCursor = false } = options;
  if (!dateFrom && !dateTo && !(includeCursor && cursor)) return undefined;
  return {
    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
    ...(dateTo ? { lte: new Date(dateTo) } : {}),
    ...(includeCursor && cursor ? { lt: new Date(cursor) } : {}),
  };
}

/** Default feed visibility — hides Location Builder UPM rows except legacy subcontractor ones. */
export function buildDefaultActivityEventVisibilityWhere(
  alwaysExclude: ActivityEventType[],
): Prisma.ActivityLogWhereInput {
  const excludeWithoutUpm = alwaysExclude.filter(
    (t) => t !== ActivityEventType.UPM_ROW_UPDATED,
  );
  return {
    OR: [
      {
        eventType: {
          notIn: [...excludeWithoutUpm, ActivityEventType.UPM_ROW_UPDATED],
        },
      },
      legacySubcontractorUpmVisibilityWhere(),
    ],
  };
}

export function resolveActivityEventTypeWhere(options: {
  eventTypeParam?: string;
  alwaysExclude: ActivityEventType[];
}): { where: Prisma.ActivityLogWhereInput; empty: boolean } {
  const eventTypes: ActivityEventType[] = options.eventTypeParam
    ? (options.eventTypeParam
        .split(",")
        .map((t) => t.trim())
        .filter((t) =>
          Object.values(ActivityEventType).includes(t as ActivityEventType),
        ) as ActivityEventType[])
    : [];

  if (eventTypes.length === 0) {
    return {
      where: buildDefaultActivityEventVisibilityWhere(options.alwaysExclude),
      empty: false,
    };
  }

  const allowed = eventTypes.filter((t) => !options.alwaysExclude.includes(t));
  if (allowed.length === 0) {
    return { where: {}, empty: true };
  }

  return { where: { eventType: { in: allowed } }, empty: false };
}
