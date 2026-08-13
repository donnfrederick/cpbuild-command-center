/**
 * Shared serialization for project unit rows — used by GET /api/projects/:id/units
 * and the offline snapshot bundle so cached rows match live API shape.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  applyGridInspectionToSerializedRow,
  loadGridInspectionMapForScopeRowIds,
} from "@/lib/inspections/load-grid-inspection-map";

export const PROJECT_ROW_INCLUDE = {
  scopeType: {
    include: {
      canonicalScopeType: {
        select: { id: true, code: true, displayName: true },
      },
    },
  },
  locationType: true,
  costType: true,
  installer: true,
  uom: true,
  subScopeInstances: {
    include: {
      subScope: {
        select: {
          id: true,
          name: true,
          displayOrder: true,
          unitType: true,
          scopeTypeId: true,
        },
      },
    },
    orderBy: { subScope: { displayOrder: "asc" } },
  },
  clearInspections: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true, status: true, createdAt: true },
  },
} satisfies Prisma.ProjectRowInclude;

export type ProjectRowWithRelations = Prisma.ProjectRowGetPayload<{
  include: typeof PROJECT_ROW_INCLUDE;
}>;

export type UnitIssueMeta = {
  hasIssues: boolean;
  hasOpenIssues: boolean;
  hasBlockingIssues: boolean;
  issueTypes: string[];
  responsibleParties: string[];
  statuses: string[];
  scopeRowIdsWithIssues: string[];
  scopeRowIdsWithBlockingIssues: string[];
  subScopeInstanceIdsWithIssues: string[];
  subScopeInstanceIdsWithBlockingIssues: string[];
};

export const EMPTY_ISSUE_META: UnitIssueMeta = {
  hasIssues: false,
  hasOpenIssues: false,
  hasBlockingIssues: false,
  issueTypes: [],
  responsibleParties: [],
  statuses: [],
  scopeRowIdsWithIssues: [],
  scopeRowIdsWithBlockingIssues: [],
  subScopeInstanceIdsWithIssues: [],
  subScopeInstanceIdsWithBlockingIssues: [],
};

export type ProjectIssueForMeta = {
  unitRef: string | null;
  issueTypeCode: string;
  responsiblePartyCode: string;
  responsiblePartyTags?: { partyCode: string }[];
  isBlockingWork: boolean;
  status: string;
  scopeTags: { projectRowId: string }[];
  subScopeTags: { subScopeInstanceId: string }[];
};

const PROJECT_ISSUE_SELECT = {
  id: true,
  unitRef: true,
  issueTypeCode: true,
  responsiblePartyCode: true,
  responsiblePartyTags: { select: { partyCode: true }, orderBy: { id: "asc" as const } },
  isBlockingWork: true,
  status: true,
  scopeTags: { select: { projectRowId: true } },
  subScopeTags: { select: { subScopeInstanceId: true } },
} satisfies Prisma.ProjectIssueSelect;

export function createIssueMetaBuilder(
  projectIssues: ProjectIssueForMeta[],
): (ref: string) => UnitIssueMeta {
  const issueMetaByUnit = new Map<
    string,
    {
      issueTypes: Set<string>;
      responsibleParties: Set<string>;
      statuses: Set<string>;
      scopeRowIds: Set<string>;
      blockingScopeRowIds: Set<string>;
      subScopeInstanceIds: Set<string>;
      blockingSubScopeInstanceIds: Set<string>;
      hasOpenIssues: boolean;
      hasBlockingIssues: boolean;
    }
  >();

  for (const issue of projectIssues) {
    const ref = issue.unitRef ?? "";
    if (!ref) continue;
    if (!issueMetaByUnit.has(ref)) {
      issueMetaByUnit.set(ref, {
        issueTypes: new Set(),
        responsibleParties: new Set(),
        statuses: new Set(),
        scopeRowIds: new Set(),
        blockingScopeRowIds: new Set(),
        subScopeInstanceIds: new Set(),
        blockingSubScopeInstanceIds: new Set(),
        hasOpenIssues: false,
        hasBlockingIssues: false,
      });
    }
    const meta = issueMetaByUnit.get(ref)!;
    meta.issueTypes.add(issue.issueTypeCode);
    const parties =
      issue.responsiblePartyTags && issue.responsiblePartyTags.length > 0
        ? issue.responsiblePartyTags.map((t) => t.partyCode)
        : [issue.responsiblePartyCode];
    for (const party of parties) {
      meta.responsibleParties.add(party);
    }
    meta.statuses.add(issue.status);
    if (issue.status === "OPEN") {
      meta.hasOpenIssues = true;
      if (issue.isBlockingWork) meta.hasBlockingIssues = true;
      for (const tag of issue.scopeTags) {
        meta.scopeRowIds.add(tag.projectRowId);
        if (issue.isBlockingWork) meta.blockingScopeRowIds.add(tag.projectRowId);
      }
      for (const tag of issue.subScopeTags) {
        meta.subScopeInstanceIds.add(tag.subScopeInstanceId);
        if (issue.isBlockingWork) meta.blockingSubScopeInstanceIds.add(tag.subScopeInstanceId);
      }
    }
  }

  return (ref: string): UnitIssueMeta => {
    const m = issueMetaByUnit.get(ref);
    if (!m) return EMPTY_ISSUE_META;
    return {
      hasIssues: m.issueTypes.size > 0,
      hasOpenIssues: m.hasOpenIssues,
      hasBlockingIssues: m.hasBlockingIssues,
      issueTypes: Array.from(m.issueTypes),
      responsibleParties: Array.from(m.responsibleParties),
      statuses: Array.from(m.statuses),
      scopeRowIdsWithIssues: Array.from(m.scopeRowIds),
      scopeRowIdsWithBlockingIssues: Array.from(m.blockingScopeRowIds),
      subScopeInstanceIdsWithIssues: Array.from(m.subScopeInstanceIds),
      subScopeInstanceIdsWithBlockingIssues: Array.from(m.blockingSubScopeInstanceIds),
    };
  };
}

export type CanonicalShape = { id: string; code: string; displayName: string };

/**
 * Map from scopeTypeId → project-level canonical override.
 * Built once per request from `project_scope_overrides` and passed into every serializeUnitRow call.
 * When an entry exists it overrides the global `scopeType.canonicalScopeType` for that scope.
 */
