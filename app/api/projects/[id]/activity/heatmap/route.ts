import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { enforceProjectReadVisibility, isTestProjectSquadRole } from "@/lib/production-project-access";
import { LOCATION_OUTCOME_VALUES } from "@/lib/activity/activity-location-schema";
import {
  fetchActivityHeatmapData,
  fetchMissingLocationEvents,
} from "@/lib/activity/heatmap/fetch-activity-heatmap-data";
import { buildActivityEventDescription } from "@/lib/activity-event-summary";
import { canViewLocationTracking } from "@/lib/permissions";

const HeatmapQuerySchema = z.object({
  userIds: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});

const MissingQuerySchema = HeatmapQuerySchema.extend({
  outcome: z.enum(LOCATION_OUTCOME_VALUES).optional(),
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function parseUserIds(raw?: string): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const readBlock = await enforceProjectReadVisibility(projectId, session);
  if (readBlock) return readBlock;

  if (
    !canViewLocationTracking(session.user.role ?? "MEMBER", session.user.specialPermissions)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = HeatmapQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query params", issues: parsed.error.issues }, { status: 400 });
  }

  const squadRole = isTestProjectSquadRole(session.user.role ?? "MEMBER");
  const data = await fetchActivityHeatmapData({
    projectIds: [projectId],
    userIds: parseUserIds(parsed.data.userIds),
    dateFrom: parsed.data.dateFrom,
    dateTo: parsed.data.dateTo,
    squadRole,
  });

  return NextResponse.json(data);
}
