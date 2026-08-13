/**
 * Unifier financials service — raw access to contract and change order data.
 *
 * Tables:
 *   UNIFIER_UXUECON  — Contracts
 *   UNIFIER_UXPCO    — Potential Change Orders
 *   UNIFIER_UXSUM    — Subcontractor Pay Applications (also in subcontractors.ts)
 *
 * These are read-only service stubs. Production normalization and financial
 * dashboard UI will be added in a follow-up PR once data is validated via
 * the DevTools Unifier Explorer.
 */

import { fetchAllRows } from "./client";
import { getTableDef } from "./schema-definition";

// ── Types ─────────────────────────────────────────────────────────────────

export type UnifierContractRaw = Record<string, unknown>;
export type UnifierPcoRaw = Record<string, unknown>;

// ── Helpers ───────────────────────────────────────────────────────────────

function getColumns(tableName: string): string[] {
  return getTableDef(tableName)?.columns.map((c) => c.code) ?? [];
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Returns raw Contract records from UNIFIER_UXUECON,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawContracts(
  projectId?: string
): Promise<UnifierContractRaw[]> {
  const rows = await fetchAllRows<UnifierContractRaw>(
    "UNIFIER_UXUECON",
    getColumns("UNIFIER_UXUECON")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}

/**
 * Returns raw Potential Change Order records from UNIFIER_UXPCO,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawPotentialChangeOrders(
  projectId?: string
): Promise<UnifierPcoRaw[]> {
  const rows = await fetchAllRows<UnifierPcoRaw>(
    "UNIFIER_UXPCO",
    getColumns("UNIFIER_UXPCO")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}
