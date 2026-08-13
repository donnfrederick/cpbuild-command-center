import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "biDocs" });
  return { title: `${t("pageTitle")} — CP Build` };
}

// ─── Section & table styles ─────────────────────────────────────────────────

const sectionStyle = {
  backgroundColor: "var(--neutral-0)",
  border: "1px solid var(--neutral-200)",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
  marginBottom: "var(--space-6)",
};

const sectionHeaderStyle = {
  padding: "var(--space-4) var(--space-5)",
  borderBottom: "1px solid var(--neutral-100)",
  backgroundColor: "var(--neutral-50)",
};

const codeStyle = {
  fontFamily: "monospace",
  fontSize: "0.85em",
  backgroundColor: "var(--neutral-100)",
  padding: "2px 6px",
  borderRadius: "var(--radius-xs)",
  color: "var(--neutral-800)",
};

const tableCellStyle = {
  padding: "var(--space-2) var(--space-4)",
  fontSize: "var(--text-body-sm)",
  borderBottom: "1px solid var(--neutral-100)",
  verticalAlign: "top" as const,
};

const tableHeadStyle = {
  ...tableCellStyle,
  fontWeight: 600,
  color: "var(--neutral-600)",
  backgroundColor: "var(--neutral-50)",
  borderBottom: "2px solid var(--neutral-200)",
};

// ─── Table schemas ───────────────────────────────────────────────────────────
// i18n skip: TABLES, QUERIES, and entity-relationship strings below are
// schema documentation (column names, SQL identifiers, query titles) — they are
// technical reference content intentionally kept in English, not localised UI labels.
// Rationale: translating SQL identifiers or technical schema names would make the
// docs less useful for engineers connecting to the DB in any language.