export type ProjectScopeOverrideMap = Map<string, CanonicalShape>;

export function serializeUnitRow(
  u: ProjectRowWithRelations,
  buildIssueMeta: (ref: string) => UnitIssueMeta,
  options?: { includeProjectId?: boolean; projectScopeOverrides?: ProjectScopeOverrideMap },
) {
  const unitRef = `${u.building ?? ""}|${u.level ?? ""}|${u.unit ?? ""}`;

  // Project-level override takes precedence over the global canonical link.
  const effectiveCanonical = u.scopeType
    ? (options?.projectScopeOverrides?.get(u.scopeType.id) ??
        u.scopeType.canonicalScopeType ??
        null)
    : null;

  return {
    ...(options?.includeProjectId ? { projectId: u.projectId } : {}),
    id: u.id,
    rowIndex: u.rowIndex,
    building: u.building,
    level: u.level,
    unit: u.unit,
    area: u.area,
    shipPhase: u.shipPhase,
    buildPhase: u.buildPhase,
    scheme: u.scheme,
    unitType: u.unitType,
    description: u.description,
    scopeType: u.scopeType
      ? {
          id: u.scopeType.id,
          code: u.scopeType.code,
          name: u.scopeType.name,
          canonicalScopeType: effectiveCanonical,
        }
      : null,
    csiPrimeCode: u.csiPrimeCode,
    csiDetailCode: u.csiDetailCode,
    locationType: u.locationType
      ? { id: u.locationType.id, code: u.locationType.code, name: u.locationType.name }
      : null,
    costType: u.costType
      ? { id: u.costType.id, code: u.costType.code, name: u.costType.name }
      : null,
    installer: u.installer
      ? { id: u.installer.id, code: u.installer.code, name: u.installer.name }
      : null,
    unifierSubId: u.unifierSubId ?? null,
    qty: u.qty != null ? Number(u.qty) : null,
    uom: u.uom ? { id: u.uom.id, code: u.uom.code, name: u.uom.name } : null,
    unitRate: u.unitRate != null ? Number(u.unitRate) : null,
    budgetedManHours: u.budgetedManHours != null ? Number(u.budgetedManHours) : null,
    startDate: u.startDate?.toISOString().slice(0, 10) ?? null,
    finishDate: u.finishDate?.toISOString().slice(0, 10) ?? null,
    percentComplete: u.percentComplete != null ? Number(u.percentComplete) : null,
    actualManHours: u.actualManHours != null ? Number(u.actualManHours) : null,
    scopeStage: u.scopeStage ?? null,
    scopeStatus: u.scopeStatus ?? null,
    inspectionStatus: u.inspectionStatus ?? null,
    gridInspectionStatus: null as string | null,
    latestInspectionCategory: null as string | null,
    subScopeInstances: (u.subScopeInstances ?? []).map((inst) => ({
      id: inst.id,
      subScopeId: inst.subScopeId,
      subScope: inst.subScope,
      qty: inst.qty != null ? Number(inst.qty) : null,
      scopeStage: inst.scopeStage ?? null,
      scopeStatus: inst.scopeStatus ?? null,
      inspectionStatus: inst.inspectionStatus ?? null,
    })),
    clearInspection: u.clearInspections?.[0]
      ? {
          id: u.clearInspections[0].id,
          status: u.clearInspections[0].status,
          createdAt: u.clearInspections[0].createdAt.toISOString(),
        }
      : null,
    issueMeta: buildIssueMeta(unitRef),
  };
}

