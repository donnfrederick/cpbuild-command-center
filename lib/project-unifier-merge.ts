/**
 * Field Tracker `Project` API payloads are built from:
 * - DB row: CC-owned fields only (`unifierPid`, install manager assignment, ids, soft-delete).
 * - Unifier shell (`UNIFIER_US_XPRJ`): name, site + state (`CP_GEN_ADDRESS_TB2000` + `CP_GEN_STATE_PD`), PM, number, shell lifecycle, phase display.
 * - `UNIFIER_SYS_PROJECT_INFO.STARTDATE` (via `getSysProjectStartDateByPidMap`): API `startDate`.
 * - Fallback: shell `CP_OP_FDD_DOP` (field due date) if sys row/date missing.
 * Module cache TTL (~5 min) applies to PDS-backed data.
 */

import { db } from "@/lib/db";
import {
  getProjects,
  getProjectByPid,
  getProjectTeams,
  getSysProjectStartDateByPidMap,
  mapUnifierStatus,
  unifierDateStringToIso,
} from "@/lib/unifier/service";
import type { UnifierProject } from "@/lib/unifier/types";
import { formatUnifierSiteLocation } from "@/lib/unifier/site-location-display";
import type { Project, ProjectStatus } from "@/lib/projects";
import { statusFromDb } from "@/lib/projects";

function phaseDisplayFromShell(shell: UnifierProject | null | undefined): string {
  return (shell?.status ?? shell?.projectPhase ?? "").trim();
}

/** Input to merge helpers: core Prisma `Project` row fields plus optional list-enrichment values. */
export type ProjectDbRow = {
  id: string;
  unifierPid: string | null;
  sourceUnifierPid?: string | null;
  clonedFromProjectId?: string | null;
  /** Resolved from clone source project name — not stored on the DB row. */
  clonedFromProjectName?: string | null;
  clonedAt?: Date | null;
  installManagerId: string | null;
  installManagerName: string | null;
  projectManagerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  isTestProject: boolean;
  scopeTypes?: string[];
};

export function resolveShellUnifierPid(row: {
  isTestProject: boolean;
  unifierPid: string | null;
  sourceUnifierPid?: string | null;
}): string | null {
  if (row.isTestProject && row.sourceUnifierPid?.trim()) {
    return row.sourceUnifierPid.trim();
  }
  return row.unifierPid;
}

function formatTestProjectName(baseName: string, isTestProject: boolean): string {
  const trimmed = baseName.trim();
  if (!isTestProject) return trimmed || "Unnamed project";
  if (!trimmed || trimmed === "Unnamed project" || trimmed === "Unnamed Test Project") {
    return "Unnamed Test Project";
  }
  if (trimmed.endsWith(" (TEST)")) return trimmed;
  return `${trimmed} (TEST)`;
}

function resolveProjectStartDate(
  sysInfoIso: string | null | undefined,
  shellFieldDue: string | null | undefined
): string | null {
  if (sysInfoIso?.trim()) return sysInfoIso.trim();
  return unifierDateStringToIso(shellFieldDue);
}

