import { db } from "@/lib/db";
import type { ActivityLog } from "@prisma/client";
import { computePortfolioDeltas } from "@/lib/reports/compute-portfolio-deltas";
import {
  buildPortfolioListItem,
  buildPortfolioProjectSnapshot,
  type PortfolioProgressDbRow,
} from "@/lib/reports/compute-portfolio-progress";
import type { ResolvedCompareWindow } from "@/lib/reports/portfolio-progress-query";
import type {
  PortfolioProgressDetailResponse,
  PortfolioProgressListResponse,
} from "@/lib/reports/portfolio-progress-types";
import { isTestProjectSquadRole } from "@/lib/production-project-access";
import { enrichProjectListResilient, enrichProjectById } from "@/lib/project-unifier-merge";

const PROGRESS_EVENT_TYPES = [
  "SCOPE_STATUS_UPDATED",
  "SUB_SCOPE_INSTANCE_UPDATED",
  "SCOPE_STATUS_BULK_UPDATED",
  "SCOPE_STATUS_BULK_UNDONE",
] as const;

const rowSelect = {
  id: true,
  building: true,
  level: true,
  unit: true,
  qty: true,
  scopeStage: true,
  scopeStatus: true,
  inspectionStatus: true,
  unifierSubId: true,
  scopeType: {
    select: {
      name: true,
      canonicalScopeType: { select: { displayName: true } },
    },
  },
  installer: { select: { name: true } },
  /** Fetch the first open issue tag — presence means the row has at least one open issue. */
  issueScopeTags: {
    where: { issue: { status: "OPEN" } },
    select: { id: true },
    take: 1,
  },
  subScopeInstances: {
    select: {
      id: true,
      qty: true,
      scopeStage: true,
      scopeStatus: true,
      inspectionStatus: true,
      subScope: { select: { name: true } },
      /** Fetch the first open issue tag for this sub-scope instance. */
      subScopeTags: {
        where: { issue: { status: "OPEN" } },
        select: { id: true },
        take: 1,
      },
    },
  },
} as const;

function mapRows(rows: Awaited<ReturnType<typeof fetchProjectRows>>): PortfolioProgressDbRow[] {
  return rows.map((row) => ({
    id: row.id,
    building: row.building,
    level: row.level,
    unit: row.unit,
    qty: row.qty !== null ? Number(row.qty) : null,
    scopeStage: row.scopeStage,
    scopeStatus: row.scopeStatus,
    inspectionStatus: row.inspectionStatus,
    hasOpenIssue: row.issueScopeTags.length > 0,
    unifierSubId: row.unifierSubId,
    scopeType: row.scopeType,
    installer: row.installer,
    subScopeInstances: row.subScopeInstances.map((inst) => ({
      id: inst.id,
      qty: inst.qty !== null ? Number(inst.qty) : null,
      scopeStage: inst.scopeStage,
      scopeStatus: inst.scopeStatus,
      inspectionStatus: inst.inspectionStatus,
      hasOpenIssue: inst.subScopeTags.length > 0,
      subScope: inst.subScope,
    })),
  }));
}

const rowSelectWithProjectId = {
  ...rowSelect,
  projectId: true,
} as const;

async function fetchProjectRows(projectId: string) {
  return db.projectRow.findMany({
    where: { projectId, scopeTypeId: { not: null } },
    select: rowSelect,
  });
}

async function fetchProjectRowsByProjectIds(projectIds: string[]): Promise<Map<string, PortfolioProgressDbRow[]>> {
  const byProject = new Map<string, PortfolioProgressDbRow[]>();
  if (projectIds.length === 0) return byProject;

  const rows = await db.projectRow.findMany({
    where: { projectId: { in: projectIds }, scopeTypeId: { not: null } },
    select: rowSelectWithProjectId,
  });

  const rawByProject = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const list = rawByProject.get(row.projectId) ?? [];
    list.push(row);
    rawByProject.set(row.projectId, list);
  }

  for (const id of projectIds) {
    byProject.set(id, mapRows(rawByProject.get(id) ?? []));
  }

  return byProject;
}

