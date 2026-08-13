/**
 * GET /api/bi/v1
 *
 * Discovery endpoint — lists all available BI API endpoints and the scope each requires.
 * Requires a valid API key (any scope); no additional scope beyond authentication.
 */

import { validateBiKey, biResponseHeaders } from "@/lib/bi-auth";
import { BI_SCOPES } from "@/lib/bi-scopes";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/bi/v1",
    scope: null,
    description: "This discovery endpoint — lists all available endpoints and required scopes.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects",
    scope: "bi:projects",
    description: "List all active, non-test projects with Unifier-enriched metadata.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects/{id}",
    scope: "bi:projects",
    description: "Single project detail row.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects/{id}/units",
    scope: "bi:units",
    description: "All unit (Field Tracker) rows for a project. Supports ?page=&limit= (default limit 500).",
    paginated: true,
    paginationParams: { page: "integer (1-based, default 1)", limit: "integer (default 500, max 2000)" },
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects/{id}/issues",
    scope: "bi:issues",
    description: "All issues logged against a project.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects/{id}/observations",
    scope: "bi:observations",
    description: "All field observations recorded for a project.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects/{id}/comments",
    scope: "bi:comments",
    description: "All non-deleted comments for issues and observations in a project, combined. parentType = ISSUE | OBSERVATION; parentId joins to /issues or /observations.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects/{id}/inspections",
    scope: "bi:inspections",
    description: "Full inspection history for a project — one row per PASS/FAIL event. Multiple rows per unit scope row are expected (each change appends). Join to /units on unitRowId.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects/{id}/subscopes",
    scope: "bi:subscopes",
    description: "Sub-scope definitions and per-row instances. Returns { definitions, instances }. Empty arrays if the project has no sub-scopes configured.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects/{id}/media",
    scope: "bi:media",
    description: "All media attachments (photos, video, audio) for a project. One row per file. storageUrl is a directly-openable signed URL (no extra auth needed). parentType = ISSUE | OBSERVATION | UNIT_ALBUM.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/projects/{id}/activity",
    scope: "bi:activity",
    description: "Activity log events for a project. Supports ?page=&limit= (default limit 500).",
    paginated: true,
    paginationParams: { page: "integer (1-based, default 1)", limit: "integer (default 500, max 2000)" },
  },
  {
    method: "GET",
    path: "/api/bi/v1/feedback",
    scope: "bi:feedback",
    description: "All non-deleted feedback reports (bugs + feature requests) across the app. Not project-scoped. Add ?include=comments to also receive comment threads.",
    paginated: false,
  },
  {
    method: "GET",
    path: "/api/bi/v1/team",
    scope: "bi:team",
    description: "All active team members with name, email, and role.",
    paginated: false,
  },
];

export async function GET(request: Request) {
  const keyCtx = await validateBiKey(request);
  if (!keyCtx) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "A valid API key is required. Pass it as: Authorization: Bearer cc_bi_..." }),
      { status: 401, headers: biResponseHeaders() }
    );
  }

  return new Response(
    JSON.stringify({
      version: "v1",
      description: "CP Build Field Tracker — read-only BI/reporting API. Most dataset endpoints return flat JSON arrays, but some return envelope objects (e.g. paginated responses return { data, pagination }, /subscopes returns { definitions, instances }, and /feedback?include=comments returns { reports, comments }). Check each endpoint's contract before assuming the response shape.",
      authentication: {
        type: "Bearer token",
        header: "Authorization: Bearer <your-api-key>",
        keyFormat: "cc_bi_...",
        note: "API keys are issued by Field Tracker administrators. Keys are scoped — each endpoint requires a specific scope. Your key's scopes: " + keyCtx.scopes.join(", "),
      },
      availableScopes: BI_SCOPES,
      keyScopes: keyCtx.scopes,
      allowedProjectIds: keyCtx.allowedProjectIds.length > 0 ? keyCtx.allowedProjectIds : "all",
      endpoints: ENDPOINTS,
    }),
    { status: 200, headers: biResponseHeaders() }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: biResponseHeaders() });
}
