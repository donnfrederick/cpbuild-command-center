/**
 * Unifier schedule service — raw access to P6 activity data.
 *
 * Tables:
 *   UNIFIER_P6_ACTIVITY  — P6 schedule activities (planned vs actual dates)
 *
 * These are read-only service stubs. Production normalization and schedule
 * Gantt/timeline UI will be added in a follow-up PR once data is validated
 * via the DevTools Unifier Explorer.
 */

import { fetchAllRows } from "./client";
import { getTableDef } from "./schema-definition";

// ── Types ─────────────────────────────────────────────────────────────────

export type UnifierP6ActivityRaw = Record<string, unknown>;

// ── Helpers ───────────────────────────────────────────────────────────────

function getColumns(tableName: string): string[] {
  return getTableDef(tableName)?.columns.map((c) => c.code) ?? [];
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Returns raw P6 Activity records from UNIFIER_P6_ACTIVITY,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawP6Activities(
  projectId?: string
): Promise<UnifierP6ActivityRaw[]> {
  const rows = await fetchAllRows<UnifierP6ActivityRaw>(
    "UNIFIER_P6_ACTIVITY",
    getColumns("UNIFIER_P6_ACTIVITY")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}
