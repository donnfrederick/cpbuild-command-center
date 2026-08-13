/**
 * Unifier locations service — raw access to unit/level/building location data.
 *
 * Tables:
 *   UNIFIER_UXLOC  — location records (unit/level/building per project)
 *
 * These are read-only service stubs. Production normalization and ProjectRow
 * location sync will be added in a follow-up PR once data is validated via
 * the DevTools Unifier Explorer.
 */

import { fetchAllRows } from "./client";
import { getTableDef } from "./schema-definition";

// ── Types ─────────────────────────────────────────────────────────────────

export type UnifierLocationRaw = Record<string, unknown>;

// ── Helpers ───────────────────────────────────────────────────────────────

function getColumns(tableName: string): string[] {
  return getTableDef(tableName)?.columns.map((c) => c.code) ?? [];
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Returns raw Location records from UNIFIER_UXLOC,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawLocations(
  projectId?: string
): Promise<UnifierLocationRaw[]> {
  const rows = await fetchAllRows<UnifierLocationRaw>(
    "UNIFIER_UXLOC",
    getColumns("UNIFIER_UXLOC")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}