const TABLES = [
  {
    table: "User",
    sqlTable: "User",
    description: "All team members with their roles, login status, and metadata. Central FK in most tables.",
    columns: [
      { name: "id", type: "text", notes: "Primary key (CUID)" },
      { name: "email", type: "text", notes: "Unique login email" },
      { name: "name", type: "text?", notes: "Display name" },
      { name: "roleId", type: "text → roles.id", notes: "Foreign key to roles table" },
      { name: "status", type: "ACTIVE | INACTIVE", notes: "" },
      { name: "lastLoginAt", type: "timestamp?", notes: "" },
      { name: "createdAt", type: "timestamp", notes: "" },
    ],
    notes: "passwordHash is not readable by bi_reader. Join roles via roleId. SQL table name is quoted: \"User\" (not user or user_special_permissions).",
  },
  {
    table: "Role",
    sqlTable: "roles",
    description: "User role definitions. Codes: ADMIN, MEMBER, INSTALL_MANAGER, INSTALL_DIRECTOR, PROJECT_MANAGER, PROJECT_COORDINATOR, CONTROLS_MANAGER, TEAM_LEAD, DESIGNER, DEVELOPER, PRODUCT, EXECUTIVE, BI_ANALYST.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "code", type: "text", notes: "Unique role identifier (e.g. INSTALL_MANAGER)" },
      { name: "name", type: "text", notes: "Human-readable role name" },
    ],
    notes: "",
  },
  {
    table: "Project",
    sqlTable: '"Project"',
    description: "Top-level construction projects. Core identifier is unifierPid — metadata (name, PM, dates) lives in Oracle Unifier, not in this table. Use the REST API /api/bi/v1/projects to get enriched project data with Unifier fields merged in.",
    columns: [
      { name: "id", type: "text", notes: "PK (CUID)" },
      { name: "unifierPid", type: "text?", notes: "Unique Oracle Unifier shell PID — the real project identifier" },
      { name: "installManagerId", type: "text? → User.id", notes: "Assigned install manager" },
      { name: "installManagerName", type: "text?", notes: "Denormalized name for display" },
      { name: "projectManagerId", type: "text? → User.id", notes: "Assigned PM (may differ from Unifier PM)" },
      { name: "isTestProject", type: "boolean", notes: "True = internal sandbox; exclude from analysis unless whitelisted on a BI API key" },
      { name: "clonedFromProjectId", type: "text? → Project.id", notes: "Set when Admin duplicated a live project as a test sandbox" },
      { name: "sourceUnifierPid", type: "text?", notes: "Original Unifier PID from the source project (display merge only)" },
      { name: "deletedAt", type: "timestamp?", notes: "Soft delete — exclude rows where this is not null" },
      { name: "createdAt / updatedAt", type: "timestamp", notes: "" },
    ],
    notes: "⚠️ Project name, site location, phase, start date, lifecycle status come from the Unifier API, not from this table. Use the BI REST API endpoints to get those fields merged in.",
  },
  {
    table: "ProjectRow",
    sqlTable: "project_rows",
    description: "Field Tracker / Unit Plan Matrix (UPM) rows — one row per (unit × scope type). This is the core operational data: tracks stage, status, and inspection for every scope of work in every unit. Typically thousands of rows per project.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "projectId", type: 'text → "Project".id', notes: "" },
      { name: "rowIndex", type: "int", notes: "Original spreadsheet row order" },
      { name: "building", type: "text", notes: "" },
      { name: "level", type: "text", notes: "" },
      { name: "unit", type: "text", notes: "" },
      { name: "area", type: "text", notes: "" },
      { name: "shipPhase / buildPhase", type: "text", notes: "Scheduling phases" },
      { name: "scheme / unitType", type: "text", notes: "" },
      { name: "scopeTypeId", type: "text? → scope_types.id", notes: "Type of work (tile, countertop, etc.)" },
      { name: "csiPrimeCode / csiDetailCode", type: "text", notes: "CSI division codes (2-digit and 6-digit)" },
      { name: "qty / unitRate / budgetedManHours", type: "decimal?", notes: "Quantities and budgets" },
      { name: "startDate / finishDate", type: "timestamp?", notes: "Scheduled dates for this row" },
      { name: "percentComplete / actualManHours", type: "decimal?", notes: "" },
      { name: "scopeStage", type: "enum?", notes: "STAGING | ASSEMBLY | INSTALL" },
      { name: "scopeStatus", type: "enum?", notes: "NOT_STARTED | IN_PROGRESS | COMPLETE | BLOCKED" },
      { name: "inspectionStatus", type: "enum?", notes: "READY | PASSED | FAILED (set when INSTALL+COMPLETE)" },
    ],
    notes: "Most useful table for tracking project progress. Filter isTestProject=false on the joined Project table.",
  },
  {
    table: "ScopeType",
    sqlTable: "scope_types",
    description: "Lookup for raw scope type codes used in project_rows (e.g. 'TILE', 'CPB', 'CTT'). Linked to canonical_scope_types for standardized names.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "code", type: "text", notes: "Raw abbreviation from the upload (e.g. TILE)" },
      { name: "name", type: "text", notes: "Full name" },
      { name: "canonicalScopeTypeId", type: "text? → canonical_scope_types.id", notes: "Standard lookup" },
    ],
    notes: "",
  },
  {
    table: "ProjectIssue",
    sqlTable: "project_issues",
    description: "Issues logged against a project — blocking and non-blocking problems tracked through to resolution.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "projectId", type: "text → projects.id", notes: "" },
      { name: "unitRef", type: "text?", notes: "Unit reference string (e.g. Building A / Level 2 / Unit 205)" },
      { name: "shortDescription", type: "text", notes: "" },
      { name: "issueType", type: "enum", notes: "MATERIAL | LABOR | ACCESS | DESIGN | SEQUENCING | QUALITY | SAFETY | OTHER" },
      { name: "responsibleParty", type: "enum", notes: "CP_BUILD | GC | OWNER | ARCHITECT | SUBCONTRACTOR | SUPPLIER | OTHER" },
      { name: "isBlockingWork", type: "boolean", notes: "Whether this prevents other work from proceeding" },
      { name: "status", type: "OPEN | RESOLVED", notes: "" },
      { name: "resolvedAt", type: "timestamp?", notes: "" },
      { name: "createdById / resolvedById", type: "text → User.id", notes: "" },
      { name: "createdAt", type: "timestamp", notes: "" },
    ],
    notes: "",
  },
  {
    table: "ProjectObservation",
    sqlTable: "project_observations",
    description: "Field observations — what was seen in the field, often tied to a unit or scope.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "projectId", type: "text → projects.id", notes: "" },
      { name: "unitRef", type: "text?", notes: "Unit reference" },
      { name: "title", type: "text", notes: "" },
      { name: "description", type: "text", notes: "" },
      { name: "observationType", type: "enum", notes: "POSITIVE | CONCERN | CRITICAL" },
      { name: "authorId", type: "text → User.id", notes: "" },
      { name: "createdAt", type: "timestamp", notes: "" },
    ],
    notes: "",
  },
  {
    table: "ActivityLog",
    sqlTable: "activity_logs",
    description: "Append-only audit log of key in-app actions. Every status update, issue creation/resolution, etc. creates a row.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "projectId", type: "text → projects.id", notes: "" },
      { name: "userId", type: "text? → User.id", notes: "Who triggered the event" },
      { name: "userName", type: "text?", notes: "Denormalized — preserved even if user is renamed/deleted" },
      { name: "eventType", type: "enum", notes: "SCOPE_STATUS_UPDATED | SCOPE_STATUS_BULK_UPDATED | ISSUE_CREATED | ISSUE_RESOLVED | ISSUE_REOPENED | OBSERVATION_CREATED | CLEAR_INSPECTION_SET | ISSUE_BULK_CREATED" },
      { name: "metadata", type: "JSON", notes: "Event-specific payload — e.g. { rowId, oldStatus, newStatus } for status updates" },
      { name: "createdAt", type: "timestamp", notes: "" },
    ],
    notes: "Order by createdAt DESC. The metadata JSON shape varies by eventType.",
  },
  {
    table: "MediaAttachment",
    sqlTable: "media_attachments",
    description: "Every photo, video, or audio file attached to an issue, observation, or unit album. Polymorphic — exactly one of issueId, observationId, or unitPhotoProjectId is non-null.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "storageKey", type: "text", notes: "Supabase Storage path (e.g. field-media/issues/abc123.jpg)" },
      { name: "storageUrl", type: "text", notes: "Signed URL valid for 1 year — open directly in a browser or any HTTP client" },
      { name: "mimeType", type: "text", notes: "image/jpeg, video/mp4, audio/webm, etc." },
      { name: "fileSizeBytes", type: "int?", notes: "" },
      { name: "durationSeconds", type: "float?", notes: "Video/audio only" },
      { name: "caption", type: "text?", notes: "Optional per-file description typed by the uploader" },
      { name: "transcriptStatus", type: "NONE | PENDING | COMPLETE | ERROR", notes: "" },
      { name: "transcriptEnglish", type: "text?", notes: "English transcription of audio/video — populated after user triggers transcription" },
      { name: "issueId", type: "text? → project_issues.id", notes: "Set if attached to an issue — all others null" },
      { name: "observationId", type: "text? → project_observations.id", notes: "Set if attached to an observation" },
      { name: "unitPhotoProjectId + unitPhotoUnitRef", type: "text?", notes: "Set for unit album photos. unitPhotoUnitRef format: 'Building|Level|Unit'" },
      { name: "uploadedById", type: "text → User.id", notes: "" },
      { name: "createdAt", type: "timestamp", notes: "" },
    ],
    notes: "storageUrl is a signed URL — no additional authentication required to open or download the file. URLs expire after 1 year.",
  },
  {
    table: "FeedbackReport",
    sqlTable: "feedback_reports",
    description: "User-submitted feedback: bugs and feature requests. Submitted in-app or via Marker.io. Soft-delete via status=DELETED.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "shortId", type: "int", notes: "Sequential ref — displayed as FB-0042" },
      { name: "userId", type: "text → User.id", notes: "Who submitted it" },
      { name: "assigneeId", type: "text? → User.id", notes: "Admin assigned to triage" },
      { name: "type", type: "BUG | FEATURE_REQUEST", notes: "" },
      { name: "title / description", type: "text", notes: "" },
      { name: "status", type: "OPEN | IN_PROGRESS | WAITING_FOR_RESPONSE | NEEDS_INVESTIGATION | WONT_FIX | RESOLVED | DELETED", notes: "" },
      { name: "priority", type: "LOW | MEDIUM | HIGH | null", notes: "" },
      { name: "source", type: "IN_APP | MARKER_IO", notes: "" },
      { name: "pageUrl / videoUrl", type: "text?", notes: "Page where feedback was submitted; optional recording URL" },
      { name: "adminNote", type: "text?", notes: "Internal triage/resolution note visible only to admins" },
      { name: "createdAt / updatedAt", type: "timestamp", notes: "" },
    ],
    notes: "Filter status != 'DELETED' for active reports. screenshot column contains base64 data — exclude from BI queries.",
  },
  {
    table: "FeedbackComment",
    sqlTable: "feedback_comments",
    description: "Threaded comments on feedback reports. Soft-deleted via deletedAt.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "feedbackReportId", type: "text → feedback_reports.id", notes: "" },
      { name: "authorId", type: "text → User.id", notes: "" },
      { name: "body", type: "text", notes: "" },
      { name: "editedAt / deletedAt", type: "timestamp?", notes: "Filter deletedAt IS NULL for active comments" },
      { name: "createdAt", type: "timestamp", notes: "" },
    ],
    notes: "",
  },
  {
    table: "IssueComment / ObservationComment",
    sqlTable: "issue_comments / observation_comments",
    description: "Threaded comments on project issues and observations. Soft-deleted via deletedAt. Both tables have identical shape.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "issueId / observationId", type: "text → parent table id", notes: "" },
      { name: "authorId", type: "text → User.id", notes: "" },
      { name: "body", type: "text", notes: "" },
      { name: "editedAt / deletedAt", type: "timestamp?", notes: "" },
      { name: "createdAt", type: "timestamp", notes: "" },
    ],
    notes: "Use the /comments REST endpoint to get both tables combined in one flat response.",
  },
  {
    table: "ClearInspection",
    sqlTable: "clear_inspections",
    description: "Append-only inspection history for project rows. Each PASS or FAIL creates a new row — full history is preserved. The current status lives on project_rows.inspectionStatus.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "rowId", type: "text → project_rows.id", notes: "" },
      { name: "status", type: "PASSED | FAILED", notes: "" },
      { name: "deletedAt", type: "timestamp?", notes: "Filter deletedAt IS NULL for active records" },
      { name: "createdAt", type: "timestamp", notes: "Timestamp of the inspection event" },
    ],
    notes: "Join to project_rows → projects to get the project and unit context.",
  },
  {
    table: "IssueScopeTag / ObservationScopeTag",
    sqlTable: "issue_scope_tags / observation_scope_tags",
    description: "Join tables linking an issue or observation to one or more specific unit scope rows. Use to answer: which rows are affected by this issue?",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "issueId / observationId", type: "text → parent table", notes: "" },
      { name: "projectRowId", type: "text → project_rows.id", notes: "" },
    ],
    notes: "The /issues and /observations REST endpoints include these as a comma-separated scopeTagRowIds column for easy downstream joining.",
  },
  {
    table: "ProjectSubScope",
    sqlTable: "project_sub_scopes",
    description: "Named sub-categories within a scope type for a project (e.g. 'Kitchen Cabinetry' inside the TILE scope). Not all projects use sub-scopes.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "projectId", type: "text → projects.id", notes: "" },
      { name: "scopeTypeId", type: "text → scope_types.id", notes: "" },
      { name: "unitType", type: "text", notes: "Applies to all rows of this unit type" },
      { name: "name", type: "text", notes: "Display label (e.g. 'Kitchen Cabinetry')" },
      { name: "displayOrder", type: "int", notes: "" },
      { name: "qty", type: "decimal?", notes: "Manual qty per unit; null = auto even split" },
    ],
    notes: "",
  },
  {
    table: "ProjectSubScopeInstance",
    sqlTable: "project_sub_scope_instances",
    description: "Per-row tracking record for a sub-scope — one row per (sub-scope definition × project row). Tracks stage/status/inspection independently from the parent row.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "subScopeId", type: "text → project_sub_scopes.id", notes: "" },
      { name: "rowId", type: "text → project_rows.id", notes: "" },
      { name: "scopeStage / scopeStatus / inspectionStatus", type: "enum?", notes: "Same enums as project_rows" },
      { name: "qty", type: "decimal?", notes: "Resolved quantity for this unit's slice" },
    ],
    notes: "When sub-scope instances exist for a row, the parent row's stage/status is derived from instances — use instances for the ground truth.",
  },
  {
    table: "ApiKey",
    sqlTable: "api_keys",
    description: "Read-only BI API keys. keyHash is a SHA-256 hash — the raw key is never stored.",
    columns: [
      { name: "id", type: "text", notes: "PK" },
      { name: "name / keyPrefix", type: "text", notes: "Display info only (no raw key ever stored)" },
      { name: "scopes / allowedProjectIds", type: "text[]", notes: "Access restrictions" },
      { name: "party", type: "INTERNAL | SUBCONTRACTOR | GENERAL_CONTRACTOR", notes: "" },
      { name: "assignedToId", type: "text? → User.id", notes: "User whose Settings page shows this key" },
      { name: "revokedAt / expiresAt / lastUsedAt", type: "timestamp?", notes: "" },
    ],
    notes: "",
  },
];