export async function loadProjectIssuesForMeta(projectId: string): Promise<ProjectIssueForMeta[]> {
  return db.projectIssue.findMany({
    where: { projectId },
    select: PROJECT_ISSUE_SELECT,
  });
}

export async function enrichUnitRowsWithGridInspection<T extends { id: string }>(
  projectId: string,
  rows: T[],
): Promise<T[]> {
  const map = await loadGridInspectionMapForScopeRowIds(
    projectId,
    rows.map((r) => r.id),
    db,
  );
  if (map.size === 0) return rows;
  return rows.map((row) => applyGridInspectionToSerializedRow(row, map));
}

const SNAPSHOT_MAX_ROWS = 5000;

type ProjectIssueWithProjectId = ProjectIssueForMeta & { projectId: string };

/** Full unit rows for offline snapshot — includes projectId on each row. */
export async function serializeProjectUnitsForSnapshot(projectIds: string[]): Promise<unknown[]> {
  if (projectIds.length === 0) return [];

  const [units, allIssues, allOverrides] = await Promise.all([
    db.projectRow.findMany({
      where: { projectId: { in: projectIds } },
      include: PROJECT_ROW_INCLUDE,
      take: SNAPSHOT_MAX_ROWS,
      orderBy: [{ projectId: "asc" }, { building: "asc" }, { level: "asc" }, { unit: "asc" }],
    }),
    db.projectIssue.findMany({
      where: { projectId: { in: projectIds } },
      select: { ...PROJECT_ISSUE_SELECT, projectId: true },
    }),
    db.projectScopeOverride.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        projectId: true,
        scopeTypeId: true,
        canonicalScopeType: { select: { id: true, code: true, displayName: true } },
      },
    }),
  ]);

  // Build per-project override maps
  const overridesByProject = new Map<string, ProjectScopeOverrideMap>();
  for (const ov of allOverrides) {
    const map = overridesByProject.get(ov.projectId) ?? new Map<string, CanonicalShape>();
    map.set(ov.scopeTypeId, ov.canonicalScopeType);
    overridesByProject.set(ov.projectId, map);
  }

  const issuesByProject = new Map<string, ProjectIssueForMeta[]>();
  for (const issue of allIssues as ProjectIssueWithProjectId[]) {
    const list = issuesByProject.get(issue.projectId) ?? [];
    list.push(issue);
    issuesByProject.set(issue.projectId, list);
  }

  const metaBuilderByProject = new Map<string, (ref: string) => UnitIssueMeta>();
  for (const projectId of projectIds) {
    metaBuilderByProject.set(
      projectId,
      createIssueMetaBuilder(issuesByProject.get(projectId) ?? []),
    );
  }

  const rowsByProject = new Map<string, ReturnType<typeof serializeUnitRow>[]>();
  for (const u of units) {
    const buildIssueMeta = metaBuilderByProject.get(u.projectId)!;
    const projectScopeOverrides = overridesByProject.get(u.projectId);
    const row = serializeUnitRow(u, buildIssueMeta, {
      includeProjectId: true,
      projectScopeOverrides,
    });
    const list = rowsByProject.get(u.projectId) ?? [];
    list.push(row);
    rowsByProject.set(u.projectId, list);
  }

  const enrichJobs = projectIds
    .filter((projectId) => (rowsByProject.get(projectId)?.length ?? 0) > 0)
    .map(async (projectId) => {
      const projectRows = rowsByProject.get(projectId)!;
      return enrichUnitRowsWithGridInspection(projectId, projectRows);
    });

  const enrichedGroups = await Promise.all(enrichJobs);
  return enrichedGroups.flat();
}
