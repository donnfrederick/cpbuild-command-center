/**
 * Unifier service layer — normalized, cached access to Unifier PDS data.
 *
 * Cache strategy: module-level Map with 5-minute TTL.
 * The PDS API is slow (10 000-row pages, no server-side filtering),
 * so we cache the full project list and invalidate after 5 minutes.
 */

import { fetchAllRows } from "./client";
import type {
  UnifierDocument,
  UnifierDocumentRaw,
  UnifierDmNodeRaw,
  UnifierProject,
  UnifierProjectRaw,
  UnifierProjectTeam,
  UnifierProjectTeamRaw,
  UnifierSysProjectInfoRaw,
} from "./types";
import {
  UNIFIER_DM_FILE_VIEW_COLUMNS,
  UNIFIER_DM_NODE_COLUMNS,
  UNIFIER_PROJECT_COLUMNS,
  UNIFIER_SYS_PROJECT_INFO_STARTDATE_COLUMNS,
  UNIFIER_TEAM_COLUMNS,
} from "./types";
import { MOCK_UNIFIER_PROJECTS } from "./mock-data";
import { isUnifierMockAllowed } from "./mock-mode";

const IS_MOCK = isUnifierMockAllowed();

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Date normalization (PDS strings / ISO / Excel serial) ─────────────────

/**
 * Normalize a Unifier/PDS date field to `YYYY-MM-DD`, or null if unparseable.
 * Handles ISO-like strings and numeric Excel serial strings (e.g. finish dates from spreadsheets).
 */
export function unifierDateStringToIso(s: string | null | undefined): string | null {
  if (!s?.trim()) return null;
  const t = s.trim();
  const fromDate = new Date(t);
  if (!Number.isNaN(fromDate.getTime())) return fromDate.toISOString().split("T")[0];
  const serial = Number(t);
  if (!Number.isNaN(serial) && serial > 1 && serial < 100000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + serial * 86400000;
    const d2 = new Date(ms);
    if (!Number.isNaN(d2.getTime())) return d2.toISOString().split("T")[0];
  }
  return null;
}

function buildSysProjectStartDateMap(raw: UnifierSysProjectInfoRaw[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const r of raw) {
    if (r.PID) m.set(r.PID, unifierDateStringToIso(r.STARTDATE));
  }
  return m;
}

function buildMockSysProjectStartDateMap(): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const p of MOCK_UNIFIER_PROJECTS) {
    m.set(p.pid, unifierDateStringToIso(p.fieldDueDate));
  }
  return m;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

/**
 * Maps Unifier's UUU_SHELL_STATUS string to Field Tracker's ProjectStatus enum.
 * Defaults to "Planning" for any unknown value.
 */
