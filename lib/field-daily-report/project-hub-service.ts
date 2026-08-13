import type { FieldDailyReportTrigger, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import { buildDefaultActivityEventVisibilityWhere } from "@/lib/activity-log-list-query";
import { hydrateInspectionActivityMetadata } from "@/lib/activity-inspection-metadata";
import { hydrateSubcontractorActivityMetadata } from "@/lib/activity-subcontractor-metadata";
import {
  buildProjectSnapshot,
  parseActivityLogRows,
} from "@/lib/field-daily-report/build-project-snapshot";
import { FIELD_DAILY_ALL_EVENT_TYPES } from "@/lib/field-daily-report/event-sets";
import { enrichProgressWithProjectMetrics } from "@/lib/field-daily-report/project-progress";
import { normalizeProjectSnapshot } from "@/lib/field-daily-report/normalize-project-snapshot";
import {
  emptyProjectSnapshot,
  snapshotHasFieldActivity,
} from "@/lib/field-daily-report/snapshot-activity";
import {
  fieldDailySnapshotContentEqual,
  shouldBumpFieldDailyGeneratedAt,
} from "@/lib/field-daily-report/snapshot-compare";
import type { FieldDailyHistoryListEntry, FieldDailyHistoryPage } from "@/lib/field-daily-report/hub-history";
import { buildHubActivityPreviewCounts } from "@/lib/field-daily-report/hub-activity-preview";
import {
  dayBoundsInOrgTz,
  todayReportDateInOrgTz,
} from "@/lib/field-daily-report/timezone";
import type {
  FieldDailyReportProjectDto,
  FieldDailyReportProjectSnapshot,
} from "@/lib/field-daily-report/types";
import { FIELD_DAILY_SECTION_NOTES_INCLUDE } from "@/lib/field-daily-report/project-hub-section-notes-include";
import {
  FIELD_DAILY_DAILY_MANPOWER_SET_BY_SELECT,
  toDailyManpowerMetaDto,
} from "@/lib/field-daily-report/daily-manpower-meta";
import { toSectionNoteDto } from "@/lib/field-daily-report/section-notes-service";
import { sectionNotesToLegacyComments } from "@/lib/field-daily-report/legacy-comments";
import { activityThroughForReportDate } from "@/lib/field-daily-report/activity-through";
import { acquireFieldDailyReportLock } from "@/lib/field-daily-report/report-lock";
import { enrichProjectById } from "@/lib/project-unifier-merge";
import { isTestProjectSquadRole } from "@/lib/production-project-access";

export interface FieldDailyReportHistoryEntry {
  reportDate: string;
  generatedAt: string;
  hasActivity: boolean;
  slice: FieldDailyReportProjectDto | null;
}

export interface ProjectFieldDailyHubPayload {
  todayDate: string;
  /** Today's report row for this project, if the IM has generated or received a midnight refresh. */
  todayReport: {
    reportDate: string;
    generatedAt: string;
    activityThrough: string;
  } | null;
  recentWithActivity: { reportDate: string; slice: FieldDailyReportProjectDto } | null;
  /** Total saved daily reports for this project (canonical install manager). */
  historyCount: number;
}

function parseSnapshot(json: unknown): FieldDailyReportProjectSnapshot {
  return json as FieldDailyReportProjectSnapshot;
}

function formatReportDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function projectSliceFromRow(
  row: {
    projectId: string;
    snapshot: Prisma.JsonValue;
    dailyManpower: number | null;
    dailyManpowerSetAt: Date | null;
    dailyManpowerSetBy: Parameters<typeof toDailyManpowerMetaDto>[0]["dailyManpowerSetBy"];
    sectionNotes: Parameters<typeof toSectionNoteDto>[0][];
    fieldDailyReport: { reportDate: Date; activityThrough: Date; generatedAt: Date; trigger: FieldDailyReportTrigger };
  },
  projectName: string,
  sessionRole: string,
  installManagerId: string | null,
): Promise<FieldDailyReportProjectDto> {
  const reportDate = formatReportDate(row.fieldDailyReport.reportDate);
  const snapshot = await normalizeProjectSnapshot(row.projectId, parseSnapshot(row.snapshot), {
    reportDate,
    activityThrough: row.fieldDailyReport.activityThrough,
    sessionRole,
  });
  const sectionNotes = row.sectionNotes.map((note) => toSectionNoteDto(note, installManagerId));
  return {
    projectId: row.projectId,
    projectName,
    snapshot,
    sectionNotes,
    comments: sectionNotesToLegacyComments(sectionNotes),
    dailyManpower: row.dailyManpower ?? null,
    dailyManpowerMeta: toDailyManpowerMetaDto(row, installManagerId),
    generatedAt: row.fieldDailyReport.generatedAt.toISOString(),
    activityThrough: row.fieldDailyReport.activityThrough.toISOString(),
    trigger: row.fieldDailyReport.trigger,
  };
}

async function fetchProjectActivityForDay(
  projectId: string,
  reportDate: string,
  activityThrough: Date,
  sessionRole: string,
) {
  const { start } = dayBoundsInOrgTz(reportDate);
  const squad = isTestProjectSquadRole(sessionRole);
  const alwaysExclude = activityAlwaysExclude({ squadRole: squad });

  const logs = await db.activityLog.findMany({
    where: {
      projectId,
      eventType: { in: FIELD_DAILY_ALL_EVENT_TYPES },
      createdAt: { gte: start, lte: activityThrough },
      ...buildDefaultActivityEventVisibilityWhere(alwaysExclude),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, eventType: true, metadata: true, createdAt: true },
  });

  const hydrated = await hydrateSubcontractorActivityMetadata(
    await hydrateInspectionActivityMetadata(logs),
  );

  return parseActivityLogRows(
    hydrated.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      metadata: row.metadata,
      createdAt: row.createdAt,
    })),
  );
}

