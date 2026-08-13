import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { hydrateActivityPage } from "@/lib/activity/hydrate-activity-page";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import {
  buildActivityCreatedAtWhere,
  resolveActivityEventTypeWhere,
} from "@/lib/activity-log-list-query";
import {
  buildActivityLocationOutcomeWhere,
  parseLocationOutcomeParam,
} from "@/lib/activity/activity-location-outcome-filter";
import { canViewLocationTracking } from "@/lib/permissions";

const QuerySchema = z.object({
  /** Comma-separated list of ActivityEventType values to filter by */
  eventType: z.string().optional(),
  /**
   * Comma-separated list of project IDs to scope results to. Each ID is
   * validated against the caller's accessible projects; IDs outside that
   * set are silently dropped (not an error). When empty/absent, all
   * accessible projects are returned.
   */
  projectIds: z.string().optional(),
  /**
   * Legacy single-project scope. Kept for backward compatibility with older
   * clients and deep-linked URLs. Ignored when `projectIds` is also present.
   */
  projectId: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  /** ISO timestamp cursor — return events older than this value (exclusive) */
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Comma-separated LocationOutcome values (on_map, denied, no_capture, etc.) */
  locationOutcome: z.string().optional(),
});

/** GET /api/activity — cross-project activity feed for the authenticated user */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Determine which projects are visible to this user (same logic as GET /api/projects).
  const squad = isTestProjectSquadRole(session.user.role ?? "MEMBER");
  const canViewLocation = canViewLocationTracking(
    session.user.role ?? "MEMBER",
    session.user.specialPermissions,
  );
  const accessibleProjects = await db.project.findMany({
    where: { deletedAt: null, ...(squad ? {} : { isTestProject: false }) },
    select: { id: true },
  });
  const allAccessibleIds = accessibleProjects.map((p) => p.id);

  if (allAccessibleIds.length === 0) {
    return NextResponse.json({ events: [], nextCursor: null, totalCount: 0 });
  }

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { projectIds, projectId, eventType, dateFrom, dateTo, cursor, limit, locationOutcome } = parsed.data;

  // Derive the requested project set. `projectIds` takes precedence over the
  // legacy single `projectId` param. Empty string or only whitespace is
  // treated as "no filter" (all accessible projects).
  const requestedIds = (() => {
    if (projectIds && projectIds.trim().length > 0) {
      return projectIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (projectId && projectId.trim().length > 0) {
      return [projectId.trim()];
    }
    return null;
  })();

  // Validate against accessible projects. Anything the user can't see is
  // silently dropped so we never leak existence of other tenants' projects.
  let scopedIds: string[];
  if (requestedIds === null) {
    scopedIds = allAccessibleIds;
  } else {
    const accessibleSet = new Set(allAccessibleIds);
    scopedIds = requestedIds.filter((id) => accessibleSet.has(id));
  }

  if (scopedIds.length === 0) {
    return NextResponse.json({ events: [], nextCursor: null, totalCount: 0 });
  }

  const alwaysExclude = activityAlwaysExclude({ squadRole: squad });

  const { where: eventTypeWhere, empty: noAllowedEventTypes } = resolveActivityEventTypeWhere({
    eventTypeParam: eventType,
    alwaysExclude,
  });
  if (noAllowedEventTypes) {
    return NextResponse.json({ events: [], nextCursor: null, totalCount: 0 });
  }

  const countCreatedAt = buildActivityCreatedAtWhere({ dateFrom, dateTo });
  const listCreatedAt = buildActivityCreatedAtWhere({ dateFrom, dateTo, cursor, includeCursor: true });

  const locationOutcomeWhere = canViewLocation
    ? buildActivityLocationOutcomeWhere(parseLocationOutcomeParam(locationOutcome))
    : {};

  const sharedWhere = {
    projectId: { in: scopedIds },
    ...eventTypeWhere,
    ...locationOutcomeWhere,
  };

  const [events, totalCount] = await Promise.all([
    db.activityLog.findMany({
      where: {
        ...sharedWhere,
        ...(listCreatedAt ? { createdAt: listCreatedAt } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    }),
    db.activityLog.count({
      where: {
        ...sharedWhere,
        ...(countCreatedAt ? { createdAt: countCreatedAt } : {}),
      },
    }),
  ]);

  const hasMore = events.length > limit;
  const page = hasMore ? events.slice(0, limit) : events;
  const hydratedPage = await hydrateActivityPage(page, {
    includeLocation: canViewLocation,
  });
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  return NextResponse.json({ events: hydratedPage, nextCursor, totalCount });
}