export function mapUnifierStatus(
  raw: string | null | undefined
): "Active" | "Completed" | "Planning" | "OnHold" {
  switch (raw?.trim().toLowerCase()) {
    case "active":
      return "Active";
    case "on hold":
      return "OnHold";
    case "inactive":
    case "complete":
    case "completed":
      return "Completed";
    default:
      return "Planning";
  }
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeProject(raw: UnifierProjectRaw): UnifierProject {
  return {
    pid: raw.PID,
    projectNumber: raw.UE_PRJ_PROJNUMSSN ?? null,
    projectName: raw.UE_PRJ_PROJNAMESSN ?? null,
    status: raw.CP_PROJECT_PHASEPD ?? null,
    shellStatus: raw.UUU_SHELL_STATUS ?? null,
    /** Site/address line for UI — Unifier `CP_GEN_ADDRESS_TB2000`, not `UUU_LOCATION` (often an internal code). */
    location: raw.CP_GEN_ADDRESS_TB2000 ?? null,
    address: raw.CP_GEN_ADDRESS_TB2000 ?? null,
    state: raw.CP_GEN_STATE_PD ?? null,
    clientName: raw.CP_CL_CLIENTNAME_TB50 ?? null,
    projectType: raw.CP_OP_PROJECTTYPE_PD ?? null,
    projectPhase: raw.CP_PROJECT_PHASEPD ?? null,
    stage: raw.CP_OP_STAGE_PD ?? null,
    estimatingStage: raw.CP_OP_ESTIMATINGSTAGE_PD ?? null,
    projectManagerName: raw.CP_GEN_PROJMANAGER_NAME ?? null,
    estimatorName: raw.CP_GEN_ESTIMATOR_NAME ?? null,
    fieldDueDate: raw.CP_OP_FDD_DOP ?? null,
    sageProjectId: raw.CP_AP_SAGEPROJECTID_TB ?? null,
    rfmsProjectId: raw.CP_AP_RFMSPROJECTID_TB ?? null,
    projectTrack: raw.CP_OP_PROJECTTRACK_PD ?? null,
  };
}

function normalizeTeam(raw: UnifierProjectTeamRaw): UnifierProjectTeam {
  return {
    id: raw.ID,
    projectId: raw.PROJECT_ID ?? null,
    recordNo: raw.RECORD_NO ?? null,
    status: raw.STATUS ?? null,
    title: raw.TITLE ?? null,
    createdAt: raw.UUU_CREATION_DATE ?? null,
    updatedAt: raw.UUU_RECORD_LAST_UPDATE_DATE ?? null,
    preEstimatorName: raw.CP_GEN_PREESTIMATOR_NAME ?? null,
    preEstimatorId: raw.CP_OP_PREESTIMATOR_DP ?? null,
    salesName: raw.CP_GEN_SALES_NAME ?? null,
    salesId: raw.CP_GEN_SALES_UP ?? null,
    projectManagerName: raw.CP_GEN_PROJMANAGER_NAME ?? null,
    projectManagerId: raw.CP_OP_PROJECTMANAGER_DP ?? null,
    draftsman: raw.CP_GEN_DRAFTSMAN_NAME ?? null,
    draftsmanId: raw.CP_GEN_DRAFTSMAN_UP ?? null,
    projectCoordinatorName: raw.CP_GEN_PRJCOORDINATOR_NAME ?? null,
    projectCoordinatorId: raw.CP_OP_PROJECTCOORDINATOR_DP ?? null,
    orderSpecialistName: raw.CP_GEN_ORDERSPECIALIST_NAME ?? null,
    orderSpecialistId: raw.CP_ORDERSPECIALIST_UP ?? null,
    qualityControlName: raw.CP_GEN_QUALITYCONTROL_NAME ?? null,
    qualityControlId: raw.CP_GEN_QUALITYCONTROL_UP ?? null,
    projectEngineerName: raw.CP_GEN_PROJENGINEER_NAME ?? null,
    projectEngineerId: raw.CP_GEN_PROJECTENGINEER_UP ?? null,
    installManagerName: raw.CP_GEN_INSTALLMANAGER_NAME ?? null,
    installManagerId: raw.CP_GEN_INSTALLATIONMGR_UP ?? null,
    accountingName: raw.CP_GEN_ACCOUNTING_NAME ?? null,
    accountingId: raw.CP_GEN_ACCOUNTING_UP ?? null,
    projectControlsName: raw.CP_GEN_PROJECTCONTROLS_NAME ?? null,
    projectControlsId: raw.CP_GEN_PROJECTCONTROLS_UP ?? null,
    schedulingName: raw.CP_GEN_SCHEDULING_NAME ?? null,
    schedulingId: raw.CP_GEN_SCHEDULING_UP ?? null,
    estimatorName: raw.CP_GEN_ESTIMATOR_NAME ?? null,
    estimatorId: raw.CP_OP_ESTIMATOR_DP ?? null,
    costEngineerName: raw.CP_GEN_COSTENGINEER_NAME ?? null,
    costEngineerId: raw.CP_OP_COSTENGINEER_DP ?? null,
    projectOwnerName: raw.CP_OP_PROJECTOWNERNAME_SMN ?? null,
    projectOwnerId: raw.CP_OP_OPPOWNER_DP ?? null,
  };
}

// ─── Public service methods ───────────────────────────────────────────────────

const PROJECTS_CACHE_KEY = "unifier:projects";
const SYS_PROJECT_START_DATES_KEY = "unifier:sys-project-start-dates";
const TEAMS_CACHE_KEY = "unifier:teams";

/**
 * Map of Unifier `PID` → `YYYY-MM-DD` from `UNIFIER_SYS_PROJECT_INFO.STARTDATE`.
 * Cached 5 minutes; warmed in parallel when `getProjects()` refreshes shells.
 */
export async function getSysProjectStartDateByPidMap(): Promise<Map<string, string | null>> {
  if (IS_MOCK) return buildMockSysProjectStartDateMap();

  const cached = getCached<Map<string, string | null>>(SYS_PROJECT_START_DATES_KEY);
  if (cached) return cached;

  const raw = await fetchAllRows<UnifierSysProjectInfoRaw>(
    "UNIFIER_SYS_PROJECT_INFO",
    UNIFIER_SYS_PROJECT_INFO_STARTDATE_COLUMNS
  );
  const map = buildSysProjectStartDateMap(raw);
  setCached(SYS_PROJECT_START_DATES_KEY, map);
  return map;
}

/**
 * Returns all Unifier project shells from UNIFIER_US_XPRJ.
 * On cache miss, also loads `UNIFIER_SYS_PROJECT_INFO` (PID + STARTDATE) in parallel
 * and caches start dates for `enrichProjectList` / `enrichProjectById`.
 */
export async function getProjects(): Promise<UnifierProject[]> {
  if (IS_MOCK) return MOCK_UNIFIER_PROJECTS;

  const cached = getCached<UnifierProject[]>(PROJECTS_CACHE_KEY);
  if (cached) return cached;

  const [raw, rawSys] = await Promise.all([
    fetchAllRows<UnifierProjectRaw>("UNIFIER_US_XPRJ", UNIFIER_PROJECT_COLUMNS),
    fetchAllRows<UnifierSysProjectInfoRaw>(
      "UNIFIER_SYS_PROJECT_INFO",
      UNIFIER_SYS_PROJECT_INFO_STARTDATE_COLUMNS
    ),
  ]);

  // Note: Status filter (1 vs 0) would require a valid column in UNIFIER_US_XPRJ.
  const projects = raw.map(normalizeProject);
  setCached(PROJECTS_CACHE_KEY, projects);
  setCached(SYS_PROJECT_START_DATES_KEY, buildSysProjectStartDateMap(rawSys));
  return projects;
}

/**
 * Returns a single project by its PID.
 * Reuses the cached project list — no additional API call.
 */
export async function getProjectByPid(
  pid: string
): Promise<UnifierProject | null> {
  const projects = await getProjects();
  return projects.find((p) => p.pid === pid) ?? null;
}

/**
 * Returns all team assignment records from UNIFIER_UXPT,
 * optionally filtered to a specific Unifier project ID.
 *
 * The PDS API has no server-side filtering, so we fetch all rows
 * and filter in memory. Results are cached for 5 minutes.
 */
export async function getProjectTeams(
  projectId?: string
): Promise<UnifierProjectTeam[]> {
  if (IS_MOCK) return [];

  let teams = getCached<UnifierProjectTeam[]>(TEAMS_CACHE_KEY);

  if (!teams) {
    const raw = await fetchAllRows<UnifierProjectTeamRaw>(
      "UNIFIER_UXPT",
      UNIFIER_TEAM_COLUMNS
    );
    teams = raw.map(normalizeTeam);
    setCached(TEAMS_CACHE_KEY, teams);
  }

  if (projectId) {
    return teams.filter((t) => t.projectId === projectId);
  }

  return teams;
}

// ─── Document Manager ─────────────────────────────────────────────────────────

const DOCUMENTS_CACHE_KEY = "unifier:dm_node";

/**
 * Returns only file nodes (those with a download URL) whose NODE_NAME or
 * DESCRIPTION contains "shop drawing" (case-insensitive).
 */
function filterShopDrawings(nodes: UnifierDmNodeRaw[]): UnifierDmNodeRaw[] {
  return nodes.filter((n) => {
    if (!n.UUU_DOC_ATTRIBUTE_URL || String(n.UUU_DOC_ATTRIBUTE_URL).trim() === "") return false;
    const name = (n.NODE_NAME ?? "").toLowerCase();
    const desc = (n.DESCRIPTION ?? "").toLowerCase();
    return name.includes("shop drawing") || desc.includes("shop drawing");
  });
}

function getRawVal(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return raw[k];
  }
  return undefined;
}