/** Hub card payload: latest report with activity + total history count for one project. */
export async function fetchProjectFieldDailyHub(options: {
  projectId: string;
  sessionRole: string;
  /** Canonical report owner — dedupes duplicate slices for the same calendar day. */
  reportOwnerUserId: string;
  /** How many recent days to scan when resolving the preview slice. */
  recentScanLimit?: number;
}): Promise<ProjectFieldDailyHubPayload | null> {
  const enriched = await enrichProjectById(options.projectId);
  if (!enriched) return null;
  const projectName = enriched.projectName;

  const historyCount = await db.fieldDailyReportProject.count({
    where: {
      projectId: options.projectId,
      fieldDailyReport: { installManagerUserId: options.reportOwnerUserId },
    },
  });

  const rows = await db.fieldDailyReportProject.findMany({
    where: {
      projectId: options.projectId,
      fieldDailyReport: { installManagerUserId: options.reportOwnerUserId },
    },
    include: {
      dailyManpowerSetBy: FIELD_DAILY_DAILY_MANPOWER_SET_BY_SELECT,
      sectionNotes: FIELD_DAILY_SECTION_NOTES_INCLUDE,
      fieldDailyReport: true,
    },
    orderBy: { fieldDailyReport: { reportDate: "desc" } },
    take: options.recentScanLimit ?? 30,
  });

  let recentWithActivity: { reportDate: string; slice: FieldDailyReportProjectDto } | null = null;
  for (const row of rows) {
      const slice = await projectSliceFromRow(
        row,
        projectName,
        options.sessionRole,
        enriched.installManagerId,
      );
    if (snapshotHasFieldActivity(slice.snapshot)) {
      recentWithActivity = {
        reportDate: formatReportDate(row.fieldDailyReport.reportDate),
        slice,
      };
      break;
    }
  }

  const todayDate = todayReportDateInOrgTz();
  const todayRow = rows.find((row) => formatReportDate(row.fieldDailyReport.reportDate) === todayDate);
  return {
    todayDate,
    todayReport: todayRow
      ? {
          reportDate: todayDate,
          generatedAt: todayRow.fieldDailyReport.generatedAt.toISOString(),
          activityThrough: todayRow.fieldDailyReport.activityThrough.toISOString(),
        }
      : null,
    recentWithActivity,
    historyCount,
  };
}

