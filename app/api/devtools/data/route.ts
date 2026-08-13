import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDevToolsAllowed, isRawSqlAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";
import { unlinkLocalFieldMediaKeys } from "@/lib/field-media-local";

const WHITELIST = [
  "Account",
  "ActivityLog",
  "ActivityLocationContext",
  "ApiKey",
  "AppAnnouncement",
  "AppAnnouncementDismissal",
  "BacklogItem",
  "BriefingFeedback",
  "BriefingRule",
  "BriefingSynthesis",
  "CanonicalScopeType",
  "ClearInspection",
  "ContentTranslation",
  "CostType",
  "DailyBriefing",
  "DesignTokenSnapshot",
  "EnvironmentVisit",
  "FeedbackComment",
  "FeedbackDuplicate",
  "FeedbackMention",
  "FeedbackReport",
  "FeedbackTour",
  "FieldDailyReport",
  "FieldDailyReportProject",
  "FieldDailyReportSectionNote",
  "FieldDailyReportSectionNoteReply",
  "FieldMediaUploadContext",
  "Form",
  "FormVersion",
  "InspectionAnswer",
  "InspectionAnswerMedia",
  "InspectionDeficiency",
  "InspectionDeficiencyMedia",
  "InspectionFormQuestion",
  "InspectionFormSection",
  "InspectionFormVersionQuestion",
  "InspectionFormVersionSection",
  "InspectionSubmission",
  "InspectionType",
  "InstallTeam",
  "Invite",
  "IssueComment",
  "IssueResponsiblePartyTag",
  "IssueScopeTag",
  "IssueSubScopeTag",
  "IssueTypeCatalog",
  "LayoutIssue",
  "LocationType",
  "MasqueradeLog",
  "MediaAttachment",
  "MediaCaptureContext",
  "Notification",
  "ObservationComment",
  "ObservationScopeTag",
  "ObservationTypeCatalog",
  "OfflinePreference",
  "OfflineProjectSync",
  "PasswordResetToken",
  "Permission",
  "Project",
  "ProjectCustomSiteLocation",
  "ProjectIssue",
  "ProjectNote",
  "ProjectObservation",
  "ProjectRow",
  "ProjectScopeOverride",
  "ProjectSiteGeocode",
  "ProjectSubScope",
  "ProjectSubScopeInstance",
  "Release",
  "ReleaseTour",
  "ReleaseTourStep",
  "ReleaseVerification",
  "ResponsiblePartyCatalog",
  "Role",
  "RolePermission",
  "ScopeType",
  "Session",
  "TestSeedBatch",
  "UomType",
  "User",
  "UserSpecialPermission",
  "UserProjectFavorite",
  "VerificationToken",
] as const;
type WhitelistTable = (typeof WHITELIST)[number];
const SORTED_TABLES = [...WHITELIST].sort((a, b) => a.localeCompare(b));