function normalizeDocument(raw: UnifierDocumentRaw): UnifierDocument {
  const r = raw as Record<string, unknown>;
  const id = getRawVal(r, "ID", "id") != null ? String(getRawVal(r, "ID", "id")) : "";
  const projectId = getRawVal(r, "PROJECT_ID", "project_id") != null ? String(getRawVal(r, "PROJECT_ID", "project_id")) : null;
  const fileSizeVal = getRawVal(r, "FILE_SIZE", "file_size");
  const fileSize = fileSizeVal != null ? Number(fileSizeVal) : null;
  return {
    id,
    projectId,
    title: (getRawVal(r, "TITLE", "title") as string | null) ?? null,
    fileName: (getRawVal(r, "FILE_NAME", "file_name") as string | null) ?? null,
    revisionNo: (getRawVal(r, "REVISION_NO", "revision_no") as string | null) ?? null,
    issueDate: (getRawVal(r, "ISSUE_DATE", "issue_date") as string | null) ?? null,
    createDate: (getRawVal(r, "CREATE_DATE", "create_date") as string | null) ?? null,
    uploadDate: (getRawVal(r, "UPLOAD_DATE", "upload_date") as string | null) ?? null,
    fileSize: fileSize != null && !Number.isNaN(fileSize) ? fileSize : null,
    createdBy: (getRawVal(r, "UUU_CREATE_BY", "uuu_create_by") as string | null) ?? null,
    uploadBy: (getRawVal(r, "UUU_UPLOAD_BY", "uuu_upload_by") as string | null) ?? null,
    docTag: (getRawVal(r, "DOC_TAG", "doc_tag") as string | null) ?? null,
    downloadUrl: null,
    nodeType: null,
  };
}