function historyEntryFromRow(
  row: {
    snapshot: Prisma.JsonValue;
    fieldDailyReport: { reportDate: Date; generatedAt: Date };
  },
): FieldDailyHistoryListEntry {
  const snapshot = parseSnapshot(row.snapshot);
  return {
    reportDate: formatReportDate(row.fieldDailyReport.reportDate),
    generatedAt: row.fieldDailyReport.generatedAt.toISOString(),
    hasActivity: snapshotHasFieldActivity(snapshot),
    activityPreview: buildHubActivityPreviewCounts(snapshot),
  };
}

/** Paginated report history for the project hub "All reports" list. */
export async function fetchProjectFieldDailyHistory(options: {
  projectId: string;
  reportOwnerUserId: string;
  fromDate: string;
  toDate: string;
  cursor?: string;
  limit: number;
}): Promise<FieldDailyHistoryPage> {
  const fromValue = new Date(`${options.fromDate}T00:00:00.000Z`);
  const toValue = new Date(`${options.toDate}T00:00:00.000Z`);
  const cursorValue = options.cursor ? new Date(`${options.cursor}T00:00:00.000Z`) : undefined;

  const rangeWhere = {
    projectId: options.projectId,
    fieldDailyReport: {
      installManagerUserId: options.reportOwnerUserId,
      reportDate: {
        gte: fromValue,
        lte: toValue,
      },
    },
  };

  const pageWhere = {
    ...rangeWhere,
    fieldDailyReport: {
      ...rangeWhere.fieldDailyReport,
      reportDate: {
        ...rangeWhere.fieldDailyReport.reportDate,
        ...(cursorValue ? { lt: cursorValue } : {}),
      },
    },
  };

  const [totalInRange, rows] = await Promise.all([
    db.fieldDailyReportProject.count({ where: rangeWhere }),
    db.fieldDailyReportProject.findMany({
      where: pageWhere,
      select: {
        snapshot: true,
        fieldDailyReport: { select: { reportDate: true, generatedAt: true } },
      },
      orderBy: { fieldDailyReport: { reportDate: "desc" } },
      take: options.limit + 1,
    }),
  ]);

  const hasMore = rows.length > options.limit;
  const pageRows = hasMore ? rows.slice(0, options.limit) : rows;
  const entries = pageRows.map(historyEntryFromRow);
  const nextCursor = hasMore ? entries[entries.length - 1]?.reportDate ?? null : null;

  return { entries, nextCursor, totalInRange };
}

/** Load one project's slice (including saved section notes) for a calendar day. */
export async function fetchProjectFieldDailySliceByDate(options: {
  projectId: string;
  reportDate: string;
  reportOwnerUserId: string;
  sessionRole: string;
}): Promise<FieldDailyReportProjectDto | null> {
  const enriched = await enrichProjectById(options.projectId);
  if (!enriched) return null;

  const reportDateValue = new Date(`${options.reportDate}T00:00:00.000Z`);
  const row = await db.fieldDailyReportProject.findFirst({
    where: {
      projectId: options.projectId,
      fieldDailyReport: {
        reportDate: reportDateValue,
        installManagerUserId: options.reportOwnerUserId,
      },
    },
    include: {
      dailyManpowerSetBy: FIELD_DAILY_DAILY_MANPOWER_SET_BY_SELECT,
      sectionNotes: FIELD_DAILY_SECTION_NOTES_INCLUDE,
      fieldDailyReport: true,
    },
  });
  if (!row) return null;

  return projectSliceFromRow(row, enriched.projectName, options.sessionRole, enriched.installManagerId);
}

