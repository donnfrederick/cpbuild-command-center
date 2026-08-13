import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility, isTestProjectSquadRole } from "@/lib/production-project-access";
import { hydrateActivityPage } from "@/lib/activity/hydrate-activity-page";
import { buildActivityLocationWhere } from "@/lib/activity-location-filter";
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
  userId: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  /** ISO timestamp cursor — return events older than this value (exclusive) */
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Filter to a specific unit — matches metadata.unit and unitRef */
  unit: z.string().max(100).optional(),
  /** Optional building to narrow unit filter */
  building: z.string().max(100).optional(),
  /** Optional level to narrow unit filter */
  level: z.string().max(100).optional(),
  /** Comma-separated LocationOutcome values */
  locationOutcome: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { eventType, userId, dateFrom, dateTo, cursor, limit, unit, building, level, locationOutcome } = parsed.data;

  const canSeeSecurityActivity = isTestProjectSquadRole(session.user.role ?? "MEMBER");
  const canViewLocation = canViewLocationTracking(
    session.user.role ?? "MEMBER",
    session.user.specialPermissions,
  );

  const alwaysExclude = activityAlwaysExclude({ squadRole: canSeeSecurityActivity });

  const { where: eventTypeWhere, empty: noAllowedEventTypes } = resolveActivityEventTypeWhere({
    eventTypeParam: eventType,
    alwaysExclude,
  });
  if (noAllowedEventTypes) {
    return NextResponse.json({ events: [], nextCursor: null, totalCount: 0 });
  }

  const unitFilter = buildActivityLocationWhere({ building, level, unit });
  const locationOutcomeWhere = canViewLocation
    ? buildActivityLocationOutcomeWhere(parseLocationOutcomeParam(locationOutcome))
    : {};

  const countCreatedAt = buildActivityCreatedAtWhere({ dateFrom, dateTo });
  const listCreatedAt = buildActivityCreatedAtWhere({ dateFrom, dateTo, cursor, includeCursor: true });

  const sharedWhere = {
    projectId,
    ...eventTypeWhere,
    ...(userId ? { userId } : {}),
    ...unitFilter,
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

/** Fetch distinct users who have activity in a project — for the user filter dropdown */
export async function OPTIONS(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const rows = await db.activityLog.findMany({
    where: { projectId, userId: { not: null } },
    select: { userId: true, userName: true },
    distinct: ["userId"],
    orderBy: { createdAt: "desc" },
  });

  const users = rows
    .filter((r): r is { userId: string; userName: string | null } => r.userId !== null)
    .map((r) => ({ id: r.userId, name: r.userName ?? r.userId }));

  return NextResponse.json({ users });
}
