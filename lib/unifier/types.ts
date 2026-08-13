/**
 * Types for Oracle Primavera Unifier PDS (Project Data Store) API.
 *
 * The PDS API endpoint is:
 *   POST {UNIFIER_BASE_URL}/pds/rest-service/dataservice/runquery?configCode=ds_unifier
 *
 * Auth: Basic Auth (username + password as base64-encoded header).
 * Response is paginated via nextKey / nextTableName.
 */

// ─── PDS API request ──────────────────────────────────────────────────────────

export interface PdsQueryTable {
  tableName: string;
  columns: string[];
  orderByColumns?: string[] | null;
}

export interface PdsQueryBody {
  name: string;
  pageSize: string;
  mode: "SYNC";
  tables: PdsQueryTable[];
  /** Present on subsequent pages only */
  nextTableName?: string;
  /** Present on subsequent pages only */
  nextKey?: string;
}

// ─── PDS API response ─────────────────────────────────────────────────────────

export interface PdsPagination {
  /**
   * "-1" signals no more pages; otherwise contains the key for the next page.
   */
  nextTableName: string;
  nextKey: string;
}

export interface PdsResponseData {
  pagination: PdsPagination[];
  [tableName: string]: unknown[] | PdsPagination[];
}

export interface PdsResponse {
  data: PdsResponseData;
  message: string[];
  status: number;
}

// ─── UNIFIER_US_XPRJ — project shells ────────────────────────────────────────

/**
 * Raw row from the UNIFIER_US_XPRJ table.
 * Field names are Unifier's internal column codes.
 */
export interface UnifierProjectRaw {
  PID: string;
  UE_PRJ_PROJNUMSSN: string | null;
  UE_PRJ_PROJNAMESSN: string | null;
  UUU_SHELL_STATUS: string | null;
  UUU_LOCATION: string | null;
  CP_GEN_ADDRESS_TB2000: string | null;
  CP_GEN_STATE_PD: string | null;
  CP_CL_CLIENTNAME_TB50: string | null;
  CP_OP_PROJECTTYPE_PD: string | null;
  CP_PROJECT_PHASEPD: string | null;
  CP_OP_STAGE_PD: string | null;
  CP_OP_ESTIMATINGSTAGE_PD: string | null;
  CP_GEN_PROJMANAGER_NAME: string | null;
  CP_GEN_ESTIMATOR_NAME: string | null;
  CP_OP_FDD_DOP: string | null;
  CP_AP_SAGEPROJECTID_TB: string | null;
  CP_AP_RFMSPROJECTID_TB: string | null;
  CP_OP_PROJECTTRACK_PD: string | null;
}

/**
 * Normalized project returned by the Unifier service layer.
 * All fields are mapped to readable names.
 */
export interface UnifierProject {
  pid: string;
  projectNumber: string | null;
  projectName: string | null;
  /**
   * Project phase from `CP_PROJECT_PHASEPD` — shown as “Status” in Unifier import UI.
   */
  status: string | null;
  /**
   * Shell lifecycle from `UUU_SHELL_STATUS` — used only to map initial Field Tracker `Project.status` on create.
   */
  shellStatus: string | null;
  /** General project address / site line — sourced from `CP_GEN_ADDRESS_TB2000`, not `UUU_LOCATION`. */
  location: string | null;
  /** Same PDS column as `location` (`CP_GEN_ADDRESS_TB2000`); kept for callers that use the name `address`. */
  address: string | null;
  state: string | null;
  clientName: string | null;
  projectType: string | null;
  projectPhase: string | null;
  stage: string | null;
  estimatingStage: string | null;
  projectManagerName: string | null;
  estimatorName: string | null;
  fieldDueDate: string | null;
  sageProjectId: string | null;
  rfmsProjectId: string | null;
  projectTrack: string | null;
}

// ─── UNIFIER_UXPT — project team assignments ──────────────────────────────────

/**
 * Raw row from the UNIFIER_UXPT table.
 */