// ─── Credentials (read from env — never hardcoded) ───────────────────────────
// Set BI_READER_HOST and BI_READER_PASSWORD as Railway env vars.
// Fall back to a placeholder if not set so the page still renders.
const BI_READER_HOST = process.env.BI_READER_HOST ?? "db.<your-supabase-project>.supabase.co";
const BI_READER_PASSWORD = process.env.BI_READER_PASSWORD ?? "[contact administrator]";
const BI_READER_CONN = `postgresql://bi_reader:${BI_READER_PASSWORD}@${BI_READER_HOST}:5432/postgres?sslmode=require`;

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function BiDocsPage() {
  const locale = await getLocale();
  const session = await getSession();
  const t = await getTranslations("biDocs");

  if (!session?.user) redirect(`/${locale}/login`);
  // bi-docs exposes DB credentials and internal schema — restrict to ADMIN and BI_ANALYST only
  const allowedRoles = new Set(["ADMIN", "BI_ANALYST"]);
  if (!allowedRoles.has(session.user.role)) {
    redirect(`/${locale}`);
  }

  // Fetch live counts for "at a glance" section
  const [projectCount, rowCount, issueCount, userCount] = await Promise.all([
    db.project.count({ where: { deletedAt: null, isTestProject: false } }),
    db.projectRow.count(),
    db.projectIssue.count(),
    db.user.count({ where: { status: "ACTIVE" } }),
  ]);

  return (
    <div style={{ padding: "var(--space-6)", maxWidth: 1000, margin: "0 auto" }}>
      {/* Title */}
      <div style={{ marginBottom: "var(--space-8)" }}>
        <h1 style={{ fontSize: "var(--text-display)", fontWeight: 700, color: "var(--neutral-900)", margin: "0 0 var(--space-2)" }}>
          {t("pageTitle")}
        </h1>
        <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)", margin: 0, maxWidth: 680 }}>
          {t("pageSubtitle")}
        </p>
      </div>

      {/* At-a-glance counts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-4)", marginBottom: "var(--space-8)" }}>
        {[
          { label: t("statActiveProjects"), count: projectCount },
          { label: t("statUnitRows"), count: rowCount.toLocaleString() },
          { label: t("statIssuesLogged"), count: issueCount.toLocaleString() },
          { label: t("statActiveUsers"), count: userCount },
        ].map((item) => (
          <div key={item.label} style={{ backgroundColor: "var(--neutral-0)", border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", textAlign: "center" }}>
            <div style={{ fontSize: "var(--text-display)", fontWeight: 700, color: "var(--primary-600)" }}>{item.count}</div>
            <div style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)" }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* ── 1. Direct DB connection ─────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: "var(--text-heading)", fontWeight: 600, color: "var(--neutral-900)" }}>
            {t("section1Title")}
          </h2>
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-body-sm)", color: "var(--neutral-500)" }}>
            {t("section1Subtitle")}
          </p>
        </div>
        <div style={{ padding: "var(--space-5)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "var(--space-2) var(--space-4)", marginBottom: "var(--space-5)" }}>
            {[
              ["Host", BI_READER_HOST],
              ["Port", "5432"],
              ["Database", "postgres"],
              ["Username", "bi_reader"],
              ["Password", BI_READER_PASSWORD],
              ["SSL", "Require (sslmode=require)"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <dt style={{ fontSize: "var(--text-body-sm)", color: "var(--neutral-500)", fontWeight: 500, paddingTop: 2 }}>{label}</dt>
                <dd style={{ margin: 0 }}>
                  <code style={codeStyle}>{value}</code>
                </dd>
              </div>
            ))}
          </div>

          <div style={{ backgroundColor: "var(--neutral-50)", border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm)", padding: "var(--space-3) var(--space-4)", marginBottom: "var(--space-4)" }}>
            <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-body-sm)", fontWeight: 600, color: "var(--neutral-700)" }}>{t("connFullString")}</p>
            <code style={{ ...codeStyle, display: "block", wordBreak: "break-all", backgroundColor: "transparent" }}>
              {BI_READER_CONN}
            </code>
          </div>

          <div style={{ backgroundColor: "var(--neutral-50)", border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm)", padding: "var(--space-3) var(--space-4)", marginBottom: "var(--space-4)" }}>
            <p style={{ margin: 0, fontSize: "var(--text-body-sm)", color: "var(--neutral-700)" }}>
              SSL is required — pass <code style={codeStyle}>sslmode=require</code> in your connection string or enable it in your client&apos;s settings. The <code style={codeStyle}>bi_reader</code> account is shared — do not use it for writes. If you need a dedicated credential, ask an administrator.
            </p>
          </div>

          <p style={{ margin: 0, fontSize: "var(--text-body-sm)", color: "var(--neutral-500)" }}>
            The <code style={codeStyle}>bi_reader</code> role has SELECT on all business tables. Auth tables
            (<code style={codeStyle}>&quot;Session&quot;</code>, <code style={codeStyle}>&quot;Account&quot;</code>,{" "}
            <code style={codeStyle}>&quot;VerificationToken&quot;</code>, <code style={codeStyle}>password_reset_tokens</code>)
            are blocked. On <code style={codeStyle}>&quot;User&quot;</code>, all columns except{" "}
            <code style={codeStyle}>passwordHash</code> are readable — use quoted{" "}
            <code style={codeStyle}>&quot;User&quot;</code> (app users), not unquoted <code style={codeStyle}>user</code>{" "}
            (Postgres role metadata). <code style={codeStyle}>user_special_permissions</code> is a separate permissions
            table, not the user directory.
            Tables to exclude from analysis: filter <code style={codeStyle}>p.&quot;isTestProject&quot; = false</code> on projects, and <code style={codeStyle}>p.&quot;deletedAt&quot; IS NULL</code> for soft-deleted records.
            Column names without a Prisma <code style={codeStyle}>@@map</code> use camelCase and must be double-quoted in SQL (e.g. <code style={codeStyle}>&quot;isTestProject&quot;</code>, <code style={codeStyle}>&quot;deletedAt&quot;</code>).
          </p>
        </div>
      </div>

      {/* ── 2. Key relationships ──────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: "var(--text-heading)", fontWeight: 600, color: "var(--neutral-900)" }}>
            {t("section2Title")}
          </h2>
        </div>
        <div style={{ padding: "var(--space-5)" }}>
          <p style={{ margin: "0 0 var(--space-4)", fontSize: "var(--text-body-sm)", color: "var(--neutral-600)" }}>
            How the key tables connect:
          </p>
          <div style={{ fontFamily: "monospace", fontSize: "0.85em", backgroundColor: "var(--neutral-50)", border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm)", padding: "var(--space-4)", lineHeight: 1.8 }}>
            <div><strong>inspection_submissions</strong> → <strong>inspection_answers</strong> → <strong>inspection_form_version_questions</strong> (title, responseType)</div>
            <div><strong>inspection_answers</strong> → <strong>inspection_deficiencies</strong> → <strong>inspection_deficiency_media</strong></div>
            <div><strong>clear_inspections</strong> (inspectionSubmissionId) → <strong>inspection_submissions</strong> (id)</div>
            <div><strong>User</strong> (&quot;roleId&quot;) → <strong>roles</strong> (id)</div>
            <div><strong>Project</strong> (id) → <strong>User</strong> (installManagerId, projectManagerId)</div>
            <div><strong>project_rows</strong> (projectId) → <strong>Project</strong> (id)</div>
            <div><strong>project_rows</strong> (scopeTypeId) → <strong>scope_types</strong> (id)</div>
            <div><strong>project_issues</strong> (projectId) → <strong>Project</strong> (id)</div>
            <div><strong>project_issues</strong> (createdById, resolvedById) → <strong>User</strong> (id)</div>
            <div><strong>project_observations</strong> (projectId) → <strong>Project</strong> (id)</div>
            <div><strong>project_observations</strong> (authorId) → <strong>User</strong> (id)</div>
            <div><strong>activity_logs</strong> (projectId) → <strong>Project</strong> (id)</div>
            <div><strong>activity_logs</strong> (userId) → <strong>User</strong> (id)</div>
            <div><strong>feedback_comments</strong> (feedbackReportId) → <strong>feedback_reports</strong> (id)</div>
            <div><strong>feedback_reports</strong> (userId, assigneeId) → <strong>User</strong> (id)</div>
            <div><strong>issue_comments</strong> (issueId) → <strong>project_issues</strong> (id)</div>
            <div><strong>observation_comments</strong> (observationId) → <strong>project_observations</strong> (id)</div>
            <div><strong>clear_inspections</strong> (rowId) → <strong>project_rows</strong> (id)</div>
            <div><strong>issue_scope_tags</strong> (issueId, projectRowId) → joins issues ↔ rows</div>
            <div><strong>observation_scope_tags</strong> (observationId, projectRowId) → joins observations ↔ rows</div>
            <div><strong>project_sub_scopes</strong> (projectId) → <strong>projects</strong> (id)</div>
            <div><strong>project_sub_scope_instances</strong> (subScopeId, rowId) → sub_scopes ↔ rows</div>
            <div><strong>media_attachments</strong> (issueId) → <strong>project_issues</strong> (id) [nullable]</div>
            <div><strong>media_attachments</strong> (observationId) → <strong>project_observations</strong> (id) [nullable]</div>
            <div><strong>media_attachments</strong> (unitPhotoProjectId) → <strong>&quot;Project&quot;</strong> (id) [unit album photos]</div>
            <div><strong>media_attachments</strong> (uploadedById) → <strong>User</strong> (id)</div>
            <div><strong>api_keys</strong> (createdById, assignedToId) → <strong>User</strong> (id)</div>
          </div>
          <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-body-sm)", color: "var(--neutral-500)" }}>
            Note: <strong>User</strong> and <strong>Project</strong> tables have no Prisma <code style={codeStyle}>@@map</code>, so their SQL names are quoted PascalCase: <code style={codeStyle}>&quot;User&quot;</code> and <code style={codeStyle}>&quot;Project&quot;</code>. All other tables use lowercase snake_case names.
          </p>
        </div>
      </div>

      {/* ── 3. Useful starter queries ─────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: "var(--text-heading)", fontWeight: 600, color: "var(--neutral-900)" }}>
            {t("section3Title")}
          </h2>
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-body-sm)", color: "var(--neutral-500)" }}>
            {t("section3Subtitle")}
          </p>
        </div>
        <div style={{ padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

          {[
            {
              title: "All active projects",
              sql: `SELECT
  p.id AS project_id,
  p."unifierPid" AS unifier_pid,
  p."installManagerName" AS install_manager,
  p."createdAt" AS created_at
FROM "Project" p
WHERE p."deletedAt" IS NULL
  AND p."isTestProject" = false
ORDER BY p."createdAt" DESC;`,
              note: "Note: project name/PM/dates come from Oracle Unifier, not this table. Use the REST API for enriched data.",
            },
            {
              title: "Unit status summary by project",
              sql: `SELECT
  p.id AS project_id,
  p."unifierPid" AS unifier_pid,
  pr."scopeStage",
  pr."scopeStatus",
  COUNT(*) AS row_count
FROM project_rows pr
JOIN "Project" p ON pr."projectId" = p.id
WHERE p."deletedAt" IS NULL
  AND p."isTestProject" = false
GROUP BY p.id, p."unifierPid", pr."scopeStage", pr."scopeStatus"
ORDER BY p."unifierPid", pr."scopeStage", pr."scopeStatus";`,
              note: "",
            },
            {
              title: "Open blocking issues",
              sql: `SELECT
  i.id AS issue_id,
  p."unifierPid" AS project,
  i."unitRef",
  i."shortDescription",
  i."issueType",
  i."responsibleParty",
  i."createdAt",
  u.name AS created_by
FROM project_issues i
JOIN "Project" p ON i."projectId" = p.id
LEFT JOIN "User" u ON i."createdById" = u.id
WHERE i.status = 'OPEN'
  AND i."isBlockingWork" = true
  AND p."isTestProject" = false
ORDER BY i."createdAt" DESC;`,
              note: "",
            },
            {
              title: "Inspection status breakdown (INSTALL+COMPLETE rows)",
              sql: `SELECT
  p."unifierPid" AS project,
  pr.building,
  pr.level,
  pr."inspectionStatus",
  COUNT(*) AS unit_count
FROM project_rows pr
JOIN "Project" p ON pr."projectId" = p.id
WHERE pr."scopeStage" = 'INSTALL'
  AND pr."scopeStatus" = 'COMPLETE'
  AND p."isTestProject" = false
  AND p."deletedAt" IS NULL
GROUP BY p."unifierPid", pr.building, pr.level, pr."inspectionStatus"
ORDER BY p."unifierPid", pr.building, pr.level;`,
              note: "",
            },
            {
              title: "Activity feed (last 500 events across all projects)",
              sql: `SELECT
  al.id,
  p."unifierPid" AS project,
  al."userName",
  al."eventType",
  al.metadata,
  al."createdAt"
FROM activity_logs al
JOIN "Project" p ON al."projectId" = p.id
WHERE p."isTestProject" = false
ORDER BY al."createdAt" DESC
LIMIT 500;`,
              note: "metadata is JSONB — use ->> operator to extract fields: metadata->>'rowId', metadata->>'newStatus'",
            },
            {
              title: "Feedback report summary (bugs + feature requests)",
              sql: `SELECT
  fr.id AS feedback_id,
  CONCAT('FB-', LPAD(fr."shortId"::text, 4, '0')) AS ref,
  fr.type,
  fr.title,
  fr.status,
  fr.priority,
  fr.source,
  fr."pageUrl",
  u.name AS submitted_by,
  a.name AS assigned_to,
  fr."createdAt",
  fr."updatedAt"
FROM feedback_reports fr
LEFT JOIN "User" u ON fr."userId" = u.id
LEFT JOIN "User" a ON fr."assigneeId" = a.id
WHERE fr.status != 'DELETED'
ORDER BY fr."createdAt" DESC;`,
              note: "Excludes the screenshot column (base64 blob — not useful in SQL). The REST API /feedback endpoint also omits it.",
            },
            {
              title: "All media attachments — issues and observations with direct file URLs",
              sql: `SELECT
  ma.id AS attachment_id,
  p."unifierPid" AS project,
  CASE
    WHEN ma."issueId" IS NOT NULL       THEN 'ISSUE'
    WHEN ma."observationId" IS NOT NULL THEN 'OBSERVATION'
    ELSE 'UNIT_ALBUM'
  END AS parent_type,
  COALESCE(ma."issueId", ma."observationId") AS parent_id,
  ma."unitPhotoUnitRef" AS unit_ref,
  ma."storageUrl",   -- open this URL directly in a browser or embed in PBI
  ma."mimeType",
  ma."fileSizeBytes",
  ma."caption",
  ma."transcriptEnglish",
  u.name AS uploaded_by,
  ma."createdAt"
FROM media_attachments ma
JOIN "User" u ON ma."uploadedById" = u.id
LEFT JOIN project_issues    i ON ma."issueId" = i.id
LEFT JOIN project_observations o ON ma."observationId" = o.id
LEFT JOIN "Project" p ON
  COALESCE(i."projectId", o."projectId", ma."unitPhotoProjectId") = p.id
WHERE p."isTestProject" = false
  AND p."deletedAt" IS NULL
ORDER BY ma."createdAt" DESC;`,
              note: "storageUrl is a signed URL valid for 1 year — no extra auth needed to fetch the file. Download directly in any HTTP client or include in your pipeline.",
            },
          ].map((q) => (
            <div key={q.title}>
              <p style={{ margin: "0 0 var(--space-2)", fontWeight: 600, fontSize: "var(--text-body-sm)", color: "var(--neutral-800)" }}>
                {q.title}
              </p>
              <pre style={{
                margin: 0,
                padding: "var(--space-3) var(--space-4)",
                backgroundColor: "var(--neutral-900)",
                color: "var(--neutral-200)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8em",
                lineHeight: 1.7,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
              }}>
                {q.sql}
              </pre>
              {q.note && (
                <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-caption)", color: "var(--neutral-500)", fontStyle: "italic" }}>
                  {q.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. Table reference ────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: "var(--text-heading)", fontWeight: 600, color: "var(--neutral-900)" }}>
            {t("section4Title")}
          </h2>
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-body-sm)", color: "var(--neutral-500)" }}>
            {t("section4Subtitle")}
          </p>
        </div>
        <div style={{ padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {TABLES.map((tbl) => (
            <div key={tbl.table}>
              <div style={{ marginBottom: "var(--space-3)" }}>
                <span style={{ fontSize: "var(--text-heading)", fontWeight: 700, color: "var(--neutral-900)" }}>{tbl.table}</span>
                <code style={{ ...codeStyle, marginLeft: "var(--space-2)", fontSize: "0.75em" }}>{tbl.sqlTable}</code>
                <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-body-sm)", color: "var(--neutral-600)" }}>{tbl.description}</p>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm)" }}>
                  <thead>
                    <tr>
                      <th style={tableHeadStyle}>{t("tableColColumn")}</th>
                      <th style={tableHeadStyle}>{t("tableColType")}</th>
                      <th style={tableHeadStyle}>{t("tableColNotes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tbl.columns.map((col) => (
                      <tr key={col.name}>
                        <td style={tableCellStyle}><code style={codeStyle}>{col.name}</code></td>
                        <td style={{ ...tableCellStyle, color: "var(--neutral-500)" }}>
                          <code style={{ ...codeStyle, backgroundColor: "transparent", padding: 0 }}>{col.type}</code>
                        </td>
                        <td style={{ ...tableCellStyle, color: "var(--neutral-600)" }}>{col.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tbl.notes && (
                <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-body-sm)", color: "var(--warning-600)", fontStyle: "italic" }}>
                  {tbl.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. REST API reference ────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: "var(--text-heading)", fontWeight: 600, color: "var(--neutral-900)" }}>
            {t("section5Title")}
          </h2>
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-body-sm)", color: "var(--neutral-500)" }}>
            {t("section5Subtitle")}
          </p>
        </div>
        <div style={{ padding: "var(--space-5)" }}>
          <div style={{ backgroundColor: "var(--neutral-50)", border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm)", padding: "var(--space-3) var(--space-4)", marginBottom: "var(--space-4)" }}>
            <p style={{ margin: 0, fontSize: "var(--text-body-sm)", fontWeight: 600, color: "var(--neutral-700)" }}>{t("authLabel")}</p>
            <code style={{ ...codeStyle, display: "block", marginTop: "var(--space-1)", backgroundColor: "transparent" }}>
              Authorization: Bearer cc_bi_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
            </code>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--neutral-200)", borderRadius: "var(--radius-sm)" }}>
            <thead>
              <tr>
                <th style={tableHeadStyle}>{t("apiColEndpoint")}</th>
                <th style={tableHeadStyle}>{t("apiColScope")}</th>
                <th style={tableHeadStyle}>{t("apiColDescription")}</th>
              </tr>
            </thead>
            <tbody>
              {[
                { path: "GET /api/bi/v1", scope: "key only", desc: "Discovery — lists all endpoints and your key's scopes" },
                { path: "GET /api/bi/v1/projects", scope: "bi:projects", desc: "All active projects with Unifier-enriched name, PM, dates, status" },
                { path: "GET /api/bi/v1/projects/{id}", scope: "bi:projects", desc: "Single project" },
                { path: "GET /api/bi/v1/projects/{id}/units", scope: "bi:units", desc: "Unit rows (paginated, default 500/page)" },
                { path: "GET /api/bi/v1/projects/{id}/issues", scope: "bi:issues", desc: "All issues for a project" },
                { path: "GET /api/bi/v1/projects/{id}/observations", scope: "bi:observations", desc: "All field observations" },
                { path: "GET /api/bi/v1/projects/{id}/comments", scope: "bi:comments", desc: "Issue + observation comments combined (parentType = ISSUE | OBSERVATION)" },
                { path: "GET /api/bi/v1/projects/{id}/inspections", scope: "bi:inspections", desc: "Full inspection PASS/FAIL history per unit row" },
                { path: "GET /api/bi/v1/projects/{id}/subscopes", scope: "bi:subscopes", desc: "Sub-scope definitions and per-row instances (empty if project has none)" },
                { path: "GET /api/bi/v1/projects/{id}/media", scope: "bi:media", desc: "All media attachments (photos, video, audio) — one row per file, storageUrl is directly openable" },
                { path: "GET /api/bi/v1/projects/{id}/activity", scope: "bi:activity", desc: "Activity log events (paginated)" },
                { path: "GET /api/bi/v1/feedback", scope: "bi:feedback", desc: "All feedback reports (bugs + feature requests) app-wide. Add ?include=comments for comment threads." },
                { path: "GET /api/bi/v1/team", scope: "bi:team", desc: "All active team members" },
              ].map((row) => (
                <tr key={row.path}>
                  <td style={tableCellStyle}><code style={codeStyle}>{row.path}</code></td>
                  <td style={{ ...tableCellStyle, color: "var(--neutral-500)" }}><code style={{ ...codeStyle, backgroundColor: "transparent", padding: 0 }}>{row.scope}</code></td>
                  <td style={{ ...tableCellStyle, color: "var(--neutral-600)" }}>{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>
            Base URL (production): <code style={codeStyle}>https://command-center-reboot-production.up.railway.app</code>.
            Contact your administrator to generate an API key. All endpoints return flat JSON arrays.
            Test sandboxes (<code style={codeStyle}>isTestProject = true</code>) are excluded from list and detail endpoints by default.
            To analyze a specific Admin clone, add its project <code style={codeStyle}>id</code> to the key&apos;s <code style={codeStyle}>allowedProjectIds</code> whitelist in Settings or DevTools — only whitelisted clone IDs are returned.
          </p>
        </div>
      </div>

    </div>
  );
}
