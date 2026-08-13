import type { ActivityEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import { buildActivityCreatedAtWhere, buildDefaultActivityEventVisibilityWhere } from "@/lib/activity-log-list-query";
import {
  buildMediaLookupMaps,
  readRowIdFromEvent,
  resolveActivityLocationForEvent,
  type ActivityRowForLocation,
} from "@/lib/activity/activity-location-resolver";
import { collapseHeatmapEvents, type HeatmapActivityEvent } from "@/lib/activity/heatmap/collapse-heatmap-events";
import { buildLocationCoverageReport } from "@/lib/activity/heatmap/build-location-coverage-report";
import {
  clusterMapPoints,
  computeMapBounds,
  type HeatmapCluster,
  type HeatmapPoint,
} from "@/lib/activity/heatmap/cluster-map-points";
import type { LocationOutcome } from "@/lib/activity/activity-location-schema";
import { resolveProjectSiteGeocode } from "@/lib/geo/project-site-geocode";

const ACTOR_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#be185d",
  "#854d0e",
];

export interface FetchHeatmapOptions {
  projectIds: string[];
  userIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  squadRole: boolean;
}

export interface ActivityHeatmapResponse {
  actors: Array<{ id: string; name: string; color: string }>;
  /** All on-map GPS points — map layer re-clusters by zoom on the client. */
  mapPoints: HeatmapPoint[];
  /** @deprecated Server-side 50m clusters — kept for API compat; map uses mapPoints. */
  clusters: HeatmapCluster[];
  /** @deprecated Server-side singletons — kept for API compat; map uses mapPoints. */
  points: HeatmapPoint[];
  coverage: ReturnType<typeof buildLocationCoverageReport>;
  mapBounds?: { south: number; west: number; north: number; east: number };
  projectSite?: { lat: number; lng: number; label: string };
}