export interface UnifierProjectTeamRaw {
  ID: string;
  PROCESS_STATUS: string | null;
  PROJECT_ID: string | null;
  RECORD_NO: string | null;
  STATUS: string | null;
  TITLE: string | null;
  UUU_CREATION_DATE: string | null;
  UUU_RECORD_LAST_UPDATE_DATE: string | null;
  CP_GEN_PREESTIMATOR_NAME: string | null;
  CP_OP_PREESTIMATOR_DP: string | null;
  CP_GEN_SALES_NAME: string | null;
  CP_GEN_SALES_UP: string | null;
  CP_GEN_PROJMANAGER_NAME: string | null;
  CP_OP_PROJECTMANAGER_DP: string | null;
  CP_GEN_DRAFTSMAN_NAME: string | null;
  CP_GEN_DRAFTSMAN_UP: string | null;
  CP_GEN_PRJCOORDINATOR_NAME: string | null;
  CP_OP_PROJECTCOORDINATOR_DP: string | null;
  CP_GEN_ORDERSPECIALIST_NAME: string | null;
  CP_ORDERSPECIALIST_UP: string | null;
  CP_GEN_QUALITYCONTROL_NAME: string | null;
  CP_GEN_QUALITYCONTROL_UP: string | null;
  CP_GEN_PROJENGINEER_NAME: string | null;
  CP_GEN_PROJECTENGINEER_UP: string | null;
  CP_GEN_INSTALLATIONMGR_UP: string | null;
  CP_GEN_INSTALLMANAGER_NAME: string | null;
  CP_GEN_ACCOUNTING_NAME: string | null;
  CP_GEN_ACCOUNTING_UP: string | null;
  CP_GEN_PROJECTCONTROLS_NAME: string | null;
  CP_GEN_PROJECTCONTROLS_UP: string | null;
  CP_GEN_SCHEDULING_NAME: string | null;
  CP_GEN_SCHEDULING_UP: string | null;
  CP_GEN_ESTIMATOR_NAME: string | null;
  CP_OP_ESTIMATOR_DP: string | null;
  CP_GEN_COSTENGINEER_NAME: string | null;
  CP_OP_COSTENGINEER_DP: string | null;
  CP_OP_PROJECTOWNERNAME_SMN: string | null;
  CP_OP_OPPOWNER_DP: string | null;
}

/**
 * Normalized project team record returned by the Unifier service layer.
 */
export interface UnifierProjectTeam {
  id: string;
  projectId: string | null;
  recordNo: string | null;
  status: string | null;
  title: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  preEstimatorName: string | null;
  preEstimatorId: string | null;
  salesName: string | null;
  salesId: string | null;
  projectManagerName: string | null;
  projectManagerId: string | null;
  draftsman: string | null;
  draftsmanId: string | null;
  projectCoordinatorName: string | null;
  projectCoordinatorId: string | null;
  orderSpecialistName: string | null;
  orderSpecialistId: string | null;
  qualityControlName: string | null;
  qualityControlId: string | null;
  projectEngineerName: string | null;
  projectEngineerId: string | null;
  installManagerName: string | null;
  installManagerId: string | null;
  accountingName: string | null;
  accountingId: string | null;
  projectControlsName: string | null;
  projectControlsId: string | null;
  schedulingName: string | null;
  schedulingId: string | null;
  estimatorName: string | null;
  estimatorId: string | null;
  costEngineerName: string | null;
  costEngineerId: string | null;
  projectOwnerName: string | null;
  projectOwnerId: string | null;
}

// ─── Column definitions used in PDS queries ───────────────────────────────────

// ─── UNIFIER_SYS_PROJECT_INFO — system project row (join on PID = shell PID) ─

/** Raw row subset for start date (full table has more columns in DevTools schema). */
export interface UnifierSysProjectInfoRaw {
  PID: string;
  STARTDATE: string | null;
}

export const UNIFIER_SYS_PROJECT_INFO_STARTDATE_COLUMNS: string[] = ["PID", "STARTDATE"];

export const UNIFIER_PROJECT_COLUMNS: string[] = [
  "PID",
  "UE_PRJ_PROJNUMSSN",
  "UE_PRJ_PROJNAMESSN",
  "UUU_SHELL_STATUS",
  "UUU_LOCATION",
  "CP_GEN_ADDRESS_TB2000",
  "CP_GEN_STATE_PD",
  "CP_CL_CLIENTNAME_TB50",
  "CP_OP_PROJECTTYPE_PD",
  "CP_PROJECT_PHASEPD",
  "CP_OP_STAGE_PD",
  "CP_OP_ESTIMATINGSTAGE_PD",
  "CP_GEN_PROJMANAGER_NAME",
  "CP_GEN_ESTIMATOR_NAME",
  "CP_OP_FDD_DOP",
  "CP_AP_SAGEPROJECTID_TB",
  "CP_AP_RFMSPROJECTID_TB",
  "CP_OP_PROJECTTRACK_PD",
];

