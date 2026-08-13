import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility, isTestProjectSquadRole } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { buildActivityPdf, type ActivityEventForPdf } from "@/lib/pdf/activity-pdf";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";
import { ActivityEventType } from "@prisma/client";
import { buildActivityLocationWhere } from "@/lib/activity-location-filter";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import { buildDefaultActivityEventVisibilityWhere } from "@/lib/activity-log-list-query";
import {
  buildActivityLocationOutcomeWhere,
  parseLocationOutcomeParam,
} from "@/lib/activity/activity-location-outcome-filter";
import { canViewLocationTracking } from "@/lib/permissions";
import { dedupeActivityLogsForExport } from "@/lib/activity/display-dedup";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const body = await req.json().catch(() => ({})) as {
    eventTypes?: string[];
    locationOutcomes?: string[];
    dateFrom?: string;
    dateTo?: string;
    projectName?: string;
    filterSummary?: string;
    unit?: string;
    building?: string;
    level?: string;
  };

  const {
    eventTypes = [],
    locationOutcomes = [],
    dateFrom,
    dateTo,
    projectName = "Project",
    filterSummary = "",
    unit,
    building,
    level,
  } = body;

  // Build a human-readable label for unit exports (e.g. "North · 0 · N0001")
  const unitLabel = unit
    ? [building, level, unit].filter(Boolean).join(" · ")
    : undefined;

  const canSeeSecurityActivity = isTestProjectSquadRole(session.user.role);
  const canViewLocation = canViewLocationTracking(
    session.user.role ?? "MEMBER",
    session.user.specialPermissions,
  );
  const HIDDEN_EVENTS = activityAlwaysExclude({ squadRole: canSeeSecurityActivity });

  // Validate and map event type strings to enum values, excluding hidden types.
  const validEventTypes = eventTypes
    .filter((t): t is ActivityEventType =>
      Object.values(ActivityEventType).includes(t as ActivityEventType) &&
      !HIDDEN_EVENTS.includes(t as ActivityEventType)
    );

  // Location filter — mirrors logic in the main activity GET route.
  const unitFilter = buildActivityLocationWhere({ building, level, unit });
  const locationOutcomeWhere = canViewLocation
    ? buildActivityLocationOutcomeWhere(parseLocationOutcomeParam(locationOutcomes.join(",")))
    : {};

  const events = await db.activityLog.findMany({
    where: {
      projectId,
      ...(validEventTypes.length > 0
        ? { eventType: { in: validEventTypes } }
        : buildDefaultActivityEventVisibilityWhere(HIDDEN_EVENTS)),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
      ...unitFilter,
      ...locationOutcomeWhere,
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  if (events.length === 0) {
    return NextResponse.json(
      { error: "No activity events match the current filters." },
      { status: 404 }
    );
  }

  const displayEvents = dedupeActivityLogsForExport(events);

  if (displayEvents.length === 0) {
    return NextResponse.json(
      { error: "No activity events match the current filters." },
      { status: 404 }
    );
  }

  try {
    const pdfBuffer = await buildActivityPdf({
      events: displayEvents as unknown as ActivityEventForPdf[],
      projectName,
      filterSummary,
      exportedAt: new Date(),
      unitLabel,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="activity-log-${projectId}-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    return pdfGenerationFailedNextResponse("[export-pdf/activity]", err);
  }
}
