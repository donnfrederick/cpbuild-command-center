/**
 * Unifier reports service — raw access to project status and daily activity data.
 *
 * Tables:
 *   UNIFIER_UXPSR   — Project Status Reports (G/Y/R, financials, % complete)
 *   UNIFIER_UXUEDR  — Daily Activity Reports (workforce hours per project)
 *
 * These are read-only service stubs. Production normalization and dashboard
 * UI will be added in a follow-up PR once data is validated via the DevTools
 * Unifier Explorer.
 */

import { fetchAllRows } from "./client";
import { getTableDef } from "./schema-definition";

// ── Types ─────────────────────────────────────────────────────────────────

export type UnifierPsrRaw = Record<string, unknown>;
export type UnifierDarRaw = Record<string, unknown>;

// ── Helpers ───────────────────────────────────────────────────────────────

function getColumns(tableName: string): string[] {
  return getTableDef(tableName)?.columns.map((c) => c.code) ?? [];
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Returns raw Project Status Report records from UNIFIER_UXPSR,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawProjectStatusReports(
  projectId?: string
): Promise<UnifierPsrRaw[]> {
  const rows = await fetchAllRows<UnifierPsrRaw>(
    "UNIFIER_UXPSR",
    getColumns("UNIFIER_UXPSR")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}

/**
 * Returns raw Daily Activity Report records from UNIFIER_UXUEDR,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawDailyActivityReports(
  projectId?: string
): Promise<UnifierDarRaw[]> {
  const rows = await fetchAllRows<UnifierDarRaw>(
    "UNIFIER_UXUEDR",
    getColumns("UNIFIER_UXUEDR")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}
