import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { ActivityEventType } from "@prisma/client";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { enrichProjectList } from "@/lib/project-unifier-merge";
import { buildActivityPdf, type ActivityEventForPdf } from "@/lib/pdf/activity-pdf";
import { pdfGenerationFailedNextResponse } from "@/lib/pdf/pdf-export-errors";
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
  /** ActivityEventType values to include. Empty / undefined → all non-hidden. */
  eventTypes: z.array(z.string()).optional(),
  locationOutcomes: z.array(z.string()).optional(),
  /**
   * Project IDs to scope the export to. Each ID is validated against the
   * caller's accessible projects; inaccessible IDs are silently dropped.
   * When absent/empty, all accessible projects are included.
   */
  projectIds: z.array(z.string()).optional(),
  // Mirror GET /api/activity validation so invalid / empty strings don't
  // reach `new Date(...)` and turn into Invalid Date (which Prisma would
  // reject with a 500). Accept only ISO 8601 with offset; treat undefined
  // as "no filter".
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  /** Human-readable summary of active filters, rendered on the PDF cover. */
  filterSummary: z.string().optional(),
  /**
   * Display label for the export scope ("All Projects", "3 Projects",
   * "Harbor Plaza"). Rendered in the cover title and footer.
   */
  scopeLabel: z.string().optional(),
});

/**
 * POST /api/activity/export-pdf
 *
 * Dashboard-level (cross-project) activity log PDF export. Mirrors the
 * per-project export route but scopes to every project the caller can see
 * (or the subset passed in `projectIds`). The rendered PDF adds a "Project"
 * column via `buildActivityPdf`'s `projectLabelById` option so readers can
 * tell which project each event came from.
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

  // Project names live in Unifier (`UNIFIER_US_XPRJ`), not directly on the
  // Project row. Enrich so the PDF can show "Harbor Plaza" instead of the CUID.
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

  const {
    eventTypes = [],
    locationOutcomes = [],
    projectIds,
    dateFrom,
    dateTo,
    filterSummary = "",
    scopeLabel = "All Projects",
  } = parsed.data;

  // Resolve the scoped project set. Silently drop inaccessible IDs.
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

  // Build the project-id → label map for rows that have a projectId. We
  // scope the map to projects that actually appear in the result set so the
  // PDF doesn't carry unused entries.
  const projectLabelById = new Map<string, string>();
  for (const e of displayEvents) {
    if (!projectLabelById.has(e.projectId)) {
      projectLabelById.set(e.projectId, accessibleMap.get(e.projectId) ?? e.projectId);
    }
  }

  try {
    const pdfBuffer = await buildActivityPdf({
      events: displayEvents as unknown as ActivityEventForPdf[],
      projectName: scopeLabel,
      filterSummary,
      exportedAt: new Date(),
      projectLabelById,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="activity-log-${Date.now()}.pdf"`,
      },
    });
  } catch (err) {
    return pdfGenerationFailedNextResponse("[export-pdf/dashboard-activity]", err);
  }
}
