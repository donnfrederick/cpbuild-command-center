import { ActivityEventType, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import { buildDefaultActivityEventVisibilityWhere } from "@/lib/activity-log-list-query";
import { hydrateInspectionActivityMetadata } from "@/lib/activity-inspection-metadata";
import { hydrateSubcontractorActivityMetadata } from "@/lib/activity-subcontractor-metadata";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import {
  buildProjectSnapshot,
  buildStatusRollup,
  buildSubcontractorRollup,
  parseActivityLogRows,
} from "@/lib/field-daily-report/build-project-snapshot";
import { dedupeInspectionEventsForFieldDaily } from "@/lib/field-daily-report/dedupe-inspection-events";
import { hydrateInspectionSubmissionDetails } from "@/lib/field-daily-report/hydrate-inspection-details";
import { hydrateListedItemDetails } from "@/lib/field-daily-report/hydrate-listed-item-details";
import { hydrateStatusUpdatePhotos } from "@/lib/field-daily-report/hydrate-status-update-photos";
import { enrichSnapshotTeamsOnSite } from "@/lib/field-daily-report/enrich-teams-on-site";
import { hydrateSnapshotLocations } from "@/lib/field-daily-report/hydrate-snapshot-locations";
import { enrichProgressWithProjectMetrics } from "@/lib/field-daily-report/project-progress";
import {
  FIELD_DAILY_INSPECTION_EVENT_TYPES,
  FIELD_DAILY_STATUS_EVENT_TYPES,
  FIELD_DAILY_SUBCONTRACTOR_EVENT_TYPES,
} from "@/lib/field-daily-report/event-sets";
import { dayBoundsInOrgTz } from "@/lib/field-daily-report/timezone";
import type { FieldDailyReportProjectSnapshot } from "@/lib/field-daily-report/types";

function hasStaleInspectionStatusGroups(snapshot: FieldDailyReportProjectSnapshot): boolean {
  return snapshot.statusUpdates.summaryGroups.some(
    (g) =>
      g.statusLabel?.startsWith("Inspection:") ||
      (g.headline?.includes("Inspection:") ?? false),
  );
}

function needsStatusGroupRebuild(snapshot: FieldDailyReportProjectSnapshot): boolean {
  if (snapshot.statusUpdates.summaryGroups.length === 0) return false;
  if (hasStaleInspectionStatusGroups(snapshot)) return true;
  return snapshot.statusUpdates.summaryGroups.some(
    (g) => !g.statusLabel?.trim() || !g.unitEntries?.length,
  );
}

async function loadActivityRowsForRebuild(options: {
  projectId: string;
  logIds: string[];
  reportDate?: string;
  activityThrough?: Date;
  sessionRole?: string;
  eventTypes: ActivityEventType[];
}) {
  const ids = new Set(options.logIds);
  const rows: {
    id: string;
    eventType: ActivityEventType;
    metadata: Prisma.JsonValue;
    createdAt: Date;
  }[] = [];

  if (ids.size > 0) {
    const fromIds = await db.activityLog.findMany({
      where: { id: { in: [...ids] }, projectId: options.projectId },
      select: { id: true, eventType: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    rows.push(...fromIds);
  }

  if (options.reportDate && options.activityThrough && options.sessionRole) {
    const { start } = dayBoundsInOrgTz(options.reportDate);
    const squad = isTestProjectSquadRole(options.sessionRole);
    const alwaysExclude = activityAlwaysExclude({ squadRole: squad });
    const dayRows = await db.activityLog.findMany({
      where: {
        projectId: options.projectId,
        eventType: { in: options.eventTypes },
        createdAt: { gte: start, lte: options.activityThrough },
        ...buildDefaultActivityEventVisibilityWhere(alwaysExclude),
      },
      select: { id: true, eventType: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    for (const row of dayRows) {
      if (!ids.has(row.id)) rows.push(row);
    }
  }

  if (rows.length === 0) return [];

  const subcontractorHydrated = await hydrateSubcontractorActivityMetadata(rows);
  const hydrated = await hydrateInspectionActivityMetadata(subcontractorHydrated);
  return parseActivityLogRows(hydrated);
}

async function rebuildStatusGroups(
  projectId: string,
  snapshot: FieldDailyReportProjectSnapshot,
  options?: {
    reportDate?: string;
    activityThrough?: Date;
    sessionRole?: string;
  },
): Promise<FieldDailyReportProjectSnapshot> {
  if (!needsStatusGroupRebuild(snapshot)) return snapshot;

  const logIds = new Set<string>();
  for (const ev of snapshot.statusUpdates.sourceEvents) {
    logIds.add(ev.activityLogId);
  }
  for (const group of snapshot.statusUpdates.summaryGroups) {
    for (const id of group.sourceActivityLogIds) logIds.add(id);
  }

  const statusEvents = (
    await loadActivityRowsForRebuild({
      projectId,
      logIds: [...logIds],
      reportDate: options?.reportDate,
      activityThrough: options?.activityThrough,
      sessionRole: options?.sessionRole,
      eventTypes: FIELD_DAILY_STATUS_EVENT_TYPES,
    })
  ).filter((e) => FIELD_DAILY_STATUS_EVENT_TYPES.includes(e.eventType));

  if (statusEvents.length === 0) {
    return {
      ...snapshot,
      statusUpdates: { summaryGroups: [], sourceEvents: [] },
    };
  }

  const statusUpdates = buildStatusRollup(statusEvents);
  return {
    ...snapshot,
    statusUpdates,
  };
}

async function backfillSubcontractors(
  projectId: string,
  snapshot: FieldDailyReportProjectSnapshot,
  options?: {
    reportDate?: string;
    activityThrough?: Date;
    sessionRole?: string;
  },
): Promise<FieldDailyReportProjectSnapshot> {
  if (!options?.reportDate || !options.activityThrough || !options.sessionRole) {
    return {
      ...snapshot,
      subcontractors: snapshot.subcontractors ?? { summaryGroups: [] },
    };
  }

  const subcontractorEvents = await loadActivityRowsForRebuild({
    projectId,
    logIds: [],
    reportDate: options.reportDate,
    activityThrough: options.activityThrough,
    sessionRole: options.sessionRole,
    eventTypes: FIELD_DAILY_SUBCONTRACTOR_EVENT_TYPES,
  });

  return {
    ...snapshot,
    subcontractors: buildSubcontractorRollup(subcontractorEvents),
  };
}

function inspectionActivityLogIds(snapshot: FieldDailyReportProjectSnapshot): string[] {
  const logIds = new Set<string>();
  for (const group of snapshot.inspections?.summaryGroups ?? []) {
    for (const item of group.items) {
      if (item.activityLogId) logIds.add(item.activityLogId);
    }
  }
  return [...logIds];
}

async function rebuildInspections(
  projectId: string,
  snapshot: FieldDailyReportProjectSnapshot,
  options?: NormalizeProjectSnapshotOptions,
): Promise<FieldDailyReportProjectSnapshot> {
  if (!options?.reportDate || !options.activityThrough || !options.sessionRole) {
    return {
      ...snapshot,
      inspections: snapshot.inspections ?? { summaryGroups: [] },
    };
  }

  const inspectionEvents = (
    await loadActivityRowsForRebuild({
      projectId,
      logIds: inspectionActivityLogIds(snapshot),
      reportDate: options.reportDate,
      activityThrough: options.activityThrough,
      sessionRole: options.sessionRole,
      eventTypes: FIELD_DAILY_INSPECTION_EVENT_TYPES,
    })
  ).filter((e) => FIELD_DAILY_INSPECTION_EVENT_TYPES.includes(e.eventType));

  if (inspectionEvents.length === 0) {
    return {
      ...snapshot,
      inspections: { summaryGroups: [] },
    };
  }

  const deduped = dedupeInspectionEventsForFieldDaily(inspectionEvents);
  const fresh = buildProjectSnapshot(deduped);
  return {
    ...snapshot,
    inspections: fresh.inspections,
  };
}

export interface NormalizeProjectSnapshotOptions {
  reportDate?: string;
  activityThrough?: Date;
  sessionRole?: string;
}

/** Hydrate locations, rebuild legacy sections, and attach live metrics + entity text. */
export async function normalizeProjectSnapshot(
  projectId: string,
  snapshot: FieldDailyReportProjectSnapshot,
  options?: NormalizeProjectSnapshotOptions,
): Promise<FieldDailyReportProjectSnapshot> {
  let normalized = await hydrateSnapshotLocations(snapshot);
  normalized = await rebuildStatusGroups(projectId, normalized, options);
  normalized = await backfillSubcontractors(projectId, normalized, options);
  normalized = await rebuildInspections(projectId, normalized, options);
  normalized = await enrichSnapshotTeamsOnSite(projectId, normalized);
  normalized = await hydrateListedItemDetails(normalized);
  normalized = await hydrateInspectionSubmissionDetails(normalized);
  if (options?.reportDate) {
    normalized = await hydrateStatusUpdatePhotos(projectId, normalized, {
      reportDate: options.reportDate,
      activityThrough: options.activityThrough,
    });
  }
  return {
    ...normalized,
    progress: await enrichProgressWithProjectMetrics(projectId, normalized.progress),
  };
}