/** Maps display name to actual PostgreSQL table name. */
const TABLE_NAMES: Record<WhitelistTable, string> = {
  Account: "Account",
  ActivityLog: "activity_logs",
  ActivityLocationContext: "activity_location_contexts",
  ApiKey: "api_keys",
  AppAnnouncement: "app_announcements",
  AppAnnouncementDismissal: "app_announcement_dismissals",
  BacklogItem: "backlog_items",
  BriefingFeedback: "briefing_feedbacks",
  BriefingRule: "briefing_rules",
  BriefingSynthesis: "briefing_syntheses",
  CanonicalScopeType: "canonical_scope_types",
  ClearInspection: "clear_inspections",
  ContentTranslation: "content_translations",
  CostType: "cost_types",
  DailyBriefing: "daily_briefings",
  DesignTokenSnapshot: "DesignTokenSnapshot",
  EnvironmentVisit: "environment_visits",
  FeedbackComment: "feedback_comments",
  FeedbackDuplicate: "feedback_duplicates",
  FeedbackMention: "feedback_mentions",
  FeedbackReport: "feedback_reports",
  FeedbackTour: "feedback_tours",
  FieldDailyReport: "field_daily_reports",
  FieldDailyReportProject: "field_daily_report_projects",
  FieldDailyReportSectionNote: "field_daily_report_section_notes",
  FieldDailyReportSectionNoteReply: "field_daily_report_section_note_replies",
  FieldMediaUploadContext: "field_media_upload_context",
  Form: "forms",
  FormVersion: "form_versions",
  InspectionAnswer: "inspection_answers",
  InspectionAnswerMedia: "inspection_answer_media",
  InspectionDeficiency: "inspection_deficiencies",
  InspectionDeficiencyMedia: "inspection_deficiency_media",
  InspectionFormQuestion: "inspection_form_questions",
  InspectionFormSection: "inspection_form_sections",
  InspectionFormVersionQuestion: "inspection_form_version_questions",
  InspectionFormVersionSection: "inspection_form_version_sections",
  InspectionSubmission: "inspection_submissions",
  InspectionType: "inspection_types",
  InstallTeam: "install_teams",
  Invite: "Invite",
  IssueComment: "issue_comments",
  IssueResponsiblePartyTag: "issue_responsible_party_tags",
  IssueScopeTag: "issue_scope_tags",
  IssueSubScopeTag: "issue_sub_scope_tags",
  IssueTypeCatalog: "issue_type_catalog",
  LayoutIssue: "layout_issues",
  LocationType: "location_types",
  MasqueradeLog: "masquerade_logs",
  MediaAttachment: "media_attachments",
  MediaCaptureContext: "media_capture_context",
  Notification: "notifications",
  ObservationComment: "observation_comments",
  ObservationScopeTag: "observation_scope_tags",
  ObservationTypeCatalog: "observation_type_catalog",
  OfflinePreference: "OfflinePreference",
  OfflineProjectSync: "offline_project_syncs",
  PasswordResetToken: "password_reset_tokens",
  Permission: "permissions",
  Project: "Project",
  ProjectCustomSiteLocation: "project_custom_site_locations",
  ProjectIssue: "project_issues",
  ProjectNote: "project_notes",
  ProjectObservation: "project_observations",
  ProjectRow: "project_rows",
  ProjectScopeOverride: "project_scope_overrides",
  ProjectSiteGeocode: "project_site_geocodes",
  ProjectSubScope: "project_sub_scopes",
  ProjectSubScopeInstance: "project_sub_scope_instances",
  Release: "releases",
  ReleaseTour: "release_tours",
  ReleaseTourStep: "release_tour_steps",
  ReleaseVerification: "release_verifications",
  ResponsiblePartyCatalog: "responsible_party_catalog",
  Role: "roles",
  RolePermission: "role_permissions",
  ScopeType: "scope_types",
  Session: "Session",
  TestSeedBatch: "test_seed_batches",
  UomType: "uom_types",
  User: "User",
  UserSpecialPermission: "user_special_permissions",
  UserProjectFavorite: "user_project_favorites",
  VerificationToken: "VerificationToken",
};

/** Column config per table: default sort, searchable columns, exclude columns (e.g. passwordHash). */
const TABLE_CONFIG: Record<
  WhitelistTable,
  { defaultSort: string; searchCols: string[]; excludeCols?: string[] }