function shellToLifecycleStatus(shell: UnifierProject | null | undefined): ProjectStatus {
  if (!shell) return "Planning";
  const mapped = mapUnifierStatus(shell.shellStatus);
  return (statusFromDb[mapped] ?? "Planning") as ProjectStatus;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Build API `Project` from a DB row + optional Unifier shell + optional sys `STARTDATE` (ISO yyyy-mm-dd). */
export function mergeProjectWithShell(
  row: ProjectDbRow,
  shell: UnifierProject | null | undefined,
  sysProjectStartDateIso: string | null | undefined = undefined,
  unifierInstallManagerName: string | null | undefined = undefined
): Project {
  const site = formatUnifierSiteLocation(
    shell?.location ?? shell?.address,
    shell?.state
  );
  const hasUnifierInstallManagerOverride = unifierInstallManagerName !== undefined;
  const baseName = (shell?.projectName ?? "").trim() || (row.isTestProject ? "Unnamed Test Project" : "Unnamed project");
  return {
    id: row.id,
    projectName: formatTestProjectName(baseName, row.isTestProject),
    siteLocation: site,
    status: phaseDisplayFromShell(shell ?? undefined),
    lifecycleStatus: shellToLifecycleStatus(shell ?? undefined),
    startDate: resolveProjectStartDate(
      sysProjectStartDateIso ?? null,
      shell?.fieldDueDate
    ),
    installManagerId: row.installManagerId ?? null,
    installManagerName: hasUnifierInstallManagerOverride
      ? trimmedOrNull(unifierInstallManagerName)
      : row.installManagerName ?? null,
    projectManagerId: row.projectManagerId ?? null,
    projectManagerName: (shell?.projectManagerName ?? "").trim(),
    unifierPid: resolveShellUnifierPid(row),
    unifierProjectNumber: shell?.projectNumber ?? null,
    scopeTypes: row.scopeTypes ?? [],
    isTestProject: row.isTestProject,
    clonedFromProjectId: row.clonedFromProjectId ?? null,
    clonedFromProjectName: row.clonedFromProjectName ?? null,
    clonedAt: row.clonedAt?.toISOString() ?? null,
    isFavorite: false,
  };
}

async function buildShellIndex(): Promise<Map<string, UnifierProject>> {
  const shells = await getProjects();
  return new Map(shells.map((s) => [s.pid, s]));
}

/** DB-only merge when Unifier PDS is unavailable (circuit breaker, auth, network). */
export function enrichProjectListFromDbOnly(rows: ProjectDbRow[]): Project[] {
  return rows.map((r) =>
    mergeProjectWithShell(
      { ...r, clonedFromProjectName: r.clonedFromProjectName ?? null },
      undefined,
      null,
      undefined
    )
  );
}

export async function enrichProjectList(rows: ProjectDbRow[]): Promise<Project[]> {
  if (rows.length === 0) return [];
  const [byPid, startDates, teams] = await Promise.all([
    buildShellIndex(),
    getSysProjectStartDateByPidMap(),
    getProjectTeams().catch(() => undefined),
  ]);
  const cloneSourceNames = await resolveCloneSourceNames(rows, byPid);
  const installManagerByPid = new Map<string, string>();
  if (teams) {
    for (const team of teams) {
      const name = trimmedOrNull(team.installManagerName);
      if (team.projectId && name && !installManagerByPid.has(team.projectId)) {
        installManagerByPid.set(team.projectId, name);
      }
    }
  }
  return rows.map((r) => {
    const pid = resolveShellUnifierPid(r);
    return mergeProjectWithShell(
      {
        ...r,
        clonedFromProjectName: r.clonedFromProjectId
          ? cloneSourceNames.get(r.clonedFromProjectId) ?? null
          : null,
      },
      pid ? byPid.get(pid) : undefined,
      pid ? (startDates.get(pid) ?? null) : null,
      teams && pid ? (installManagerByPid.get(pid) ?? null) : undefined
    );
  });
}

export { UNIFIER_AVAILABLE_HEADER } from "@/lib/unifier/availability-header";

export type EnrichedProjectListResult = {
  projects: Project[];
  unifierAvailable: boolean;
};

/**
 * Like `enrichProjectList`, but never throws — falls back to DB-only project rows
 * when Unifier is down so dashboard SSR (e.g. /projects) does not crash for all users.
 */
export async function enrichProjectListResilient(
  rows: ProjectDbRow[]
): Promise<EnrichedProjectListResult> {
  try {
    const projects = await enrichProjectList(rows);
    return { projects, unifierAvailable: true };
  } catch (err) {
    console.error(
      "[project-unifier-merge] Project list enrichment failed — serving DB-only fallback",
      err
    );
    return { projects: enrichProjectListFromDbOnly(rows), unifierAvailable: false };
  }
}

async function resolveCloneSourceNames(
  rows: ProjectDbRow[],
  byPid: Map<string, UnifierProject>
): Promise<Map<string, string | null>> {
  const sourceIds = [...new Set(rows.map((r) => r.clonedFromProjectId).filter((id): id is string => Boolean(id)))];
  const out = new Map<string, string | null>();
  if (sourceIds.length === 0) return out;

  const sources = await db.project.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, unifierPid: true, sourceUnifierPid: true, isTestProject: true },
  });
  for (const source of sources) {
    const pid = resolveShellUnifierPid(source);
    const shell = pid ? byPid.get(pid) : undefined;
    const name = (shell?.projectName ?? "").trim();
    out.set(source.id, name || null);
  }
  return out;
}

export async function enrichProjectById(id: string): Promise<Project | null> {
  const row = await db.project.findFirst({
    where: { id, deletedAt: null },
  });
  if (!row) return null;
  const pid = resolveShellUnifierPid(row);
  const shell = pid ? await getProjectByPid(pid) : null;
  const [startDates, teams, clonedFromName] = await Promise.all([
    getSysProjectStartDateByPidMap(),
    pid ? getProjectTeams(pid).catch(() => undefined) : Promise.resolve(undefined),
    row.clonedFromProjectId
      ? db.project
          .findFirst({
            where: { id: row.clonedFromProjectId },
            select: { id: true, sourceUnifierPid: true, unifierPid: true, isTestProject: true },
          })
          .then(async (source) => {
            if (!source) return null;
            const sourcePid = resolveShellUnifierPid(source);
            if (!sourcePid) return null;
            const sourceShell = await getProjectByPid(sourcePid);
            const name = (sourceShell?.projectName ?? "").trim();
            return name || null;
          })
      : Promise.resolve(null),
  ]);
  const sysStart = pid ? (startDates.get(pid) ?? null) : null;
  const installManagerName = teams
    ?.map((team) => trimmedOrNull(team.installManagerName))
    .find((name): name is string => Boolean(name));
  return mergeProjectWithShell(
    { ...row, clonedFromProjectName: clonedFromName },
    shell,
    sysStart,
    teams ? (installManagerName ?? null) : undefined
  );
}

/** Page titles — prefers live Unifier project name. */
export async function getProjectDisplayNameForMetadata(id: string): Promise<string | null> {
  try {
    const row = await db.project.findFirst({
      where: { id, deletedAt: null },
      select: { unifierPid: true, isTestProject: true },
    });
    if (!row) return null;
    if (!row.unifierPid) return row.isTestProject ? "Unnamed Test Project" : "Project";
    const shell = await getProjectByPid(row.unifierPid);
    const name = (shell?.projectName ?? "").trim();
    if (name) return name;
    return row.isTestProject ? "Unnamed Test Project" : `Unifier ${row.unifierPid}`;
  } catch (err) {
    console.error("[getProjectDisplayNameForMetadata] failed:", err);
    return null;
  }
}
