/** Section keys for field daily report snapshots and comments. */
export type FieldDailyReportSectionKey =
  | "progress"
  | "statusUpdates"
  | "subcontractors"
  | "teamsOnSite"
  | "inspections"
  | "issues"
  | "observations"
  | "other";

export interface FieldDailyReportProgressSnapshot {
  statusChangeCount: number;
  installCompleteCount: number;
  installCompleteQtyToday: number;
  /** Net scopes marked Install Complete-Verified today (positive) minus reverts (negative). */
  installCompleteVerifiedUnitDelta: number;
  inspectionSubmittedCount: number;
  issuesCreatedCount: number;
  issuesResolvedCount: number;
  observationsCreatedCount: number;
  /** Live project % install-complete (qty-based) at generation time. */
  pctComplete?: number;
  /** Estimated points gained today from install-complete qty. */
  pctCompleteDelta?: number | null;
  /** % complete at start of report day (derived from pctComplete − delta). */
  pctCompleteAtStartOfDay?: number;
  totalScopeQty?: number;
}

export interface FieldDailyReportStatusUnitEntryAttachment {
  id: string;
  storageUrl: string;
  storageKey?: string | null;
  mimeType: string;
  caption?: string | null;
}

export interface FieldDailyReportStatusUnitEntry {
  locationLabel: string;
  building?: string;
  level?: string;
  unit?: string;
  scopeName?: string;
  activityLogIds: string[];
  /** Project row id when present on the source activity event. */
  rowId?: string;
  /** Install team / subcontractor assigned to the unit (hydrated at read time). */
  subcontractorLabel?: string;
  /** Status-update album photos for this unit/scope on the report day (hydrated at read time). */
  statusUpdateAttachments?: FieldDailyReportStatusUnitEntryAttachment[];
}

import type { IssueSummary, ObsSummary } from "@/components/projects/UnitCards";
import type { ScopeStage, ScopeStatus } from "@/lib/unit-scope-progress";

export interface FieldDailyReportStatusGroup {
  id: string;
  /** Primary heading — e.g. "Install: In Progress". */
  statusLabel: string;
  scopeStage?: ScopeStage | string;
  scopeStatus?: ScopeStatus | string;
  unitEntries: FieldDailyReportStatusUnitEntry[];
  /** @deprecated Legacy snapshots; prefer statusLabel + unitEntries. */
  headline?: string;
  locationLabel?: string;
  sourceActivityLogIds: string[];
}

export interface FieldDailyReportStatusSourceEvent {
  activityLogId: string;
  createdAt: string;
  description: string;
  locationLabel?: string;
}

export interface FieldDailyReportSubcontractorGroup {
  id: string;
  /** Subcontractor display name, or a cleared label when unassigned. */
  subcontractorLabel: string;
  unitEntries: FieldDailyReportStatusUnitEntry[];
  sourceActivityLogIds: string[];
}

export interface FieldDailyReportInspectionGroup {
  id: string;
  outcome: string;
  items: FieldDailyReportListedItem[];
}

export interface FieldDailyReportListedItem {
  itemKey: string;
  activityLogId: string;
  createdAt: string;
  headline: string;
  locationLabel?: string;
  subline?: string;
  /** Issue notes or observation description from the live record. */
  bodyText?: string;
  badge?: string;
  entityId?: string;
  submissionId?: string;
  issueId?: string;
  observationId?: string;
  /** Hydrated on fetch for IssueLogRow rendering. */
  issueRecord?: IssueSummary;
  observationRecord?: ObsSummary;
  /** Embedded inspection photos (hydrated from submission payload). */
  attachments?: FieldDailyReportStatusUnitEntryAttachment[];
  /** Per-question deficiency / notes blocks for PDF export. */
  inspectionDetailBlocks?: FieldDailyReportInspectionDetailBlock[];
}

export interface FieldDailyReportInspectionDetailBlock {
  heading: string;
  lines: string[];
  attachments?: FieldDailyReportStatusUnitEntryAttachment[];
}

export interface FieldDailyReportProjectSnapshot {
  progress: FieldDailyReportProgressSnapshot;
  statusUpdates: {
    summaryGroups: FieldDailyReportStatusGroup[];
    sourceEvents: FieldDailyReportStatusSourceEvent[];
  };
  subcontractors: {
    summaryGroups: FieldDailyReportSubcontractorGroup[];
  };
  /** Subcontractors on site that day — units with status updates, grouped by assigned team. */
  teamsOnSite: {
    summaryGroups: FieldDailyReportSubcontractorGroup[];
  };
  inspections: { summaryGroups: FieldDailyReportInspectionGroup[] };
  issues: { items: FieldDailyReportListedItem[] };
  observations: { items: FieldDailyReportListedItem[] };
}

export interface FieldDailyReportSectionNoteAuthorDto {
  id: string;
  name: string;
  isInstallManager: boolean;
  roleCode: string;
}

export interface FieldDailyReportSectionNoteReplyDto {
  id: string;
  body: string;
  author: FieldDailyReportSectionNoteAuthorDto;
  createdAt: string;
  editedAt: string | null;
}

export interface FieldDailyReportSectionNoteDto {
  id: string;
  sectionKey: FieldDailyReportSectionKey;
  itemKey: string;
  body: string;
  author: FieldDailyReportSectionNoteAuthorDto;
  createdAt: string;
  editedAt: string | null;
  replies: FieldDailyReportSectionNoteReplyDto[];
}

export interface FieldDailyReportCommentDto {
  sectionKey: FieldDailyReportSectionKey;
  itemKey: string;
  body: string;
  updatedAt: string;
}

export interface FieldDailyReportDailyManpowerMetaDto {
  setAt: string;
  setBy: FieldDailyReportSectionNoteAuthorDto;
}

export interface FieldDailyReportDailyManpowerSavePayload {
  dailyManpower: number | null;
  dailyManpowerMeta: FieldDailyReportDailyManpowerMetaDto | null;
}

export interface FieldDailyReportProjectDto {
  projectId: string;
  projectName: string;
  snapshot: FieldDailyReportProjectSnapshot;
  /** Threaded section notes (new). */
  sectionNotes: FieldDailyReportSectionNoteDto[];
  /** Legacy overlay for PDF export — newest note body per section. */
  comments: FieldDailyReportCommentDto[];
  /** IM-entered daily headcount; null until filled for this report day. */
  dailyManpower?: number | null;
  /** Who set daily manpower and when; null when unset or legacy rows without audit fields. */
  dailyManpowerMeta?: FieldDailyReportDailyManpowerMetaDto | null;
  /** When this project's slice was last refreshed for the report day. */
  generatedAt?: string;
  activityThrough?: string;
  trigger?: "MANUAL" | "SCHEDULED";
}

export interface FieldDailyReportDto {
  id: string;
  reportDate: string;
  generatedAt: string;
  trigger: "MANUAL" | "SCHEDULED";
  activityThrough: string;
  projects: FieldDailyReportProjectDto[];
}