> = {
  // id included in searchCols for all FK-target tables so navigating from a FK chip
  // (which sets search = the FK value) returns the exact referenced record.

  Account: {
    defaultSort: "provider",
    searchCols: ["id", "userId", "provider", "providerAccountId", "type"],
    excludeCols: ["refresh_token", "access_token", "id_token", "session_state"],
  },
  ActivityLog: {
    defaultSort: "createdAt",
    searchCols: ["id", "projectId", "userId", "userName", "eventType"],
  },
  ActivityLocationContext: {
    defaultSort: "createdAt",
    searchCols: ["activityLogId", "gpsStatus", "source"],
  },
  ApiKey: {
    defaultSort: "createdAt",
    searchCols: ["id", "name", "keyPrefix", "createdById", "assignedToId", "party"],
    excludeCols: ["keyHash"],
  },
  AppAnnouncement: {
    defaultSort: "createdAt",
    searchCols: ["id", "slug", "titleEn", "titleEs", "createdBy"],
  },
  AppAnnouncementDismissal: {
    defaultSort: "dismissedAt",
    searchCols: ["id", "announcementId", "userId"],
  },
  BacklogItem: { defaultSort: "createdAt", searchCols: ["id", "userId", "title"] },
  BriefingFeedback: {
    defaultSort: "createdAt",
    searchCols: ["id", "briefingId", "userId", "section", "itemKey", "feedbackType"],
    excludeCols: ["aiRevision"],
  },
  BriefingRule: { defaultSort: "createdAt", searchCols: ["id", "createdBy", "source"] },
  BriefingSynthesis: { defaultSort: "generatedAt", searchCols: ["id", "generatedBy"], excludeCols: ["report"] },
  CanonicalScopeType: { defaultSort: "sort_order", searchCols: ["id", "code", "display_name"] },
  ClearInspection: {
    defaultSort: "createdAt",
    searchCols: ["id", "rowId", "status", "inspectionTypeId", "inspectedById"],
  },
  ContentTranslation: {
    defaultSort: "createdAt",
    searchCols: ["id", "contentId", "contentType", "sourceLang", "targetLang"],
    excludeCols: ["translated"],
  },
  CostType: { defaultSort: "code", searchCols: ["id", "code", "name"] },
  DailyBriefing: { defaultSort: "dateFor", searchCols: ["id", "generatedBy"], excludeCols: ["report"] },
  DesignTokenSnapshot: { defaultSort: "savedAt", searchCols: ["savedById", "savedByName"] },
  // EnvironmentVisit has composite PK (userId, environment) — no single id column
  EnvironmentVisit: { defaultSort: "lastVisitedAt", searchCols: ["userId", "environment"] },
  FeedbackComment: { defaultSort: "createdAt", searchCols: ["id", "feedbackReportId", "authorId"] },
  FeedbackDuplicate: { defaultSort: "createdAt", searchCols: ["id", "canonicalId", "duplicateId"] },
  FeedbackMention: { defaultSort: "createdAt", searchCols: ["id", "feedbackReportId", "mentionedUserId", "sourceCommentId"] },
  FeedbackReport: {
    defaultSort: "createdAt",
    searchCols: ["id", "title", "description", "userId", "assigneeId", "priority"],
    excludeCols: ["screenshot"],
  },
  FeedbackTour: { defaultSort: "createdAt", searchCols: ["id", "feedbackId"], excludeCols: ["steps"] },
  FieldDailyReport: {
    defaultSort: "generatedAt",
    searchCols: ["id", "installManagerUserId", "generatedByUserId", "trigger"],
  },
  FieldDailyReportSectionNote: {
    defaultSort: "createdAt",
    searchCols: ["id", "fieldDailyReportProjectId", "sectionKey", "itemKey", "authorUserId"],
  },
  FieldDailyReportSectionNoteReply: {
    defaultSort: "createdAt",
    searchCols: ["id", "noteId", "authorUserId"],
  },
  FieldDailyReportProject: {
    defaultSort: "projectId",
    searchCols: ["id", "fieldDailyReportId", "projectId"],
    excludeCols: ["snapshot"],
  },
  FieldMediaUploadContext: {
    defaultSort: "captureRecordedAt",
    searchCols: ["id", "storageKey", "captureProjectId"],
  },
  Form: {
    defaultSort: "createdAt",
    searchCols: ["id", "name", "description", "status", "level", "category", "createdById"],
    excludeCols: ["draftSections"],
  },
  FormVersion: {
    defaultSort: "publishedAt",
    searchCols: ["id", "formId", "versionNumber", "publishedById"],
    excludeCols: ["sections"],
  },
  InspectionAnswer: {
    defaultSort: "createdAt",
    searchCols: ["id", "inspectionSubmissionId", "formVersionQuestionId", "questionId", "choiceValue"],
    excludeCols: ["rawAnswer", "textValue"],
  },
  InspectionAnswerMedia: {
    defaultSort: "createdAt",
    searchCols: ["id", "inspectionAnswerId", "storageKey", "mimeType"],
    excludeCols: ["storageUrl", "localUrl", "imageAnnotation"],
  },
  InspectionDeficiency: {
    defaultSort: "createdAt",
    searchCols: ["id", "inspectionAnswerId", "sourceDeficiencyId", "severity"],
  },
  InspectionDeficiencyMedia: {
    defaultSort: "createdAt",
    searchCols: ["id", "inspectionDeficiencyId", "storageKey", "mimeType"],
    excludeCols: ["storageUrl", "localUrl", "imageAnnotation"],
  },
  InspectionFormQuestion: {
    defaultSort: "displayOrder",
    searchCols: ["id", "formId", "sectionId", "sourceQuestionId", "sourceSectionId", "title", "responseType", "sourceParentQuestionId"],
    excludeCols: ["rawQuestion"],
  },
  InspectionFormSection: {
    defaultSort: "displayOrder",
    searchCols: ["id", "formId", "sourceSectionId", "title"],
  },
  InspectionFormVersionQuestion: {
    defaultSort: "displayOrder",
    searchCols: ["id", "formVersionId", "sectionId", "sourceQuestionId", "sourceSectionId", "title", "responseType", "sourceParentQuestionId"],
    excludeCols: ["rawQuestion"],
  },
  InspectionFormVersionSection: {
    defaultSort: "displayOrder",
    searchCols: ["id", "formVersionId", "sourceSectionId", "title"],
  },
  InspectionSubmission: {
    defaultSort: "submittedAt",
    searchCols: ["id", "formId", "formVersionId", "projectId", "unitId", "scopeRowId", "outcome", "source"],
    excludeCols: ["templateSnapshot", "payload"],
  },
  InspectionType: { defaultSort: "code", searchCols: ["id", "code", "name"] },
  InstallTeam: { defaultSort: "code", searchCols: ["id", "code", "name"] },
  Invite: { defaultSort: "createdAt", searchCols: ["id", "email", "token"] },
  IssueComment: {
    defaultSort: "createdAt",
    searchCols: ["id", "issueId", "authorId"],
  },
  IssueResponsiblePartyTag: {
    defaultSort: "issueId",
    searchCols: ["id", "issueId", "partyCode"],
  },
  IssueScopeTag: {
    defaultSort: "issueId",
    searchCols: ["id", "issueId", "projectRowId"],
  },
  IssueSubScopeTag: {
    defaultSort: "issueId",
    searchCols: ["id", "issueId", "subScopeInstanceId"],
  },
  IssueTypeCatalog: {
    defaultSort: "sortOrder",
    searchCols: ["id", "code", "displayName"],
  },
  LayoutIssue: { defaultSort: "createdAt", searchCols: ["id", "description", "device", "platform", "route"], excludeCols: ["screenshot"] },
  LocationType: { defaultSort: "code", searchCols: ["id", "code", "name"] },
  MasqueradeLog: { defaultSort: "startedAt", searchCols: ["id", "actorId", "targetUserId"] },
  MediaAttachment: {
    defaultSort: "createdAt",
    searchCols: ["id", "issueId", "observationId", "issueCommentId", "observationCommentId", "uploadedById", "mimeType"],
    excludeCols: ["transcriptOriginal", "transcriptEnglish"],
  },
  MediaCaptureContext: {
    defaultSort: "captureRecordedAt",
    searchCols: ["id", "mediaAttachmentId", "captureProjectId", "gpsStatus"],
  },
  Notification: { defaultSort: "createdAt", searchCols: ["id", "userId", "feedbackId"] },
  ObservationComment: {
    defaultSort: "createdAt",
    searchCols: ["id", "observationId", "authorId"],
  },
  ObservationScopeTag: {
    defaultSort: "observationId",
    searchCols: ["id", "observationId", "projectRowId"],
  },
  ObservationTypeCatalog: {
    defaultSort: "sortOrder",
    searchCols: ["id", "code", "displayName"],
  },
  OfflinePreference: { defaultSort: "userId", searchCols: ["userId"] },
  OfflineProjectSync: { defaultSort: "syncedAt", searchCols: ["id", "userId", "projectId"] },
  PasswordResetToken: { defaultSort: "createdAt", searchCols: ["id", "userId"], excludeCols: ["tokenHash"] },
  Permission: { defaultSort: "code", searchCols: ["id", "code", "name"] },
  Project: {
    defaultSort: "createdAt",
    searchCols: ["id", "unifierPid", "installManagerName", "installManagerId", "projectManagerId", "isTestProject"],
  },
  ProjectCustomSiteLocation: {
    defaultSort: "createdAt",
    searchCols: ["id", "projectId", "name", "building", "level", "placement", "createdById"],
  },
  ProjectIssue: {
    defaultSort: "createdAt",
    searchCols: ["id", "projectId", "unitRef", "shortDescription", "createdById", "resolvedById"],
  },
  ProjectNote: {
    defaultSort: "createdAt",
    searchCols: ["id", "projectId", "authorId", "body"],
  },
  ProjectObservation: {
    defaultSort: "createdAt",
    searchCols: ["id", "projectId", "unitRef", "description", "authorId"],
  },
  ProjectRow: { defaultSort: "rowIndex", searchCols: ["id", "projectId", "building", "level", "unit", "unitType", "scopeTypeId"] },
  ProjectScopeOverride: {
    defaultSort: "createdAt",
    searchCols: ["id", "projectId", "scopeTypeId", "canonicalScopeTypeId"],
  },
  ProjectSiteGeocode: {
    defaultSort: "updatedAt",
    searchCols: ["id", "projectId", "siteLocation", "status"],
  },
  ProjectSubScope: {
    defaultSort: "projectId",
    searchCols: ["id", "projectId", "scopeTypeId", "unitType", "name", "createdById"],
  },
  ProjectSubScopeInstance: {
    defaultSort: "subScopeId",
    searchCols: ["id", "subScopeId", "rowId"],
  },
  Release: {
    defaultSort: "mergedAt",
    searchCols: ["id", "title", "branch", "environment"],
    excludeCols: ["changes", "verificationSteps"],
  },
  ReleaseTour: { defaultSort: "createdAt", searchCols: ["id", "releaseId"] },
  ReleaseTourStep: { defaultSort: "order", searchCols: ["id", "tourId", "title", "pageUrl"] },
  ReleaseVerification: { defaultSort: "verifiedAt", searchCols: ["id", "releaseId", "userId", "environment"] },
  ResponsiblePartyCatalog: {
    defaultSort: "sortOrder",
    searchCols: ["id", "code", "displayName"],
  },
  User: { defaultSort: "email", searchCols: ["id", "email", "name"], excludeCols: ["passwordHash"] },
  Role: { defaultSort: "code", searchCols: ["id", "code", "name"] },
  RolePermission: { defaultSort: "roleId", searchCols: ["roleId", "permissionId"] },
  ScopeType: { defaultSort: "code", searchCols: ["id", "code", "name", "canonical_scope_type_id"] },
  Session: { defaultSort: "expires", searchCols: ["id", "userId"], excludeCols: ["sessionToken"] },
  TestSeedBatch: {
    defaultSort: "createdAt",
    searchCols: ["id", "projectId", "createdById"],
    excludeCols: ["config", "counts"],
  },
  UomType: { defaultSort: "code", searchCols: ["id", "code", "name"] },
  UserSpecialPermission: { defaultSort: "grantedAt", searchCols: ["id", "userId", "permission", "note"] },
  UserProjectFavorite: { defaultSort: "createdAt", searchCols: ["id", "userId", "projectId"] },
  VerificationToken: { defaultSort: "expires", searchCols: ["identifier"], excludeCols: ["token"] },
};

