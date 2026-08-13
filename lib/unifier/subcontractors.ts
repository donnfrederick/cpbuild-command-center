/**
 * Unifier subcontractor service — raw access to subcontractor, PO, and pay-app data.
 *
 * Tables:
 *   UNIFIER_UXSUB  — subcontractor directory
 *   UNIFIER_UXPOS  — subcontractor purchase orders
 *   UNIFIER_UXSUM  — subcontractor pay applications
 *
 * Project ↔ subcontractor relationship in Unifier is primarily through PO/pay-app rows
 * (`PROJECT_ID` column). These raw helpers are kept for future project-level subcontractor
 * reporting (not per-scope assignment).
 */

import fs from "node:fs";
import path from "node:path";
import { fetchAllRows } from "./client";
import { MOCK_UNIFIER_SUBCONTRACTORS } from "./mock-data";
import { isUnifierMockAllowed } from "./mock-mode";
import { getTableDef } from "./schema-definition";

// ── Types ─────────────────────────────────────────────────────────────────

export type UnifierSubcontractorRaw = Record<string, unknown>;
export type UnifierPurchaseOrderRaw = Record<string, unknown>;
export type UnifierPayApplicationRaw = Record<string, unknown>;

export interface SubcontractorPickerItem {
  id: string;
  name: string;
}

// ── Picker cache (5-min TTL, server-side module-level) ────────────────────

let _pickerCache: SubcontractorPickerItem[] | null = null;
let _pickerCacheExpiresAt = 0;

let _nameLookupCache: Map<string, string> | null = null;
let _nameLookupCacheExpiresAt = 0;

// ── Helpers ────────────────────────────────────────────────────────────────

function getColumns(tableName: string): string[] {
  return getTableDef(tableName)?.columns.map((c) => c.code) ?? [];
}

/** Gitignored `.local/mock-subcontractors.json` — local dev extras only. */
function loadLocalMockSubcontractorRows(): UnifierSubcontractorRaw[] {
  if (process.env.NODE_ENV === "production") return [];
  try {
    const filePath = path.join(process.cwd(), ".local", "mock-subcontractors.json");
    if (!fs.existsSync(filePath)) return [];
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is UnifierSubcontractorRaw =>
        row !== null && typeof row === "object" && !Array.isArray(row),
    );
  } catch (err) {
    console.warn("[subcontractors] failed to read .local/mock-subcontractors.json:", err);
    return [];
  }
}

function mergeMockSubcontractorRows(
  base: UnifierSubcontractorRaw[],
  extra: UnifierSubcontractorRaw[],
): UnifierSubcontractorRaw[] {
  const byId = new Map<string, UnifierSubcontractorRaw>();
  for (const row of base) {
    const id = String(row["ID"] ?? "");
    if (id) byId.set(id, row);
  }
  for (const row of extra) {
    const id = String(row["ID"] ?? "");
    if (id) byId.set(id, row);
  }
  return [...byId.values()];
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Returns raw subcontractor records from UNIFIER_UXSUB.
 */
export async function getRawSubcontractors(): Promise<UnifierSubcontractorRaw[]> {
  if (isUnifierMockAllowed()) {
    const local = loadLocalMockSubcontractorRows();
    return local.length > 0
      ? mergeMockSubcontractorRows(MOCK_UNIFIER_SUBCONTRACTORS, local)
      : MOCK_UNIFIER_SUBCONTRACTORS;
  }
  return fetchAllRows<UnifierSubcontractorRaw>(
    "UNIFIER_UXSUB",
    getColumns("UNIFIER_UXSUB")
  );
}

/**
 * Returns active subcontractors from UNIFIER_UXSUB formatted for picker use.
 * Filters to STATUS === "Active" (case-insensitive). Caches the result for 5 minutes.
 */
export async function getSubcontractorsForPicker(): Promise<SubcontractorPickerItem[]> {
  if (_pickerCache !== null && Date.now() < _pickerCacheExpiresAt) {
    return _pickerCache;
  }
  const raw = await getRawSubcontractors();
  const items: SubcontractorPickerItem[] = raw
    .filter((r) => typeof r["STATUS"] === "string" && r["STATUS"].toLowerCase() === "active")
    .map((r) => ({
      id: String(r["ID"] ?? ""),
      name: String(r["CP_SUB_SUBCONTRACTNAME_TB50"] ?? ""),
    }))
    .filter((item) => item.id !== "" && item.name !== "")
    .sort((a, b) => a.name.localeCompare(b.name));
  _pickerCache = items;
  _pickerCacheExpiresAt = Date.now() + 5 * 60 * 1000;
  return items;
}

/**
 * All UXSUB id → display name (active and inactive). For read-only labels — not picker filtering.
 */
export async function getSubcontractorNameLookup(): Promise<Map<string, string>> {
  if (_nameLookupCache !== null && Date.now() < _nameLookupCacheExpiresAt) {
    return _nameLookupCache;
  }
  const raw = await getRawSubcontractors();
  const map = new Map<string, string>();
  for (const row of raw) {
    const id = String(row["ID"] ?? "").trim();
    const name = String(row["CP_SUB_SUBCONTRACTNAME_TB50"] ?? "").trim();
    if (id && name) map.set(id, name);
  }
  _nameLookupCache = map;
  _nameLookupCacheExpiresAt = Date.now() + 5 * 60 * 1000;
  return map;
}

/**
 * Returns raw purchase order records from UNIFIER_UXPOS,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawPurchaseOrders(
  projectId?: string
): Promise<UnifierPurchaseOrderRaw[]> {
  if (isUnifierMockAllowed()) return [];
  const rows = await fetchAllRows<UnifierPurchaseOrderRaw>(
    "UNIFIER_UXPOS",
    getColumns("UNIFIER_UXPOS")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}

/**
 * Returns raw pay application records from UNIFIER_UXSUM,
 * optionally filtered by PROJECT_ID in memory.
 */
export async function getRawPayApplications(
  projectId?: string
): Promise<UnifierPayApplicationRaw[]> {
  if (isUnifierMockAllowed()) return [];
  const rows = await fetchAllRows<UnifierPayApplicationRaw>(
    "UNIFIER_UXSUM",
    getColumns("UNIFIER_UXSUM")
  );
  if (!projectId) return rows;
  return rows.filter((r) => r["PROJECT_ID"] != null && String(r["PROJECT_ID"]) === projectId);
}
