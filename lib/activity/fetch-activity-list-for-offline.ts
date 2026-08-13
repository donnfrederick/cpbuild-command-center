/**
 * First-page activity feed for offline snapshot bundles (no filters, default limit).
 */

import { db } from "@/lib/db";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import { hydrateActivityPage } from "@/lib/activity/hydrate-activity-page";
import { resolveActivityEventTypeWhere } from "@/lib/activity-log-list-query";
import { isTestProjectSquadRole } from "@/lib/production-project-access";

const DEFAULT_LIMIT = 50;

export interface OfflineActivityPagePayload {
  events: unknown[];
  nextCursor: string | null;
  totalCount: number;
}

export async function fetchActivityListForOffline(
  projectId: string,
  roleCode: string,
): Promise<OfflineActivityPagePayload> {
  const canSeeSecurityActivity = isTestProjectSquadRole(roleCode);

  const alwaysExclude = activityAlwaysExclude({ squadRole: canSeeSecurityActivity });

  const { where: eventTypeWhere, empty: noAllowedEventTypes } = resolveActivityEventTypeWhere({
    eventTypeParam: undefined,
    alwaysExclude,
  });

  if (noAllowedEventTypes) {
    return { events: [], nextCursor: null, totalCount: 0 };
  }

  const sharedWhere = {
    projectId,
    ...eventTypeWhere,
  };

  const [events, totalCount] = await Promise.all([
    db.activityLog.findMany({
      where: sharedWhere,
      orderBy: { createdAt: "desc" },
      take: DEFAULT_LIMIT + 1,
    }),
    db.activityLog.count({ where: sharedWhere }),
  ]);

  const hasMore = events.length > DEFAULT_LIMIT;
  const page = hasMore ? events.slice(0, DEFAULT_LIMIT) : events;
  const hydratedPage = await hydrateActivityPage(page);
  const nextCursor = hasMore ? page[page.length - 1]?.createdAt.toISOString() ?? null : null;

  return {
    events: hydratedPage,
    nextCursor,
    totalCount,
  };
}