async function loadHeatmapEvents(options: FetchHeatmapOptions): Promise<HeatmapActivityEvent[]> {
  const alwaysExclude = activityAlwaysExclude({ squadRole: options.squadRole });
  const createdAt = buildActivityCreatedAtWhere({
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
  });

  const rows = await db.activityLog.findMany({
    where: {
      projectId: { in: options.projectIds },
      ...(options.userIds && options.userIds.length > 0
        ? { userId: { in: options.userIds } }
        : {}),
      ...buildDefaultActivityEventVisibilityWhere(alwaysExclude),
      ...(createdAt ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: {
      id: true,
      projectId: true,
      userId: true,
      userName: true,
      eventType: true,
      metadata: true,
      createdAt: true,
    },
  });

  if (rows.length === 0) return [];

  const storedRows = await db.activityLocationContext.findMany({
    where: { activityLogId: { in: rows.map((r) => r.id) } },
    select: {
      activityLogId: true,
      gpsStatus: true,
      latitude: true,
      longitude: true,
      distanceFromProjectMeters: true,
      source: true,
    },
  });
  const storedByLogId = new Map(storedRows.map((r) => [r.activityLogId, r]));

  const mediaLookup = await buildMediaLookupMaps(rows);

  const resolved: HeatmapActivityEvent[] = [];
  for (const row of rows) {
    const location = await resolveActivityLocationForEvent(
      row,
      storedByLogId.get(row.id) ?? null,
      mediaLookup,
    );
    resolved.push({
      activityLogId: row.id,
      userId: row.userId,
      userName: row.userName,
      projectId: row.projectId,
      eventType: row.eventType,
      createdAt: row.createdAt,
      rowId: readRowIdFromEvent(row),
      location,
    });
  }

  return collapseHeatmapEvents(resolved);
}

export async function fetchActivityHeatmapData(
  options: FetchHeatmapOptions,
): Promise<ActivityHeatmapResponse> {
  const collapsed = await loadHeatmapEvents(options);
  const coverage = buildLocationCoverageReport(collapsed);

  const onMapEvents = collapsed.filter(
    (e) => e.location.outcome === "on_map" && e.location.latitude != null && e.location.longitude != null,
  );

  const mapPoints: HeatmapPoint[] = onMapEvents.map((e) => ({
    activityLogId: e.activityLogId,
    lat: e.location.latitude!,
    lng: e.location.longitude!,
    userId: e.userId,
    projectId: e.projectId,
  }));

  const { clusters, points } = clusterMapPoints(mapPoints);

  const actorIds = new Set<string>();
  for (const e of collapsed) {
    if (e.userId) actorIds.add(e.userId);
  }
  const actors = [...actorIds].map((id, index) => {
    const name = collapsed.find((e) => e.userId === id)?.userName ?? id;
    return {
      id,
      name,
      color: ACTOR_COLORS[index % ACTOR_COLORS.length]!,
    };
  });

  const mapBounds = computeMapBounds(mapPoints.map((p) => ({ lat: p.lat, lng: p.lng })));

  let projectSite: ActivityHeatmapResponse["projectSite"];
  if (options.projectIds.length === 1) {
    const geocode = await resolveProjectSiteGeocode(options.projectIds[0]!);
    if (geocode.available && geocode.latitude != null && geocode.longitude != null) {
      projectSite = {
        lat: geocode.latitude,
        lng: geocode.longitude,
        label: geocode.siteLocation,
      };
    }
  }

  return {
    actors,
    mapPoints,
    clusters,
    points,
    coverage,
    mapBounds,
    projectSite,
  };
}

export interface MissingLocationEventRow {
  activityLogId: string;
  userId: string | null;
  userName: string | null;
  eventType: ActivityEventType;
  createdAt: string;
  locationOutcome: LocationOutcome;
  summary: string;
  projectId?: string;
  projectName?: string;
  distanceFromProjectMeters?: number | null;
}

export async function fetchMissingLocationEvents(
  options: FetchHeatmapOptions & {
    outcome?: LocationOutcome;
    cursor?: string;
    limit?: number;
    projectNames?: Map<string, string>;
    buildSummary: (event: ActivityRowForLocation) => string;
  },
): Promise<{ events: MissingLocationEventRow[]; nextCursor: string | null; totalCount: number }> {
  return fetchHeatmapOutcomeEvents(options);
}

/** Paginated events for a heatmap coverage outcome (including on_map). */
export async function fetchHeatmapOutcomeEvents(
  options: FetchHeatmapOptions & {
    outcome?: LocationOutcome;
    cursor?: string;
    limit?: number;
    projectNames?: Map<string, string>;
    buildSummary: (event: ActivityRowForLocation) => string;
  },
): Promise<{ events: MissingLocationEventRow[]; nextCursor: string | null; totalCount: number }> {
  const limit = options.limit ?? 50;
  const collapsed = await loadHeatmapEvents(options);

  let filtered = collapsed;
  if (options.outcome) {
    filtered = collapsed.filter((e) => e.location.outcome === options.outcome);
  } else {
    filtered = collapsed.filter((e) => e.location.outcome !== "on_map");
  }

  const totalCount = filtered.length;

  let startIndex = 0;
  if (options.cursor) {
    const cursorTime = Date.parse(options.cursor);
    startIndex = filtered.findIndex((e) => e.createdAt.getTime() < cursorTime);
    if (startIndex === -1) startIndex = filtered.length;
  }

  const page = filtered.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < filtered.length;
  const nextCursor = hasMore ? page[page.length - 1]?.createdAt.toISOString() ?? null : null;

  const rawRows = await db.activityLog.findMany({
    where: { id: { in: page.map((p) => p.activityLogId) } },
    select: {
      id: true,
      projectId: true,
      eventType: true,
      metadata: true,
      createdAt: true,
    },
  });
  const rawById = new Map(rawRows.map((r) => [r.id, r]));

  const events: MissingLocationEventRow[] = page.map((e) => {
    const raw = rawById.get(e.activityLogId);
    return {
      activityLogId: e.activityLogId,
      userId: e.userId,
      userName: e.userName,
      eventType: e.eventType,
      createdAt: e.createdAt.toISOString(),
      locationOutcome: e.location.outcome,
      summary: raw
        ? options.buildSummary(raw)
        : e.eventType,
      projectId: e.projectId,
      projectName: options.projectNames?.get(e.projectId),
      distanceFromProjectMeters: e.location.distanceFromProjectMeters ?? null,
    };
  });

  return { events, nextCursor, totalCount };
}
