import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility, isTestProjectSquadRole } from "@/lib/production-project-access";
import { db } from "@/lib/db";
import { buildActivityXlsx } from "@/lib/export/activity-xlsx";
import type { ActivityEventForExport } from "@/lib/export/activity-export-format";
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

const BodySchema = z.object({
  eventTypes: z.array(z.string()).optional(),
  locationOutcomes: z.array(z.string()).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  unit: z.string().optional(),
  building: z.string().optional(),
  level: z.string().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  const rawBody = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    eventTypes = [],
    locationOutcomes = [],
    dateFrom,
    dateTo,
    unit,
    building,
    level,
  } = parsed.data;

  const canSeeSecurityActivity = isTestProjectSquadRole(session.user.role);
  const canViewLocation = canViewLocationTracking(
    session.user.role ?? "MEMBER",
    session.user.specialPermissions,
  );
  const HIDDEN_EVENTS = activityAlwaysExclude({ squadRole: canSeeSecurityActivity });

  const validEventTypes = eventTypes
    .filter((t): t is ActivityEventType =>
      Object.values(ActivityEventType).includes(t as ActivityEventType) &&
      !HIDDEN_EVENTS.includes(t as ActivityEventType)
    );

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
    const xlsxBuffer = buildActivityXlsx({
      events: displayEvents as unknown as ActivityEventForExport[],
    });

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="activity-log-${projectId}-${Date.now()}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("[export-xlsx/activity] Excel generation failed:", err);
    return NextResponse.json({ error: "Excel generation failed." }, { status: 500 });
  }
}