export const UNIFIER_TEAM_COLUMNS: string[] = [
  "ID",
  "PROCESS_STATUS",
  "PROJECT_ID",
  "RECORD_NO",
  "STATUS",
  "TITLE",
  "UUU_CREATION_DATE",
  "UUU_RECORD_LAST_UPDATE_DATE",
  "CP_GEN_PREESTIMATOR_NAME",
  "CP_OP_PREESTIMATOR_DP",
  "CP_GEN_SALES_NAME",
  "CP_GEN_SALES_UP",
  "CP_GEN_PROJMANAGER_NAME",
  "CP_OP_PROJECTMANAGER_DP",
  "CP_GEN_DRAFTSMAN_NAME",
  "CP_GEN_DRAFTSMAN_UP",
  "CP_GEN_PRJCOORDINATOR_NAME",
  "CP_OP_PROJECTCOORDINATOR_DP",
  "CP_GEN_ORDERSPECIALIST_NAME",
  "CP_ORDERSPECIALIST_UP",
  "CP_GEN_QUALITYCONTROL_NAME",
  "CP_GEN_QUALITYCONTROL_UP",
  "CP_GEN_PROJENGINEER_NAME",
  "CP_GEN_PROJECTENGINEER_UP",
  "CP_GEN_INSTALLATIONMGR_UP",
  "CP_GEN_INSTALLMANAGER_NAME",
  "CP_GEN_ACCOUNTING_NAME",
  "CP_GEN_ACCOUNTING_UP",
  "CP_GEN_PROJECTCONTROLS_NAME",
  "CP_GEN_PROJECTCONTROLS_UP",
  "CP_GEN_SCHEDULING_NAME",
  "CP_GEN_SCHEDULING_UP",
  "CP_GEN_ESTIMATOR_NAME",
  "CP_OP_ESTIMATOR_DP",
  "CP_GEN_COSTENGINEER_NAME",
  "CP_OP_COSTENGINEER_DP",
  "CP_OP_PROJECTOWNERNAME_SMN",
  "CP_OP_OPPOWNER_DP",
];

// ─── dm_file_view — Document Manager (files joined with content) ────────────────

/**
 * Raw row from dm_file_view.
 * View joins dm_file and dm_file_content. project_id links to shell/project.
 * status: 0=deleted, 1=uploaded, 2=deployed — we exclude 0.
 * PDS may return keys in uppercase or lowercase depending on schema.
 */
export interface UnifierDocumentRaw {
  ID?: number | string | null;
  id?: number | string | null;
  PROJECT_ID?: number | string | null;
  project_id?: number | string | null;
  TITLE?: string | null;
  title?: string | null;
  FILE_NAME?: string | null;
  file_name?: string | null;
  REVISION_NO?: string | null;
  revision_no?: string | null;
  ISSUE_DATE?: string | null;
  issue_date?: string | null;
  CREATE_DATE?: string | null;
  create_date?: string | null;
  UPLOAD_DATE?: string | null;
  upload_date?: string | null;
  STATUS?: number | string | null;
  status?: number | string | null;
  FILE_SIZE?: number | string | null;
  file_size?: number | string | null;
  UUU_CREATE_BY?: string | null;
  uuu_create_by?: string | null;
  UUU_UPLOAD_BY?: string | null;
  uuu_upload_by?: string | null;
  DOC_TAG?: string | null;
  doc_tag?: string | null;
}

/**
 * Normalized document for display in Field Tracker.
 */
export interface UnifierDocument {
  id: string;
  projectId: string | null;
  title: string | null;
  fileName: string | null;
  revisionNo: string | null;
  issueDate: string | null;
  createDate: string | null;
  uploadDate: string | null;
  fileSize: number | null;
  createdBy: string | null;
  uploadBy: string | null;
  docTag: string | null;
  /** Direct download/preview URL from UNIFIER_DM_NODE.UUU_DOC_ATTRIBUTE_URL */
  downloadUrl: string | null;
  /** Raw NODE_TYPE value from UNIFIER_DM_NODE (numeric type code) */
  nodeType: string | null;
}

// Minimal set that works with UNIFIER_DM_FILE_VIEW (full set caused PDS errors).
// Add more columns via metadata?columns=UNIFIER_DM_FILE_VIEW if needed.
export const UNIFIER_DM_FILE_VIEW_COLUMNS: string[] = [
  "ID",
  "PROJECT_ID",
  "STATUS",
  "TITLE",
  "FILE_NAME",
  "REVISION_NO",
  "UPLOAD_DATE",
  "FILE_SIZE",
  "UUU_UPLOAD_BY",
];

// Raw row shape returned by UNIFIER_DM_NODE
export interface UnifierDmNodeRaw {
  ID?: number | string | null;
  PARENT_ID?: number | string | null;
  PROJECT_ID?: number | string | null;
  NODE_NAME?: string | null;
  NODE_TYPE?: number | string | null;
  UUU_DOC_ATTRIBUTE_URL?: string | null;
  DESCRIPTION?: string | null;
}

export const UNIFIER_DM_NODE_COLUMNS: string[] = [
  "ID",
  "PARENT_ID",
  "PROJECT_ID",
  "NODE_NAME",
  "NODE_TYPE",
  "UUU_DOC_ATTRIBUTE_URL",
  "DESCRIPTION",
];