// ── Filter types ──────────────────────────────────────────────────────────────

export type FilterOp =
  | "=" | "!=" | ">" | ">=" | "<" | "<="
  | "contains" | "starts_with" | "ends_with"
  | "is_null" | "is_not_null";

export interface ColumnFilter {
  column: string;
  op: FilterOp;
  value: string;
}

// ── WHERE clause builder ───────────────────────────────────────────────────────

/**
 * Builds a parameterized SQL WHERE fragment from column filters.
 * Columns are double-quoted and stripped of quotes to prevent injection.
 * Returns { sql, params } — params are appended BEFORE the limit/offset params.
 */
function buildFilterSQL(
  filters: ColumnFilter[],
  startParam: number
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let n = startParam;

  for (const f of filters) {
    const col = `"${f.column.replace(/"/g, "")}"`;
    switch (f.op) {
      case "=":
        parts.push(`${col}::text = $${n++}`);
        params.push(f.value);
        break;
      case "!=":
        parts.push(`${col}::text != $${n++}`);
        params.push(f.value);
        break;
      case ">":
        parts.push(`${col}::numeric > $${n++}::numeric`);
        params.push(f.value);
        break;
      case ">=":
        parts.push(`${col}::numeric >= $${n++}::numeric`);
        params.push(f.value);
        break;
      case "<":
        parts.push(`${col}::numeric < $${n++}::numeric`);
        params.push(f.value);
        break;
      case "<=":
        parts.push(`${col}::numeric <= $${n++}::numeric`);
        params.push(f.value);
        break;
      case "contains":
        parts.push(`${col}::text ILIKE $${n++}`);
        params.push(`%${f.value}%`);
        break;
      case "starts_with":
        parts.push(`${col}::text ILIKE $${n++}`);
        params.push(`${f.value}%`);
        break;
      case "ends_with":
        parts.push(`${col}::text ILIKE $${n++}`);
        params.push(`%${f.value}`);
        break;
      case "is_null":
        parts.push(`${col} IS NULL`);
        break;
      case "is_not_null":
        parts.push(`${col} IS NOT NULL`);
        break;
    }
  }

  return { sql: parts.join(" AND "), params };
}

