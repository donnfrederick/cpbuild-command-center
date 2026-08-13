/**
 * Shared logic for inserting project rows from UPM spreadsheet format.
 * Used by project creation and bulk-add endpoints.
 */

import { randomUUID } from "crypto";
import { parseSpreadsheetNumber } from "@/lib/parse-spreadsheet-number";

function parseDecimal(s: string | undefined): string | null {
  const v = s?.trim();
  if (!v) return null;
  const n = parseSpreadsheetNumber(v);
  return n === null ? null : String(n);
}

function parseDate(s: string | undefined): string | null {
  const v = s?.trim();
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const n = parseFloat(v);
  if (!Number.isNaN(n) && n > 0) {
    const d = new Date((n - 25569) * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Map spreadsheet header names to DB column values. */
export function mapRowToColumns(row: Record<string, string>): {
  building: string;
  level: string;
  unit: string;
  area: string;
  shipPhase: string;
  buildPhase: string;
  scheme: string;
  unitType: string;
  description: string;
  scopeTypeCode: string;
  csiPrimeCode: string;
  csiDetailCode: string;
  locationTypeCode: string;
  costTypeCode: string;
  installerCode: string;
  qty: string | null;
  uomCode: string;
  unitRate: string | null;
  budgetedManHours: string | null;
  startDate: string | null;
  finishDate: string | null;
  percentComplete: string | null;
  actualManHours: string | null;
} {
  // Build a case-insensitive lookup map once per row.
  const lowerKeyMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    lowerKeyMap[k.trim().toLowerCase()] = v;
  }

  /**
   * Look up a cell value by trying each alias in order.
   * Step 1: exact case-insensitive match.
   * Step 2: "starts with" fallback — handles headers like "Cost Type (L/S)"
   *         matching the alias "Cost Type".
   */
  const get = (keys: string[]) => {
    // Exact match first (fast path)
    for (const k of keys) {
      const v = lowerKeyMap[k.trim().toLowerCase()]?.trim();
      if (v !== undefined && v !== "") return v;
    }
    // Prefix / "starts with" fallback for headers with parenthetical suffixes
    for (const k of keys) {
      const prefix = k.trim().toLowerCase();
      if (prefix.length < 4) continue; // skip very short keys to avoid false positives
      for (const [mapKey, mapVal] of Object.entries(lowerKeyMap)) {
        if (mapKey.startsWith(prefix)) {
          const v = mapVal?.trim();
          if (v !== undefined && v !== "") return v;
        }
      }
    }
    return "";
  };

  return {
    building: get(["Building"]),
    level: get(["Level"]),
    unit: get(["Unit"]),
    area: get(["Area"]),
    shipPhase: get(["Ship. Phase", "Ship Phase", "Shipping Phase", "Ship"]),
    buildPhase: get(["Build Phase", "Build Ph", "Build"]),
    scheme: get(["Scheme"]),
    unitType: get(["Unit Type", "Unit Typ"]),
    description: get(["Description", "Desc"]),
    scopeTypeCode: get(["Scope Type", "Scope Typ", "Scope"]),
    csiPrimeCode: get(["CSI Prime Code", "CSI Prime", "CSI 2", "csiPrimeCode"]),
    // "CSI (Detail) Code" — parenthesis in the header means we need the exact alias
    csiDetailCode: get(["CSI Detail Code", "CSI Detail", "CSI (Detail) Code", "CSI 6", "csiDetailCode"]),
    // "LType (U/C)" — shorthand used in the Field Tracker spreadsheet
    locationTypeCode: get([
      "Location Type", "LType (U/C)", "LType", "Loc. Type", "Loc Type",
      "Loc. Typ", "Location Typ", "Location", "Loc", "locationTypeCode",
    ]),
    // "Cost Type (L/S)" — handled by the prefix fallback ("Cost Type" prefix matches)
    costTypeCode: get([
      "Cost Type", "Cost Typ", "Cost Cd", "Cost Code", "Cost",
      "costTypeCode",
    ]),
    installerCode: get([
      "Installer", "Install Team", "Install", "Subcontractor", "Sub",
      "installerCode",
    ]),
    qty: parseDecimal(get(["QTY", "Qty", "Quantity"])),
    uomCode: get(["UOM", "U/M", "Unit of Measure"]),
    unitRate: parseDecimal(get(["Unit Rate", "Unit Rt", "Rate"])),
    // "Budgeted MH" — Field Tracker shorthand for Budgeted Man Hours
    budgetedManHours: parseDecimal(get(["Budgeted Man Hours", "Budgeted MH", "Budget MH", "Budget Man Hrs", "Budgeted Hrs", "BudgetedManHours"])),
    // "Start" / "Finish" — Field Tracker uses short column names
    startDate: parseDate(get(["Start Date", "Start Dt", "Start", "StartDate"])),
    finishDate: parseDate(get(["Finish Date", "Finish Dt", "Finish", "End Date", "FinishDate"])),
    // "% Complete" — Field Tracker uses percentage symbol notation
    percentComplete: parseDecimal(get(["Percent Complete", "% Complete", "Pct Complete", "PercentComplete"])),
    // "Actual MH" — Field Tracker shorthand for Actual Man Hours
    actualManHours: parseDecimal(get(["Actual Man Hours", "Actual MH", "Actual Hrs", "Actual Man Hrs", "ActualManHours"])),
  };
}

export type TxClient = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>;
};

async function upsertLookup(
  tx: TxClient,
  table: "scope_types" | "location_types" | "cost_types" | "install_teams" | "uom_types",
  code: string
): Promise<string | null> {
  if (!code.trim()) return null;
  const rows = await tx.$queryRawUnsafe<[{ id: string }]>(
    `INSERT INTO "${table}" (id, code, name) VALUES (gen_random_uuid()::text, $1, $2)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    code,
    code
  );
  return rows[0]?.id ?? null;
}

export interface UnlinkedScopeType {
  id: string;
  rawCode: string;
}

export interface InsertProjectRowsResult {
  /** Scope types from this upload that have no canonical_scope_type_id set.
   * Non-empty when a spreadsheet contains a scope value that hasn't been
   * linked to an official canonical scope yet. The upload is committed but
   * the caller should surface a linking prompt to the user. */
  unlinkedScopeTypes: UnlinkedScopeType[];
}

/** Insert project rows. Rows use spreadsheet column names (Building, Level, etc.). */
export async function insertProjectRows(
  tx: TxClient,
  projectId: string,
  rows: Record<string, string>[],
  startRowIndex: number
): Promise<InsertProjectRowsResult> {
  type LookupTable = "scope_types" | "location_types" | "cost_types" | "install_teams" | "uom_types";
  const lookupCache: Record<LookupTable, Record<string, string | null>> = {
    scope_types: {},
    location_types: {},
    cost_types: {},
    install_teams: {},
    uom_types: {},
  };

  const getLookupId = async (
    table: LookupTable,
    code: string
  ): Promise<string | null> => {
    if (!code.trim()) return null;
    const cache = lookupCache[table];
    if (cache[code] !== undefined) return cache[code];
    const id = await upsertLookup(tx, table, code);
    cache[code] = id;
    return id;
  };

  const BATCH = 50;
  for (let offset = 0; offset < rows.length; offset += BATCH) {
    const batch = rows.slice(offset, offset + BATCH);
    const resolved: Array<ReturnType<typeof mapRowToColumns> & {
      scopeTypeId: string | null;
      locationTypeId: string | null;
      costTypeId: string | null;
      installerId: string | null;
      uomId: string | null;
    }> = [];

    for (const row of batch) {
      const c = mapRowToColumns(row);
      resolved.push({
        ...c,
        scopeTypeId: await getLookupId("scope_types", c.scopeTypeCode),
        locationTypeId: await getLookupId("location_types", c.locationTypeCode),
        costTypeId: await getLookupId("cost_types", c.costTypeCode),
        installerId: await getLookupId("install_teams", c.installerCode),
        uomId: await getLookupId("uom_types", c.uomCode),
      });
    }

    const COLS_PER_ROW = 26;
    const cols = [
      "id", "projectId", "rowIndex",
      "building", "level", "unit", "area", "shipPhase", "buildPhase", "scheme",
      "unitType", "description", "scopeTypeId", "csiPrimeCode", "csiDetailCode",
      "locationTypeId", "costTypeId", "installerId", "qty", "uomId",
      "unitRate", "budgetedManHours", "startDate", "finishDate",
      "percentComplete", "actualManHours", "createdAt", "updatedAt",
    ];
    const placeholders: string[] = [];
    const values: unknown[] = [];
    resolved.forEach((r, i) => {
      const id = randomUUID().replace(/-/g, "").slice(0, 25);
      const base = i * COLS_PER_ROW;
      const rowIdx = startRowIndex + offset + i;
      values.push(
        id, projectId, rowIdx,
        r.building, r.level, r.unit, r.area, r.shipPhase, r.buildPhase, r.scheme,
        r.unitType, r.description, r.scopeTypeId, r.csiPrimeCode, r.csiDetailCode,
        r.locationTypeId, r.costTypeId, r.installerId, r.qty, r.uomId,
        r.unitRate, r.budgetedManHours, r.startDate, r.finishDate,
        r.percentComplete, r.actualManHours
      );
      const ph = Array.from({ length: COLS_PER_ROW }, (_, j) => `$${base + j + 1}`).join(", ");
      placeholders.push(`(${ph}, NOW(), NOW())`);
    });

    const colList = cols.map((c) => `"${c}"`).join(", ");
    await tx.$executeRawUnsafe(
      `INSERT INTO project_rows (${colList}) VALUES ${placeholders.join(", ")}`,
      ...values
    );
  }

  // After all rows are inserted, find any scope types from this upload
  // that have no canonical link — these need to be resolved by the user.
  const processedScopeCodes = Object.keys(lookupCache.scope_types).filter(
    (code) => code.trim() !== ""
  );

  let unlinkedScopeTypes: UnlinkedScopeType[] = [];
  if (processedScopeCodes.length > 0) {
    const ph = processedScopeCodes.map((_, i) => `$${i + 1}`).join(", ");
    unlinkedScopeTypes = await tx.$queryRawUnsafe<UnlinkedScopeType[]>(
      `SELECT id, code AS "rawCode" FROM scope_types WHERE code IN (${ph}) AND canonical_scope_type_id IS NULL`,
      ...processedScopeCodes
    );
  }

  return { unlinkedScopeTypes };
}

/** Build a row key for deduplication (building|level|unit, normalized). */
export function rowKey(row: Record<string, string>): string {
  const c = mapRowToColumns(row);
  const b = (c.building ?? "").trim().toLowerCase();
  const l = (c.level ?? "").trim().toLowerCase();
  const u = (c.unit ?? "").trim().toLowerCase();
  return `${b}|${l}|${u}`;
}
