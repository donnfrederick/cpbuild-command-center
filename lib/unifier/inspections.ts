/**
 * Unifier inspections service — raw access to unit-level inspection data.
 *
 * Tables:
 *   UNIFIER_UXTACIN   — Turn-Around Inspections (pass/fail/NA per item)
 *   UNIFIER_UXCLEARI  — Clearance Inspections (final sign-off)
 *
 * These are read-only service stubs. Production normalization and unit-level
 * inspection UI will be added in a follow-up PR once data is validated via
 * the DevTools Unifier Explorer.
 */

import { fetchAllRows } from "./client";
import { getTableDef } from "./schema-definition";

// ── Types ─────────────────────────────────────────────────────────────────

export type UnifierTacInspectionRaw = Record<string, unknown>;
export type UnifierClearanceInspectionRaw = Record<string, unknown>;

// ── Helpers ───────────────────────────────────────────────────────────────

function getColumns(tableName: string): string[] {
  return getTableDef(tableName)?.columns.map((c) => c.code) ?? [];
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Returns raw Turn-Around Inspection records from UNIFIER_UXTACIN,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawTurnAroundInspections(
  projectId?: string
): Promise<UnifierTacInspectionRaw[]> {
  const rows = await fetchAllRows<UnifierTacInspectionRaw>(
    "UNIFIER_UXTACIN",
    getColumns("UNIFIER_UXTACIN")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}

/**
 * Returns raw Clearance Inspection records from UNIFIER_UXCLEARI,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawClearanceInspections(
  projectId?: string
): Promise<UnifierClearanceInspectionRaw[]> {
  const rows = await fetchAllRows<UnifierClearanceInspectionRaw>(
    "UNIFIER_UXCLEARI",
    getColumns("UNIFIER_UXCLEARI")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}