async function fetchActivityForProjects(
  projectIds: string[],
  fromDate: Date,
  toDate: Date,
  includeHistoryBeforeFrom: boolean,
): Promise<Map<string, ActivityLog[]>> {
  const byProject = new Map<string, ActivityLog[]>();
  if (projectIds.length === 0) return byProject;

  const where = includeHistoryBeforeFrom
    ? {
        projectId: { in: projectIds },
        eventType: { in: [...PROGRESS_EVENT_TYPES] },
        createdAt: { lte: toDate },
      }
    : {
        projectId: { in: projectIds },
        eventType: { in: [...PROGRESS_EVENT_TYPES] },
        createdAt: { gte: fromDate, lte: toDate },
      };

  const events = await db.activityLog.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  for (const event of events) {
    const list = byProject.get(event.projectId) ?? [];
    list.push(event);
    byProject.set(event.projectId, list);
  }

  return byProject;
}

export async function loadAccessibleProjects(role: string) {
  const squad = isTestProjectSquadRole(role);
  const rows = await db.project.findMany({
    where: squad ? {} : { isTestProject: false },
    orderBy: { createdAt: "asc" },
  });
  const { projects } = await enrichProjectListResilient(rows);
  return projects.sort((a, b) =>
    a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" }),
  );
}

export async function computePortfolioProgressList(
  role: string,
  window: ResolvedCompareWindow,
): Promise<PortfolioProgressListResponse> {
  const projects = await loadAccessibleProjects(role);
  const projectIds = projects.map((p) => p.id);

  const [rowsByProject, periodActivity] = await Promise.all([
    fetchProjectRowsByProjectIds(projectIds),
    fetchActivityForProjects(projectIds, window.fromDate, window.toDate, false),
  ]);

  const list = projects.map((project) => {
    const dbRows = rowsByProject.get(project.id) ?? [];
    const periodEvents = periodActivity.get(project.id) ?? [];
    const deltas = computePortfolioDeltas(dbRows, periodEvents, []);

    return buildPortfolioListItem(
      {
        id: project.id,
        name: project.projectName,
        unifierPid: project.unifierPid,
        projectManagerName: project.projectManagerName ?? "",
        installManagerName: project.installManagerName ?? null,
      },
      dbRows,
      deltas,
    );
  });

  return {
    comparePeriod: { preset: window.preset, from: window.from, to: window.to },
    projects: list,
  };
}

export async function computePortfolioProgressDetail(
  role: string,
  projectId: string,
  window: ResolvedCompareWindow,
): Promise<PortfolioProgressDetailResponse | null> {
  const squad = isTestProjectSquadRole(role);
  const enriched = await enrichProjectById(projectId);
  if (!enriched) return null;
  if (!squad && enriched.isTestProject) return null;

  const project = {
    id: enriched.id,
    name: enriched.projectName,
    unifierPid: enriched.unifierPid,
    projectManagerName: enriched.projectManagerName ?? "",
    installManagerName: enriched.installManagerName ?? null,
  };

  const dbRows = mapRows(await fetchProjectRows(projectId));
  const [periodEvents, historyEvents] = await Promise.all([
    db.activityLog.findMany({
      where: {
        projectId,
        eventType: { in: [...PROGRESS_EVENT_TYPES] },
        createdAt: { gte: window.fromDate, lte: window.toDate },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.activityLog.findMany({
      where: {
        projectId,
        eventType: { in: [...PROGRESS_EVENT_TYPES] },
        createdAt: { lte: window.toDate },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const deltas = computePortfolioDeltas(dbRows, periodEvents, historyEvents);
  const snapshot = buildPortfolioProjectSnapshot(
    project,
    dbRows,
    deltas,
    deltas.startedOnByCell,
    deltas.lastUpdatedOnByCell,
    deltas.completedOnByCell,
  );

  return {
    comparePeriod: { preset: window.preset, from: window.from, to: window.to },
    project: snapshot,
  };
}
