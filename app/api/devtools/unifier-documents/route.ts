/**
 * GET /api/devtools/unifier-documents
 *
 * Diagnostic endpoint for Unifier Document Manager data.
 * Tries multiple table name variants and returns:
 *   - Which table (if any) succeeded
 *   - Sample rows and column structure
 *   - Distinct project_id values (to compare with our unifierPid)
 *   - Data model diagram
 *
 * Query: ?pid=1455 to highlight how your project's unifierPid relates to the data.
 *
 * Hard-blocked in production.
 */

import { NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/unifier/client";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";

export const dynamic = "force-dynamic";

const DOC_COLUMNS_FULL = ["ID", "PROJECT_ID", "TITLE", "FILE_NAME", "REVISION_NO", "ISSUE_DATE", "CREATE_DATE", "UPLOAD_DATE", "STATUS", "FILE_SIZE", "UUU_CREATE_BY", "UUU_UPLOAD_BY", "DOC_TAG"];
const DOC_COLUMNS_MIN = ["ID", "PROJECT_ID"];

const TABLE_VARIANTS = [
  "UNIFIER_DM_FILE_VIEW",
  "dm_file_view",
  "UNIFIER_DM_FILE",
  "dm_file",
  "UNIFIER_DM_FILE_LINKNODE_VIEW",
  "dm_file_linknode_view",
];

export async function GET(request: Request) {
  if (!isDevToolsAllowed()) {
    return NextResponse.json(
      { error: DEVTOOLS_BLOCKED_MESSAGE },
      { status: 403 }
    );
  }

  const authError = await requireDevToolsAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const yourPid = searchParams.get("pid") ?? null;

  const result: Record<string, unknown> = {
    yourUnifierPid: yourPid,
    note: "Command Center projects use unifierPid (from UNIFIER_US_XPRJ.PID). Document Manager uses project_id. These may differ — check distinct project_ids below.",
    dataModel: {
      description: "Document Manager schema (from your ER Views)",
      tables: [
        { name: "dm_file / UNIFIER_DM_FILE", role: "Main file metadata (title, revision, dates). Has project_id." },
        { name: "dm_file_content / UNIFIER_DM_FILE_CONTENT", role: "File content (bytes, path, repo). Has project_id." },
        { name: "dm_file_view / UNIFIER_DM_FILE_VIEW", role: "View joining dm_file + dm_file_content." },
      ],
      keyFields: [
        { field: "project_id", description: "Links to shell/project. May be internal numeric ID vs PID string." },
        { field: "id", description: "File record ID." },
        { field: "status", description: "0=deleted, 1=uploaded, 2=deployed. We exclude 0." },
      ],
    },
    attempts: [] as Record<string, unknown>[],
    success: null as Record<string, unknown> | null,
  };

  outer: for (const tableName of TABLE_VARIANTS) {
    for (const cols of [DOC_COLUMNS_FULL, DOC_COLUMNS_MIN]) {
      try {
        const rows = await fetchAllRows<Record<string, unknown>>(
          tableName,
          cols,
          null
        );

        const attempt: Record<string, unknown> = {
          tableName,
          columns: cols.length,
          status: "ok",
          rowCount: rows.length,
        };
        result.attempts = (result.attempts as Record<string, unknown>[]) || [];
        (result.attempts as Record<string, unknown>[]).push(attempt);

        if (rows.length > 0) {
          const colNames = Object.keys(rows[0] ?? {});
          const projectIds = [...new Set(rows.map((r) => String(r.PROJECT_ID ?? r.project_id ?? "null")))].sort();
          const sampleRows = rows.slice(0, 5).map((r) => {
            const out: Record<string, unknown> = {};
            for (const k of colNames) {
              out[k] = r[k];
            }
            return out;
          });

          result.success = {
            tableName,
            columns: colNames,
            totalRows: rows.length,
            distinctProjectIds: projectIds,
            projectIdCount: projectIds.length,
            sampleRows,
            yourPidInData: yourPid ? projectIds.includes(yourPid) : null,
            projectIdSample: projectIds.slice(0, 20),
          };
          break outer;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.attempts = (result.attempts as Record<string, unknown>[]) || [];
        (result.attempts as Record<string, unknown>[]).push({
          tableName,
          status: "error",
          error: msg.slice(0, 200),
        });
      }
    }
  }

  return NextResponse.json(result);
}