// ── API handler ────────────────────────────────────────────────────────────────

// Dev-only endpoint — blocked unless NODE_ENV !== production or APP_ENV=dev (Railway dev).
export async function GET(request: NextRequest) {
  if (!isDevToolsAllowed()) {
    return NextResponse.json(
      { error: DEVTOOLS_BLOCKED_MESSAGE },
      { status: 403 }
    );
  }

  const authError = await requireDevToolsAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const search = searchParams.get("search")?.trim();
  const sort = searchParams.get("sort");
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  // Column filters — JSON array of { column, op, value }
  let columnFilters: ColumnFilter[] = [];
  const filtersParam = searchParams.get("filters");
  if (filtersParam) {
    try { columnFilters = JSON.parse(filtersParam) as ColumnFilter[]; } catch { /* ignore */ }
  }

  // Raw SQL WHERE clause — only permitted in non-prod environments.
  // isRawSqlAllowed() hard-blocks this in prod even when DEVTOOLS_ENABLED=true.
  const rawWhereParam = searchParams.get("rawWhere")?.trim() ?? "";
  const rawWhere = rawWhereParam && isRawSqlAllowed() ? rawWhereParam : "";

  // Table list (no table param)
  if (!table) {
    try {
      const tables = await Promise.all(
        SORTED_TABLES.map(async (name) => {
          const count = await getCountRaw(name);
          return { name, count };
        })
      );
      return NextResponse.json({ tables, rawSqlAllowed: isRawSqlAllowed() });
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to fetch tables: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }
  }

  // Table data
  if (!WHITELIST.includes(table as WhitelistTable)) {
    return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
  }

  try {
    const result = await getTableDataRaw(table as WhitelistTable, {
      page,
      limit,
      search: search || undefined,
      sort: sort || undefined,
      order,
      columnFilters,
      rawWhere: rawWhere || undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch data: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

type TableDataParams = {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  order: "asc" | "desc";
  columnFilters: ColumnFilter[];
  rawWhere?: string;
};

async function getCountRaw(table: WhitelistTable): Promise<number> {
  try {
    const tableName = TABLE_NAMES[table];
    const result = await db.$queryRawUnsafe<[{ count: string }]>(
      `SELECT COUNT(*)::text as count FROM "${tableName}"`
    );
    return parseInt(result[0]?.count ?? "0", 10);
  } catch {
    return 0;
  }
}

async function getTableDataRaw(
  table: WhitelistTable,
  params: TableDataParams
): Promise<{
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}> {
  const { page, limit, search, sort, order, columnFilters, rawWhere } = params;
  const skip = (page - 1) * limit;
  const tableName = TABLE_NAMES[table];
  const config = TABLE_CONFIG[table];

  const validSortCols = [
    ...config.searchCols,
    "id", "rowIndex", "createdAt", "updatedAt", "grantedAt",
    "startedAt", "lastVisitedAt", "mergedAt", "verifiedAt",
    "dateFor", "generatedAt", "order",
  ];
  const orderCol = sort && validSortCols.includes(sort) ? sort : config.defaultSort;
  const orderDir = order === "desc" ? "DESC" : "ASC";

  // ── Build WHERE clause from all conditions ──────────────────────────────
  const whereParts: string[] = [];
  const allParams: unknown[] = [];
  let nextParam = 1;

  // 1. Free-text search across searchCols
  if (search && config.searchCols.length > 0) {
    const pattern = `%${search}%`;
    const searchExpr = config.searchCols
      .map((c) => `"${c}"::text ILIKE $${nextParam}`)
      .join(" OR ");
    whereParts.push(`(${searchExpr})`);
    allParams.push(pattern);
    nextParam++;
  }

  // 2. Column-level filters
  if (columnFilters.length > 0) {
    const { sql, params: fParams } = buildFilterSQL(columnFilters, nextParam);
    if (sql) {
      whereParts.push(`(${sql})`);
      allParams.push(...fParams);
      nextParam += fParams.length;
    }
  }

  // 3. Raw WHERE clause (verbatim — admin-only dev tool, trusted input)
  if (rawWhere) {
    whereParts.push(`(${rawWhere})`);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  // Limit and offset are always the last two params
  const limitParam = nextParam;
  const offsetParam = nextParam + 1;
  const queryParams = [...allParams, limit, skip];
  const countParams = [...allParams];

  const [rows, countResult] = await Promise.all([
    db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${tableName}" ${whereClause} ORDER BY "${orderCol}" ${orderDir} LIMIT $${limitParam} OFFSET $${offsetParam}`,
      ...queryParams
    ),
    db.$queryRawUnsafe<[{ count: string }]>(
      `SELECT COUNT(*)::text as count FROM "${tableName}" ${whereClause}`,
      ...countParams
    ),
  ]);

  const total = parseInt(countResult[0]?.count ?? "0", 10);

  const serialized = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (config.excludeCols?.includes(k)) continue;
      if (v instanceof Date) {
        out[k] = v.toISOString();
      } else if (
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        typeof (v as { toISOString?: () => string }).toISOString !== "function"
      ) {
        const str = JSON.stringify(v);
        out[k] = str.length > 200 ? str.slice(0, 200) + "…" : str;
      } else {
        out[k] = v;
      }
    }
    return out;
  });

  const columns =
    serialized.length > 0
      ? Object.keys(serialized[0])
      : table === "Project"
        ? ["id", "unifierPid", "createdAt"]
        : ["id"];

  return { table, columns, rows: serialized, total, page, limit };
}

// ── DELETE handler ─────────────────────────────────────────────────────────────

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (url) return url.replace(/\/$/, "");
  const dbUrl = process.env.DATABASE_URL ?? "";
  const match = dbUrl.match(/postgres\.([a-z0-9]+):/);
  if (match) return `https://${match[1]}.supabase.co`;
  throw new Error("SUPABASE_URL not set");
}