function normalizeDmNode(raw: UnifierDmNodeRaw): UnifierDocument {
  const r = raw as Record<string, unknown>;
  const downloadUrl = (getRawVal(r, "UUU_DOC_ATTRIBUTE_URL") as string | null) ?? null;
  const projectId = getRawVal(r, "PROJECT_ID") != null ? String(getRawVal(r, "PROJECT_ID")) : null;
  const name = (getRawVal(r, "NODE_NAME") as string | null) ?? null;
  // Derive a stable ID from the URL (the numeric ID at the end) or fall back to node name
  const urlId = downloadUrl ? (downloadUrl.split("/").pop() ?? "") : "";
  const id = urlId || name || String(getRawVal(r, "PARENT_ID") ?? "");
  const nodeTypeRaw = getRawVal(r, "NODE_TYPE");
  return {
    id,
    projectId,
    title: name,
    fileName: name,
    revisionNo: null,
    issueDate: null,
    createDate: null,
    uploadDate: null,
    fileSize: null,
    createdBy: null,
    uploadBy: null,
    docTag: null,
    downloadUrl,
    nodeType: nodeTypeRaw != null ? String(nodeTypeRaw) : null,
  };
}

/**
 * Returns documents for a Unifier project.
 *
 * Primary source: UNIFIER_DM_NODE — file nodes with UUU_DOC_ATTRIBUTE_URL (direct
 * download/preview links). Falls back to UNIFIER_DM_FILE_VIEW if the node table
 * returns no results with a URL.
 *
 * Filters by PROJECT_ID matching pid or projectNumber.
 */
export async function getProjectDocuments(
  pid: string,
  projectNumber?: string | null
): Promise<UnifierDocument[]> {
  if (IS_MOCK) return [];

  let all = getCached<UnifierDocument[]>(DOCUMENTS_CACHE_KEY);

  if (!all) {
    let docs: UnifierDocument[] = [];
    try {
      const nodes = await fetchAllRows<UnifierDmNodeRaw>(
        "UNIFIER_DM_NODE",
        UNIFIER_DM_NODE_COLUMNS
      );
      docs = filterShopDrawings(nodes).map(normalizeDmNode);
    } catch {
      // Fall back to the file view if DM node query fails
      try {
        const raw = await fetchAllRows<UnifierDocumentRaw>(
          "UNIFIER_DM_FILE_VIEW",
          UNIFIER_DM_FILE_VIEW_COLUMNS
        );
        docs = raw
          .filter((r) => {
            const s = getRawVal(r as Record<string, unknown>, "STATUS", "status");
            return s != null ? Number(s) !== 0 : false;
          })
          .map(normalizeDocument);
      } catch {
        docs = [];
      }
    }
    setCached(DOCUMENTS_CACHE_KEY, docs);
    all = docs;
  }

  const ids = [pid, projectNumber].filter(Boolean) as string[];
  return all.filter((d) => d.projectId != null && ids.includes(d.projectId));
}
