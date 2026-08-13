import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { fetchActivityHeatmapData } from "@/lib/activity/heatmap/fetch-activity-heatmap-data";
import { canViewLocationTracking } from "@/lib/permissions";

const HeatmapQuerySchema = z.object({
  projectIds: z.string().optional(),
  projectId: z.string().optional(),
  userIds: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});

function parseUserIds(raw?: string): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

function resolveProjectIds(
  projectIds: string | undefined,
  projectId: string | undefined,
  accessibleIds: string[],
): string[] {
  const requested = (() => {
    if (projectIds?.trim()) {
      return projectIds.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (projectId?.trim()) return [projectId.trim()];
    return null;
  })();

  const accessible = new Set(accessibleIds);
  if (!requested) return accessibleIds;
  return requested.filter((id) => accessible.has(id));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !canViewLocationTracking(session.user.role ?? "MEMBER", session.user.specialPermissions)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const squad = isTestProjectSquadRole(session.user.role ?? "MEMBER");
  const accessibleProjects = await db.project.findMany({
    where: { deletedAt: null, ...(squad ? {} : { isTestProject: false }) },
    select: { id: true },
  });
  const allAccessibleIds = accessibleProjects.map((p) => p.id);
  if (allAccessibleIds.length === 0) {
    return NextResponse.json({
      actors: [],
      clusters: [],
      points: [],
      coverage: {
        totalActivities: 0,
        onMapCount: 0,
        coveragePercent: 0,
        byOutcome: {},
        byUser: [],
      },
    });
  }

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = HeatmapQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query params", issues: parsed.error.issues }, { status: 400 });
  }

  const projectIds = resolveProjectIds(
    parsed.data.projectIds,
    parsed.data.projectId,
    allAccessibleIds,
  );
  if (projectIds.length === 0) {
    return NextResponse.json({ error: "No accessible projects in scope" }, { status: 403 });
  }

  const data = await fetchActivityHeatmapData({
    projectIds,
    userIds: parseUserIds(parsed.data.userIds),
    dateFrom: parsed.data.dateFrom,
    dateTo: parsed.data.dateTo,
    squadRole: squad,
  });

  return NextResponse.json(data);
}