async function purgeStorageKeys(keys: string[]): Promise<void> {
  if (!keys.length) return;
  await unlinkLocalFieldMediaKeys(keys);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) return;
  let supabaseUrl: string;
  try {
    supabaseUrl = getSupabaseUrl();
  } catch {
    return;
  }
  // Supabase Storage batch delete
  await fetch(`${supabaseUrl}/storage/v1/object`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: keys }),
  }).catch((err) => {
    console.error("[devtools/data DELETE] Storage purge failed:", err);
  });
}

/** Collects all storageKey values on MediaAttachment rows linked to a parent record. */
async function collectAttachmentKeys(table: WhitelistTable, id: string): Promise<string[]> {
  const where: Record<string, string> = {};
  if (table === "ProjectIssue") where.issueId = id;
  else if (table === "IssueComment") where.issueCommentId = id;
  else if (table === "ProjectObservation") where.observationId = id;
  else if (table === "ObservationComment") where.observationCommentId = id;
  else return [];

  const attachments = await db.mediaAttachment.findMany({
    where,
    select: { storageKey: true },
  });
  return attachments.map((a) => a.storageKey);
}

export async function DELETE(request: NextRequest) {
  if (!isDevToolsAllowed()) {
    return NextResponse.json({ error: DEVTOOLS_BLOCKED_MESSAGE }, { status: 403 });
  }
  const authError = await requireDevToolsAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table");
  const id = searchParams.get("id");

  if (!table || !id) {
    return NextResponse.json({ error: "table and id are required" }, { status: 400 });
  }
  if (!WHITELIST.includes(table as WhitelistTable)) {
    return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
  }

  const whitelistTable = table as WhitelistTable;

  try {
    // Purge Supabase Storage objects before DB delete for media-owning tables
    const storageKeys = await collectAttachmentKeys(whitelistTable, id);
    if (storageKeys.length) {
      await purgeStorageKeys(storageKeys);
    }

    // If deleting a MediaAttachment directly, purge its own storageKey too
    if (whitelistTable === "MediaAttachment") {
      const attachment = await db.mediaAttachment.findUnique({
        where: { id },
        select: { storageKey: true },
      });
      if (attachment) await purgeStorageKeys([attachment.storageKey]);
    }

    const tableName = TABLE_NAMES[whitelistTable];
    await db.$executeRawUnsafe(`DELETE FROM "${tableName}" WHERE "id" = $1`, id);

    return NextResponse.json({ deleted: true, table, id });
  } catch (err) {
    return NextResponse.json(
      { error: `Delete failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