/** Generate or refresh one project's slice for a calendar day (does not wipe other projects). */
export async function generateProjectFieldDailySlice(options: {
  reportOwnerUserId: string;
  sessionRole: string;
  projectId: string;
  reportDate: string;
  trigger: FieldDailyReportTrigger;
  generatedByUserId: string | null;
  activityThrough?: Date;
  /** When true, always stamp a new generatedAt (e.g. Update today's report). */
  bumpGeneratedAt?: boolean;
}): Promise<{ slice: FieldDailyReportProjectDto; contentChanged: boolean; hadExisting: boolean } | null> {
  const activityThrough =
    options.activityThrough ?? activityThroughForReportDate(options.reportDate);
  const enriched = await enrichProjectById(options.projectId);
  if (!enriched) return null;

  const events = await fetchProjectActivityForDay(
    options.projectId,
    options.reportDate,
    activityThrough,
    options.sessionRole,
  );

  const baseSnapshot =
    events.length > 0 ? buildProjectSnapshot(events) : emptyProjectSnapshot();
  const snapshot = {
    ...baseSnapshot,
    progress: await enrichProgressWithProjectMetrics(options.projectId, baseSnapshot.progress),
  };

  const reportDateValue = new Date(`${options.reportDate}T00:00:00.000Z`);

  const existingRow = await db.fieldDailyReportProject.findFirst({
    where: {
      projectId: options.projectId,
      fieldDailyReport: {
        installManagerUserId: options.reportOwnerUserId,
        reportDate: reportDateValue,
      },
    },
    include: {
      dailyManpowerSetBy: FIELD_DAILY_DAILY_MANPOWER_SET_BY_SELECT,
      sectionNotes: FIELD_DAILY_SECTION_NOTES_INCLUDE,
      fieldDailyReport: true,
    },
  });

  const existingSnapshot = existingRow
    ? parseSnapshot(existingRow.snapshot)
    : null;
  const contentChanged =
    !existingSnapshot || !fieldDailySnapshotContentEqual(existingSnapshot, snapshot);
  const bumpGeneratedAt = shouldBumpFieldDailyGeneratedAt({
    hasExistingReport: Boolean(existingRow),
    contentChanged,
    bumpGeneratedAt: options.bumpGeneratedAt ?? false,
  });

  const projectRow = await db.$transaction(async (tx) => {
    await acquireFieldDailyReportLock(
      tx,
      options.reportOwnerUserId,
      options.reportDate,
    );

    const header = await tx.fieldDailyReport.upsert({
      where: {
        installManagerUserId_reportDate: {
          installManagerUserId: options.reportOwnerUserId,
          reportDate: reportDateValue,
        },
      },
      create: {
        installManagerUserId: options.reportOwnerUserId,
        reportDate: reportDateValue,
        generatedByUserId: options.generatedByUserId,
        trigger: options.trigger,
        activityThrough,
      },
      update: {
        ...(bumpGeneratedAt ? { generatedAt: new Date() } : {}),
        generatedByUserId: options.generatedByUserId,
        trigger: options.trigger,
        activityThrough,
      },
    });

    return tx.fieldDailyReportProject.upsert({
      where: {
        fieldDailyReportId_projectId: {
          fieldDailyReportId: header.id,
          projectId: options.projectId,
        },
      },
      create: {
        fieldDailyReportId: header.id,
        projectId: options.projectId,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
      update: {
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
      include: {
        sectionNotes: FIELD_DAILY_SECTION_NOTES_INCLUDE,
        fieldDailyReport: true,
        dailyManpowerSetBy: FIELD_DAILY_DAILY_MANPOWER_SET_BY_SELECT,
      },
    });
  });

  const slice = await projectSliceFromRow(
    projectRow,
    enriched.projectName,
    options.sessionRole,
    enriched.installManagerId,
  );
  return { slice, contentChanged, hadExisting: Boolean(existingRow) };
}
