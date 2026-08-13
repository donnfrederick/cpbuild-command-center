import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { ActivityEventType } from "@prisma/client";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { enrichProjectList } from "@/lib/project-unifier-merge";
import { buildActivityXlsx } from "@/lib/export/activity-xlsx";
import type { ActivityEventForPdf } from "@/lib/export/activity-export-format";
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
  projectIds: z.array(z.string()).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});

/**
 * POST /api/activity/export-xlsx
 *
 * Dashboard-level (cross-project) activity log Excel export. Mirrors
 * POST /api/activity/export-pdf with the same filters and auth rules.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const squad = isTestProjectSquadRole(session.user.role ?? "MEMBER");
  const canViewLocation = canViewLocationTracking(
    session.user.role ?? "MEMBER",
    session.user.specialPermissions,
  );
  const accessibleRows = await db.project.findMany({
    where: { deletedAt: null, ...(squad ? {} : { isTestProject: false }) },
  });

  if (accessibleRows.length === 0) {
    return NextResponse.json(
      { error: "No activity events match the current filters." },
      { status: 404 }
    );
  }

  const enriched = await enrichProjectList(accessibleRows);
  const accessibleProjects = enriched.map((p) => ({ id: p.id, name: p.projectName }));

  const rawBody = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { eventTypes = [], locationOutcomes = [], projectIds, dateFrom, dateTo } = parsed.data;

  const accessibleMap = new Map(accessibleProjects.map((p) => [p.id, p.name ?? p.id]));
  const scopedIds = (() => {
    if (projectIds && projectIds.length > 0) {
      return projectIds.filter((id) => accessibleMap.has(id));
    }
    return Array.from(accessibleMap.keys());
  })();

  if (scopedIds.length === 0) {
    return NextResponse.json(
      { error: "No activity events match the current filters." },
      { status: 404 }
    );
  }

  const HIDDEN_EVENTS = activityAlwaysExclude({ squadRole: squad });

  const validEventTypes = eventTypes
    .filter((t): t is ActivityEventType =>
      Object.values(ActivityEventType).includes(t as ActivityEventType) &&
      !HIDDEN_EVENTS.includes(t as ActivityEventType)
    );

  const locationOutcomeWhere = canViewLocation
    ? buildActivityLocationOutcomeWhere(parseLocationOutcomeParam(locationOutcomes.join(",")))
    : {};

  const events = await db.activityLog.findMany({
    where: {
      projectId: { in: scopedIds },
      ...(validEventTypes.length > 0
        ? { eventType: { in: validEventTypes } }
        : buildDefaultActivityEventVisibilityWhere(HIDDEN_EVENTS)),
      ...locationOutcomeWhere,
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
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

  const projectLabelById = new Map<string, string>();
  for (const e of displayEvents) {
    if (!projectLabelById.has(e.projectId)) {
      projectLabelById.set(e.projectId, accessibleMap.get(e.projectId) ?? e.projectId);
    }
  }

  try {
    const xlsxBuffer = buildActivityXlsx({
      events: displayEvents as unknown as ActivityEventForPdf[],
      projectLabelById,
    });

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="activity-log-${Date.now()}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("[export-xlsx/activity] Excel generation failed:", err);
    return NextResponse.json({ error: "Excel generation failed." }, { status: 500 });
  }
}
