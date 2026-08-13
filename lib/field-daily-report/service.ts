import { FieldDailyReportTrigger, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { activityAlwaysExclude } from "@/lib/activity-hidden-events";
import { buildDefaultActivityEventVisibilityWhere } from "@/lib/activity-log-list-query";
import { hydrateInspectionActivityMetadata } from "@/lib/activity-inspection-metadata";
import { hydrateSubcontractorActivityMetadata } from "@/lib/activity-subcontractor-metadata";
import {
  buildProjectSnapshot,
  parseActivityLogRows,
} from "@/lib/field-daily-report/build-project-snapshot";
import { enrichProgressWithProjectMetrics } from "@/lib/field-daily-report/project-progress";
import { normalizeProjectSnapshot } from "@/lib/field-daily-report/normalize-project-snapshot";
import { FIELD_DAILY_ALL_EVENT_TYPES } from "@/lib/field-daily-report/event-sets";
import {
  dayBoundsInOrgTz,
  parseReportDateParam,
  todayReportDateInOrgTz,
  clampReportDateToToday,
} from "@/lib/field-daily-report/timezone";
import { findFieldDailyReportProjectRow } from "@/lib/field-daily-report/report-project-row";
import {
  FIELD_DAILY_DAILY_MANPOWER_SET_BY_SELECT,
  toDailyManpowerMetaDto,
} from "@/lib/field-daily-report/daily-manpower-meta";
import { logFieldDailyDailyManpowerActivity } from "@/lib/field-daily-report/log-daily-manpower-activity";
import {
  listFieldDailySectionNotesForProjectRow,
  toSectionNoteDto,
} from "@/lib/field-daily-report/section-notes-service";
import type {
  FieldDailyReportCommentDto,
  FieldDailyReportDailyManpowerSavePayload,
  FieldDailyReportDto,
  FieldDailyReportProjectSnapshot,
  FieldDailyReportSectionKey,
  FieldDailyReportSectionNoteDto,
} from "@/lib/field-daily-report/types";
import { loadReportProjects, loadBackfillProjects } from "@/lib/field-daily-report/project-scope";
import { activityThroughForReportDate } from "@/lib/field-daily-report/activity-through";
import { acquireFieldDailyReportLock } from "@/lib/field-daily-report/report-lock";
import { emptyProjectSnapshot, snapshotHasFieldActivity } from "@/lib/field-daily-report/snapshot-activity";
import { isValidDailyManpower } from "@/lib/field-daily-report/workforce-manpower";
import { sectionNotesToLegacyComments } from "@/lib/field-daily-report/legacy-comments";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { enrichProjectListResilient } from "@/lib/project-unifier-merge";

const SECTION_KEYS: FieldDailyReportSectionKey[] = [
  "progress",
  "statusUpdates",
  "subcontractors",
  "teamsOnSite",
  "inspections",
  "issues",
  "observations",
  "other",
];

function parseSnapshot(json: unknown): FieldDailyReportProjectSnapshot {
  return json as FieldDailyReportProjectSnapshot;
}

function toCommentDto(
  row: { sectionKey: string; itemKey: string; body: string; updatedAt: Date },
): FieldDailyReportCommentDto {
  return {
    sectionKey: row.sectionKey as FieldDailyReportSectionKey,
    itemKey: row.itemKey,
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export { sectionNotesToLegacyComments } from "@/lib/field-daily-report/legacy-comments";

export function resolveReportDateParam(dateParam: string | null | undefined): string {
  const parsed = parseReportDateParam(dateParam);
  const date = parsed ?? todayReportDateInOrgTz();
  return clampReportDateToToday(date);
}

async function loadImProjects(installManagerUserId: string, sessionRole: string, reportDate: string) {
  return loadReportProjects(installManagerUserId, sessionRole, reportDate);
}

async function fetchProjectActivityForDay(options: {
  projectIds: string[];
  reportDate: string;
  activityThrough: Date;
  sessionRole: string;
}) {
  if (options.projectIds.length === 0) return new Map<string, ReturnType<typeof parseActivityLogRows>>();

  const { start } = dayBoundsInOrgTz(options.reportDate);
  const squad = isTestProjectSquadRole(options.sessionRole);
  const alwaysExclude = activityAlwaysExclude({ squadRole: squad });

  const logs = await db.activityLog.findMany({
    where: {
      projectId: { in: options.projectIds },
      eventType: { in: FIELD_DAILY_ALL_EVENT_TYPES },
      createdAt: { gte: start, lte: options.activityThrough },
      ...buildDefaultActivityEventVisibilityWhere(alwaysExclude),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, projectId: true, eventType: true, metadata: true, createdAt: true },
  });

  const hydrated = await hydrateSubcontractorActivityMetadata(
    await hydrateInspectionActivityMetadata(logs),
  );

  type RawActivityRow = {
    id: string;
    eventType: (typeof hydrated)[number]["eventType"];
    metadata: unknown;
    createdAt: Date;
  };

  const byProject = new Map<string, RawActivityRow[]>();
  for (const row of hydrated) {
    const list = byProject.get(row.projectId) ?? [];
    list.push({
      id: row.id,
      eventType: row.eventType,
      metadata: row.metadata,
      createdAt: row.createdAt,
    });
    byProject.set(row.projectId, list);
  }

  const parsed = new Map<string, ReturnType<typeof parseActivityLogRows>>();
  for (const [projectId, rows] of byProject) {
    parsed.set(projectId, parseActivityLogRows(rows));
  }
  return parsed;
}

export async function generateFieldDailyReport(options: {
  installManagerUserId: string;
  sessionRole: string;
  reportDate: string;
  trigger: FieldDailyReportTrigger;
  generatedByUserId: string | null;
  activityThrough?: Date;
  /** When set, only these projects are (re)generated — other project rows are left intact. */
  projectIds?: string[];
}): Promise<FieldDailyReportDto | null> {
  const activityThrough =
    options.activityThrough ?? activityThroughForReportDate(options.reportDate);
  const allProjects = await loadImProjects(
    options.installManagerUserId,
    options.sessionRole,
    options.reportDate,
  );
  const selectiveMode = options.projectIds != null;
  const backfillProjects = selectiveMode
    ? await loadBackfillProjects(options.installManagerUserId, options.sessionRole)
    : null;
  const allowedIds = new Set(
    (selectiveMode ? backfillProjects! : allProjects).map((p) => p.id),
  );
  const targetProjectIds = selectiveMode
    ? options.projectIds!.filter((id) => allowedIds.has(id))
    : allProjects.map((p) => p.id);

  const activityByProject = await fetchProjectActivityForDay({
    projectIds: targetProjectIds,
    reportDate: options.reportDate,
    activityThrough,
    sessionRole: options.sessionRole,
  });

  const projectsToWrite = selectiveMode
    ? targetProjectIds
    : targetProjectIds.filter((id) => (activityByProject.get(id)?.length ?? 0) > 0);

  const reportDateValue = new Date(`${options.reportDate}T00:00:00.000Z`);

  const existing = await db.fieldDailyReport.findUnique({
    where: {
      installManagerUserId_reportDate: {
        installManagerUserId: options.installManagerUserId,
        reportDate: reportDateValue,
      },
    },
    include: {
      projects: {
        include: {
          sectionNotes: {
            where: { deletedAt: null },
            include: {
              replies: { where: { deletedAt: null } },
            },
          },
        },
      },
    },
  });

  const notesByProjectId = new Map<
    string,
    Array<{
      sectionKey: string;
      itemKey: string;
      body: string;
      authorUserId: string;
      createdAt: Date;
      editedAt: Date | null;
      replies: Array<{
        body: string;
        authorUserId: string;
        createdAt: Date;
        editedAt: Date | null;
      }>;
    }>
  >();
  const dailyManpowerByProjectId = new Map<string, number | null>();
  const dailyManpowerMetaByProjectId = new Map<
    string,
    { setAt: Date | null; setByUserId: string | null }
  >();
  if (existing) {
    for (const pp of existing.projects) {
      dailyManpowerByProjectId.set(pp.projectId, pp.dailyManpower ?? null);
      dailyManpowerMetaByProjectId.set(pp.projectId, {
        setAt: pp.dailyManpowerSetAt ?? null,
        setByUserId: pp.dailyManpowerSetByUserId ?? null,
      });
      notesByProjectId.set(
        pp.projectId,
        pp.sectionNotes.map((note) => ({
          sectionKey: note.sectionKey,
          itemKey: note.itemKey,
          body: note.body,
          authorUserId: note.authorUserId,
          createdAt: note.createdAt,
          editedAt: note.editedAt,
          replies: note.replies.map((r) => ({
            body: r.body,
            authorUserId: r.authorUserId,
            createdAt: r.createdAt,
            editedAt: r.editedAt,
          })),
        })),
      );
    }
  }

  const preparedProjects: Array<{
    projectId: string;
    snapshot: FieldDailyReportProjectSnapshot;
  }> = [];

  for (const projectId of projectsToWrite) {
    const events = activityByProject.get(projectId) ?? [];
    const baseSnapshot =
      events.length > 0 ? buildProjectSnapshot(events) : emptyProjectSnapshot();
    const snapshot = {
      ...baseSnapshot,
      progress: await enrichProgressWithProjectMetrics(projectId, baseSnapshot.progress),
    };
    if (snapshotHasFieldActivity(snapshot)) {
      preparedProjects.push({ projectId, snapshot });
    }
  }

  if (
    !selectiveMode &&
    options.trigger === FieldDailyReportTrigger.SCHEDULED &&
    preparedProjects.length === 0
  ) {
    return fetchFieldDailyReport({
      installManagerUserId: options.installManagerUserId,
      sessionRole: options.sessionRole,
      reportDate: options.reportDate,
    });
  }

  const report = await db.$transaction(async (tx) => {
    await acquireFieldDailyReportLock(
      tx,
      options.installManagerUserId,
      options.reportDate,
    );

    const header = await tx.fieldDailyReport.upsert({
      where: {
        installManagerUserId_reportDate: {
          installManagerUserId: options.installManagerUserId,
          reportDate: reportDateValue,
        },
      },
      create: {
        installManagerUserId: options.installManagerUserId,
        reportDate: reportDateValue,
        generatedByUserId: options.generatedByUserId,
        trigger: options.trigger,
        activityThrough,
      },
      update: {
        generatedAt: new Date(),
        generatedByUserId: options.generatedByUserId,
        trigger: options.trigger,
        activityThrough,
      },
    });

    if (existing && !selectiveMode) {
      await tx.fieldDailyReportProject.deleteMany({
        where: { fieldDailyReportId: header.id },
      });
    }

    const nameById = new Map(allProjects.map((p) => [p.id, p.projectName] as const));
    const hadProjectRow = new Set(existing?.projects.map((p) => p.projectId) ?? []);

    for (const { projectId, snapshot } of preparedProjects) {
      const manpowerMeta = dailyManpowerMetaByProjectId.get(projectId);
      const projectRow = await tx.fieldDailyReportProject.upsert({
        where: {
          fieldDailyReportId_projectId: {
            fieldDailyReportId: header.id,
            projectId,
          },
        },
        create: {
          fieldDailyReportId: header.id,
          projectId,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          dailyManpower: dailyManpowerByProjectId.get(projectId) ?? null,
          dailyManpowerSetAt: manpowerMeta?.setAt ?? null,
          dailyManpowerSetByUserId: manpowerMeta?.setByUserId ?? null,
        },
        update: {
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });

      const priorNotes = notesByProjectId.get(projectId) ?? [];
      if (!selectiveMode || !hadProjectRow.has(projectId)) {
        for (const note of priorNotes) {
          const createdNote = await tx.fieldDailyReportSectionNote.create({
            data: {
              fieldDailyReportProjectId: projectRow.id,
              sectionKey: note.sectionKey,
              itemKey: note.itemKey ?? "",
              body: note.body,
              authorUserId: note.authorUserId,
              createdAt: note.createdAt,
              editedAt: note.editedAt,
              replies: {
                create: note.replies.map((reply) => ({
                  body: reply.body,
                  authorUserId: reply.authorUserId,
                  createdAt: reply.createdAt,
                  editedAt: reply.editedAt,
                })),
              },
            },
          });
          void createdNote;
        }
      }

      void nameById;
    }

    return header;
  });

  return fetchFieldDailyReport({
    installManagerUserId: options.installManagerUserId,
    sessionRole: options.sessionRole,
    reportDate: options.reportDate,
  }).then((dto) => dto ?? {
    id: report.id,
    reportDate: options.reportDate,
    generatedAt: report.generatedAt.toISOString(),
    trigger: report.trigger,
    activityThrough: report.activityThrough.toISOString(),
    projects: [],
  });
}

export async function fetchFieldDailyReport(options: {
  installManagerUserId: string;
  sessionRole: string;
  reportDate: string;
}): Promise<FieldDailyReportDto | null> {
  const reportDateValue = new Date(`${options.reportDate}T00:00:00.000Z`);
  const row = await db.fieldDailyReport.findUnique({
    where: {
      installManagerUserId_reportDate: {
        installManagerUserId: options.installManagerUserId,
        reportDate: reportDateValue,
      },
    },
    include: {
      projects: {
        include: {
          dailyManpowerSetBy: FIELD_DAILY_DAILY_MANPOWER_SET_BY_SELECT,
          sectionNotes: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            include: {
              author: { select: { id: true, name: true, email: true, role: { select: { code: true } } } },
              replies: {
                where: { deletedAt: null },
                orderBy: { createdAt: "desc" },
                include: {
                  author: { select: { id: true, name: true, email: true, role: { select: { code: true } } } },
                },
              },
            },
          },
        },
        orderBy: { projectId: "asc" },
      },
    },
  });

  if (!row) return null;

  const projectIds = row.projects.map((p) => p.projectId);
  const dbProjects = await db.project.findMany({ where: { id: { in: projectIds } } });
  const installManagerByProjectId = new Map(
    dbProjects.map((p) => [p.id, p.installManagerId] as const),
  );
  const { projects: enriched } = await enrichProjectListResilient(dbProjects);
  const nameById = new Map(enriched.map((p) => [p.id, p.projectName] as const));

  const projects = await Promise.all(
    row.projects.map(async (pp) => {
      const installManagerId = installManagerByProjectId.get(pp.projectId) ?? null;
      const sectionNotes = pp.sectionNotes.map((note) =>
        toSectionNoteDto(note, installManagerId),
      );
      return {
        projectId: pp.projectId,
        projectName: nameById.get(pp.projectId) ?? "Project",
        snapshot: await normalizeProjectSnapshot(pp.projectId, parseSnapshot(pp.snapshot), {
          reportDate: options.reportDate,
          activityThrough: row.activityThrough,
          sessionRole: options.sessionRole,
        }),
        sectionNotes,
        comments: sectionNotesToLegacyComments(sectionNotes),
        dailyManpower: pp.dailyManpower ?? null,
        dailyManpowerMeta: toDailyManpowerMetaDto(pp, installManagerId),
        generatedAt: row.generatedAt.toISOString(),
        activityThrough: row.activityThrough.toISOString(),
        trigger: row.trigger,
      };
    }),
  );

  return {
    id: row.id,
    reportDate: options.reportDate,
    generatedAt: row.generatedAt.toISOString(),
    trigger: row.trigger,
    activityThrough: row.activityThrough.toISOString(),
    projects,
  };
}

export async function fetchProjectFieldDailySlice(options: {
  installManagerUserId: string;
  sessionRole: string;
  projectId: string;
  reportDate: string;
}) {
  const report = await fetchFieldDailyReport({
    installManagerUserId: options.installManagerUserId,
    sessionRole: options.sessionRole,
    reportDate: options.reportDate,
  });
  if (!report) return null;
  return report.projects.find((p) => p.projectId === options.projectId) ?? null;
}

export async function upsertFieldDailyReportDailyManpower(options: {
  ownerUserIds: string[];
  projectId: string;
  reportDate: string;
  dailyManpower: number | null;
  setByUserId: string;
}): Promise<FieldDailyReportDailyManpowerSavePayload | null> {
  if (!isValidDailyManpower(options.dailyManpower)) return null;

  const projectRow = await findFieldDailyReportProjectRow({
    projectId: options.projectId,
    reportDate: options.reportDate,
    ownerUserIds: options.ownerUserIds,
  });
  if (!projectRow) return null;

  const previousDailyManpower = projectRow.dailyManpower ?? null;

  const project = await db.project.findUnique({
    where: { id: options.projectId },
    select: { installManagerId: true },
  });

  const now = new Date();
  const saved = await db.fieldDailyReportProject.update({
    where: { id: projectRow.id },
    data:
      options.dailyManpower === null
        ? {
            dailyManpower: null,
            dailyManpowerSetAt: null,
            dailyManpowerSetByUserId: null,
          }
        : {
            dailyManpower: options.dailyManpower,
            dailyManpowerSetAt: now,
            dailyManpowerSetByUserId: options.setByUserId,
          },
    select: {
      dailyManpower: true,
      dailyManpowerSetAt: true,
      dailyManpowerSetBy: FIELD_DAILY_DAILY_MANPOWER_SET_BY_SELECT,
    },
  });

  void logFieldDailyDailyManpowerActivity({
    projectId: options.projectId,
    setByUserId: options.setByUserId,
    reportDate: options.reportDate,
    dailyManpower: saved.dailyManpower ?? null,
    previousDailyManpower,
  });

  return {
    dailyManpower: saved.dailyManpower ?? null,
    dailyManpowerMeta: toDailyManpowerMetaDto(saved, project?.installManagerId ?? null),
  };
}

export { SECTION_KEYS };
export { findFieldDailyReportProjectRow } from "@/lib/field-daily-report/report-project-row";
